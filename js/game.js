// ─── Save-file HMAC helpers ───────────────────────────────────────────────────

async function _signSave(jsonStr) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(SAVE_HMAC_KEY),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(jsonStr));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function _verifySave(jsonStr, sigB64) {
  const enc    = new TextEncoder();
  const key    = await crypto.subtle.importKey(
    'raw', enc.encode(SAVE_HMAC_KEY),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  const sigBuf = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));
  return crypto.subtle.verify('HMAC', key, sigBuf, enc.encode(jsonStr));
}

// ─── Game State ───────────────────────────────────────────────────────────────

class GameState {
  constructor() {
    this.stableName    = '';
    this.money         = GAME_CONFIG.STARTING_MONEY;
    this.currentWeek   = GAME_CONFIG.GAME_START_WEEK;
    this.horses        = [];
    this.conditionBook     = null;
    this.nextBookPreview   = null;  // cached preview of the upcoming condition book
    this.notifications     = [];
    this.raceResults       = [];
    this._auctionPool      = [];
    this._lastAuctionRefreshWeek = 0;
    this.recentRaceCombos  = {};
    // Breeders' Cup and Triple Crown race objects — generated per game year
    this.bcRaces       = [];
    this.tcRaces       = [];
    // Breeding farm
    this.retiredMares       = [];  // Horse objects retired to the farm
    this.foals              = [];  // FoalRecord objects (age 0–1, not yet in stable)
    this.foalsReadyToName   = [];  // Horse objects (age 2) awaiting naming before stable entry
  }

  // ── Auction ────────────────────────────────────────────────────────────────

  getAuctionHorses() {
    // Auto-refresh once per week (or on first load)
    if (this._auctionPool.length === 0 || this.currentWeek > this._lastAuctionRefreshWeek) {
      this.refreshAuction();
    }
    return this._auctionPool;
  }

  refreshAuction() {
    this._auctionPool = Array.from({ length: GAME_CONFIG.AUCTION_HORSE_COUNT },
      () => Horse.generate({ week: this.currentWeek }));
    this._lastAuctionRefreshWeek = this.currentWeek;
  }

  buyHorse(auctionHorse) {
    if (this.money < auctionHorse.auctionPrice)
      return { ok: false, msg: 'Insufficient funds.' };
    this.money -= auctionHorse.auctionPrice;
    this.horses.push(auctionHorse);
    this._auctionPool = this._auctionPool.filter(h => h.id !== auctionHorse.id);
    this.notify(`Purchased ${auctionHorse.name} for ${formatMoney(auctionHorse.auctionPrice)}.`, 'success');
    return { ok: true };
  }

  // ── Condition Book ─────────────────────────────────────────────────────────

  getConditionBook() {
    if (!this.conditionBook || this.currentWeek > this.conditionBook.endWeek) {
      const start = this.currentWeek % 2 === 1 ? this.currentWeek : this.currentWeek - 1;
      // Promote the cached preview if it covers this period, otherwise generate fresh
      if (this.nextBookPreview && this.nextBookPreview.startWeek === start) {
        this.conditionBook = this.nextBookPreview;
      } else {
        this.conditionBook = generateConditionBook(start, this.recentRaceCombos);
      }
      this._updateRecentCombos(this.conditionBook);
      this.nextBookPreview = null;
    }
    return this.conditionBook;
  }

  // Record each race's combo key from a completed book so the next book's
  // generator can avoid repeating the same type+surface+sex+age+distCategory.
  // Lock expires after the immediately following book period (endWeek + 2).
  _updateRecentCombos(book) {
    this.recentRaceCombos = {};
    for (const day of book.raceDays) {
      if (day.dark) continue;
      for (const race of day.races) {
        if (race.isStakes) continue;  // Stakes are fixed annual events — no combo tracking
        const sprintCutoff = race.surface === 'turf' ? 6.5 : 7;
        const distCategory = race.distance <= sprintCutoff ? 'sprint' : 'route';
        const key = `${race.trackId}-${race.raceTypeId}-${race.surface}-${distCategory}-${race.sexRestriction}-${race.ageDivision}`;
        this.recentRaceCombos[key] = book.endWeek + 2;
      }
    }
  }

  // ── Breeders' Cup & Triple Crown ───────────────────────────────────────────

  // Returns (and lazily generates) the race objects for a given special circuit
  // for the current game year. Race objects persist across weeks; they are
  // regenerated fresh whenever the game year advances past them.
  getSpecialRaces(type) {
    const schedule = type === 'bc' ? BREEDERS_CUP_SCHEDULE : TRIPLE_CROWN_SCHEDULE;
    const stored   = type === 'bc' ? this.bcRaces          : this.tcRaces;
    const gameYear = Math.ceil(this.currentWeek / GAME_CONFIG.WEEKS_PER_YEAR);

    // Return cache if it matches this year
    if (stored.length > 0 && stored[0]._gameYear === gameYear) return stored;

    // Build fresh race objects for this game year
    const newRaces = schedule.map(s => {
      const absWeek = (gameYear - 1) * GAME_CONFIG.WEEKS_PER_YEAR + s.weekNumber;
      return {
        id:                    uid(),
        _gameYear:             gameYear,
        _circuit:              type,
        raceTypeId:            'STAKES',
        name:                  s.name,
        shortName:             s.name,
        purse:                 s.purse,
        entryFee:              Math.round(s.purse * 0.015),
        claimingPrice:         null,
        optionalClaimingPrice: null,
        eligibility:           'open',
        fieldStrength:         { spMin: s.difficulty - 7, spMax: s.difficulty + 5 },
        surface:               s.surface,
        distance:              s.distance,
        ageDivision:           s.ageDivision,
        sexRestriction:        s.sexRestriction,
        division:              formatDivision(s.ageDivision, s.sexRestriction),
        baseDifficulty:        s.difficulty,
        grade:                 s.grade,
        isStakes:              true,
        fixedFieldSize:        s.fixedFieldSize         ?? null,
        requiresQualification: s.requiresQualification  ?? null,
        trackId:               s.trackId,
        trackName:             s.trackName,
        weekNumber:            absWeek,
        dayLabel:              s.dayLabel,
        playerEntry:           null,
      };
    });

    if (type === 'bc') this.bcRaces = newRaces;
    else               this.tcRaces = newRaces;
    return newRaces;
  }

  // Find a race in the BC or TC pools by ID
  _findSpecialRace(raceId) {
    for (const race of this.bcRaces) if (race.id === raceId) return { race, circuit: 'bc' };
    for (const race of this.tcRaces) if (race.id === raceId) return { race, circuit: 'tc' };
    return null;
  }

  // Enter a horse in a BC/TC race — separate entry rules from the condition book
  _enterSpecialRace(horse, race, circuit) {
    if (race.playerEntry?.ran)
      return { ok: false, msg: 'This race has already been run.' };
    if (race.playerEntry)
      return { ok: false, msg: `${horse.name} is already entered in this race.` };
    if (race.weekNumber < this.currentWeek)
      return { ok: false, msg: 'This race has already passed.' };
    if (race.weekNumber > this.currentWeek + 2)
      return { ok: false, msg: `Entries for ${race.name} are not yet open — entry opens 2 weeks before race day.` };
    if (!horse.qualifiesAgeAndSex(race.ageDivision, race.sexRestriction))
      return { ok: false, msg: `${horse.name} does not meet the age/sex requirements for this race.` };
    if (race.requiresQualification === 'kentucky_derby' && !horse.isKentuckyDerbyEligible)
      return { ok: false, msg: `${horse.name} has not qualified for the Kentucky Derby. Finish top 3 in the San Felipe Stakes or Santa Anita Derby.` };
    if (horse.injured)
      return { ok: false, msg: `${horse.name} is injured and cannot race.` };
    if (this.money < race.entryFee && race.entryFee > 0)
      return { ok: false, msg: 'Insufficient funds for entry fee.' };
    // Prevent entering multiple special events simultaneously
    const allSpecial = [...this.bcRaces, ...this.tcRaces];
    if (allSpecial.some(r => r.id !== race.id && r.playerEntry?.horseId === horse.id && !r.playerEntry?.ran))
      return { ok: false, msg: `${horse.name} is already entered in another special event.` };

    this.money -= race.entryFee;
    race.playerEntry = { horseId: horse.id, effectiveClaimingPrice: null };

    const circuitLabel = circuit === 'bc' ? "Breeders' Cup" : 'Triple Crown';
    this.notify(
      `${horse.name} entered in ${race.name} (${race.distance}f ${race.surface}) — ${formatWeekLabel(race.weekNumber)}. [${circuitLabel}]`,
      'info'
    );
    return { ok: true };
  }

  // ── Breeding Farm ──────────────────────────────────────────────────────────

  retireMare(horseId) {
    const idx = this.horses.findIndex(h => h.id === horseId);
    if (idx === -1) return { ok: false, msg: 'Horse not found.' };
    const mare = this.horses[idx];
    if (mare.sex !== 'filly' && mare.sex !== 'mare')
      return { ok: false, msg: 'Only fillies and mares can be retired to the breeding farm.' };
    mare.pensionAge = rand(22, 30);
    mare.breedingStatus = 'open';
    this.horses.splice(idx, 1);
    this.retiredMares.push(mare);
    this.notify(`${mare.name} has been retired to the breeding farm.`, 'info');
    return { ok: true };
  }

  breedMare(mareId, stallionName) {
    const mare     = this.retiredMares.find(m => m.id === mareId);
    const stallion = STALLIONS.find(s => s.name === stallionName);
    if (!mare || !stallion) return { ok: false, msg: 'Invalid mare or stallion.' };

    const wis = weekInSeason(this.currentWeek);
    if (wis < 3 || wis > 24)
      return { ok: false, msg: 'Breeding is only allowed between mid-January and mid-June.' };
    if (mare.pensionedFromBreeding)
      return { ok: false, msg: `${mare.name} has been pensioned and can no longer breed.` };
    if (mare.breedingStatus === 'pregnant')
      return { ok: false, msg: `${mare.name} is already in foal.` };
    if (mare.breedingStatus === 'failed_conception')
      return { ok: false, msg: `${mare.name} was unable to conceive this year and cannot try again until next year.` };
    if (this.money < stallion.studFee)
      return { ok: false, msg: `Insufficient funds. Stud fee is ${formatMoney(stallion.studFee)}.` };

    this.money -= stallion.studFee;
    const gameYear = Math.ceil(this.currentWeek / GAME_CONFIG.WEEKS_PER_YEAR);

    if (Math.random() < 0.90) {
      // Successful conception
      mare.breedingStatus   = 'pregnant';
      mare.breedingYear     = gameYear;
      mare.sireAtCover      = stallionName;
      mare.coverWeek        = this.currentWeek;
      mare.expectedFoalWeek = this.currentWeek + 51;
      this.notify(`${mare.name} has been covered by ${stallionName} and is in foal!`, 'success');
      return { ok: true, conceived: true };
    } else {
      // Failed conception — stud fee refunded
      this.money += stallion.studFee;
      mare.breedingStatus = 'failed_conception';
      mare.breedingYear   = gameYear;
      this.notify(`${mare.name} was covered by ${stallionName} but did not conceive. Stud fee of ${formatMoney(stallion.studFee)} refunded.`, 'warning');
      return { ok: true, conceived: false };
    }
  }

  _generateFoal(mare, stallion) {
    const gameYear = Math.ceil(this.currentWeek / GAME_CONFIG.WEEKS_PER_YEAR);

    // Speed: rand(lower, upper) − 12, floored at 5
    const mareLow = mare.speed - 5;
    const spd = Math.max(5,
      (stallion.speed >= mareLow
        ? rand(mareLow, stallion.speed)
        : rand(stallion.speed, mareLow)) - 12
    );

    // Surface: 70% sire's preference, 30% randomly one of the other two
    const sireSurf = stallion.surface;
    const otherSurfaces = ['dirt', 'turf', 'both'].filter(s => s !== sireSurf);
    const surface = Math.random() < 0.70 ? sireSurf : otherSurfaces[rand(0, 1)];

    return {
      id:              uid(),
      name:            `Y${gameYear}-${mare.name}`,
      damId:           mare.id,
      damName:         mare.name,
      sire:            stallion.name,
      sex:             Math.random() < 0.50 ? 'colt' : 'filly',
      age:             0,
      coat:            randomCoat(),
      speed:           spd,
      startSpeed:      spd,
      stamina:         rand(10, 20),
      potential:       rand(0, 15),
      confidence:      rand(3, 8),
      consistency:     rand(2, 8),
      preferredSurface: surface,
      birthWeek:       this.currentWeek,
      birthYear:       gameYear,
    };
  }

  // ── Enter a Race ───────────────────────────────────────────────────────────

  enterRace(horseId, raceId, claimingElection = false) {
    const horse = this.horses.find(h => h.id === horseId);
    if (!horse) return { ok: false, msg: 'Invalid horse.' };

    // Route Breeders' Cup / Triple Crown races
    const special = this._findSpecialRace(raceId);
    if (special) return this._enterSpecialRace(horse, special.race, special.circuit);

    const book = this.conditionBook;
    if (!book) return { ok: false, msg: 'No condition book loaded.' };

    let targetRace = null;
    for (const day of book.raceDays) {
      for (const race of day.races) {
        if (race.id === raceId) { targetRace = race; break; }
      }
      if (targetRace) break;
    }
    if (!targetRace) return { ok: false, msg: 'Race not found.' };
    if (targetRace.weekNumber < this.currentWeek)
      return { ok: false, msg: 'That race has already passed.' };

    // Eligibility — three paths: stakes (age/sex only), AOC, or standard.
    if (targetRace.isStakes) {
      if (!horse.qualifiesAgeAndSex(targetRace.ageDivision, targetRace.sexRestriction))
        return { ok: false, msg: `${horse.name} does not meet the age/sex requirements for this stakes race.` };
    } else {
      // AOC races allow non-N1X horses to enter by running for the optional claiming price.
      // N1X-eligible horses may choose with or without the tag.
      const isAOC = !!targetRace.optionalClaimingPrice;
      if (isAOC) {
        if (!horse.qualifiesAgeAndSex(targetRace.ageDivision, targetRace.sexRestriction))
          return { ok: false, msg: `${horse.name} does not meet the age/sex requirements for this race.` };
        if (!horse.isN1XEligible && !claimingElection)
          return { ok: false, msg: `${horse.name} must run for the ${formatMoney(targetRace.optionalClaimingPrice)} claiming price to enter this race.` };
      } else {
        if (!horse.qualifiesFor(targetRace.raceTypeId, targetRace.ageDivision, targetRace.sexRestriction))
          return { ok: false, msg: `${horse.name} does not meet the eligibility requirements for this race.` };
      }
    }

    if (horse.injured)
      return { ok: false, msg: `${horse.name} is injured and cannot race.` };
    if (horse.fatigue >= 70)
      return { ok: false, msg: `${horse.name} is too fatigued to race right now.` };
    if (horse.weeksSinceRace < GAME_CONFIG.WEEKS_BETWEEN_RACES) {
      const weeksLeft = GAME_CONFIG.WEEKS_BETWEEN_RACES - horse.weeksSinceRace;
      return { ok: false, msg: `${horse.name} needs ${weeksLeft} more week${weeksLeft !== 1 ? 's' : ''} before racing again.` };
    }
    if (this.money < targetRace.entryFee)
      return { ok: false, msg: 'Insufficient funds for entry fee.' };

    // One race per horse per condition book period
    const alreadyEntered = book.raceDays.some(day =>
      day.races.some(r => r.playerEntry?.horseId === horseId && r.id !== raceId));
    if (alreadyEntered)
      return { ok: false, msg: `${horse.name} is already entered in a race this period.` };

    this.money -= targetRace.entryFee;

    // Resolve effective claiming price: mandatory claiming races always claim;
    // AOC races only claim if the player elected to run for the tag.
    const effectiveClaimingPrice = targetRace.claimingPrice ||
      (claimingElection && targetRace.optionalClaimingPrice ? targetRace.optionalClaimingPrice : null);

    targetRace.playerEntry = { horseId, claimingElection, effectiveClaimingPrice };

    const claimNote = effectiveClaimingPrice ? ` · claiming ${formatMoney(effectiveClaimingPrice)}` : '';
    this.notify(
      `${horse.name} entered in ${targetRace.name} (${targetRace.distance}f ${targetRace.surface} · ${targetRace.division}${claimNote}) — Week ${targetRace.weekNumber}.`,
      'info'
    );
    return { ok: true };
  }

  // ── Run a Race ─────────────────────────────────────────────────────────────

  runRace(raceId, precomputedResults = null) {
    const book = this.conditionBook;

    let targetRace = null;

    // Search condition book first
    if (book) {
      for (const day of book.raceDays) {
        for (const race of day.races) {
          if (race.id === raceId) { targetRace = race; break; }
        }
        if (targetRace) break;
      }
    }

    // Fall back to BC/TC special races
    if (!targetRace) {
      const special = this._findSpecialRace(raceId);
      if (special) targetRace = special.race;
    }

    if (!targetRace || !targetRace.playerEntry) return null;

    const horse = this.horses.find(h => h.id === targetRace.playerEntry.horseId);
    if (!horse) return null;

    const results      = precomputedResults || simulateRace(horse, targetRace);
    const playerResult = results.find(r => r.isPlayer);

    const earned = horse.applyRaceResult(playerResult.position, targetRace.purse, targetRace.raceTypeId, targetRace.distance, targetRace.surface);
    horse.raceHistory[0].week = this.currentWeek;
    if (targetRace.isStakes) {
      horse.raceHistory[0].stakesName  = targetRace.name;
      horse.raceHistory[0].stakesGrade = targetRace.grade;
      horse.raceHistory[0].stakesPurse = targetRace.purse;
    }
    this.money += earned;

    // Jockey notes about surface / distance fit
    const notes = computeJockeyNotes(horse, targetRace);
    notes.forEach(n => {
      horse.jockeyNotes.unshift({ ...n, week: this.currentWeek });
    });
    if (horse.jockeyNotes.length > 10) horse.jockeyNotes = horse.jockeyNotes.slice(0, 10);

    // Claiming — use the effective price resolved at entry time (covers both
    // mandatory claiming races and AOC races where the player elected the tag).
    let horseClaimed = false;
    if (playerResult.claimed) {
      horseClaimed      = true;
      const claimPrice  = targetRace.playerEntry.effectiveClaimingPrice || targetRace.claimingPrice || 0;
      this.money       += claimPrice;
      this.horses       = this.horses.filter(h => h.id !== horse.id);
      this.notify(`${horse.name} was claimed for ${formatMoney(claimPrice)}!`, 'warning');
    }

    const summary = {
      race: targetRace, results,
      playerPosition: playerResult.position,
      playerEarned: earned, horseClaimed,
      week: this.currentWeek
    };
    this.raceResults.unshift(summary);
    if (this.raceResults.length > 50) this.raceResults.pop();

    const places   = ['1st','2nd','3rd','4th','5th'];
    const posLabel = places[playerResult.position - 1] ?? `${playerResult.position}th`;
    const earningStr = earned > 0 ? ` and earned ${formatMoney(earned)}` : '';
    this.notify(
      `${horse.name} finished ${posLabel}${earningStr} in the ${targetRace.name}.`,
      playerResult.position === 1 ? 'success' : 'info'
    );

    targetRace.playerEntry.ran = true;
    return summary;
  }

  // ── Week Advancement ───────────────────────────────────────────────────────

  advanceWeek() {
    this.currentWeek++;

    // Annual aging — fires on week 1 of each new year (Jan 1 birthday rule).
    if (weekInSeason(this.currentWeek) === 1) {
      this.horses.forEach(h => h.age++);

      // Age retired mares; reset failed_conception; check pension threshold
      this.retiredMares.forEach(m => {
        m.age++;
        if (m.breedingStatus === 'failed_conception') m.breedingStatus = 'open';
        if (!m.pensionedFromBreeding && m.pensionAge !== null && m.age >= m.pensionAge) {
          m.pensionedFromBreeding = true;
          this.notify(`${m.name} (age ${m.age}) has been pensioned from breeding due to health.`, 'warning');
        }
      });

      // Age foals; promote any that just turned 2 to the naming queue
      const promoted = [];
      this.foals = this.foals.filter(f => {
        f.age++;
        if (f.age >= 2) { promoted.push(f); return false; }
        return true;
      });
      promoted.forEach(f => {
        const horse = new Horse({
          id: f.id, name: f.name, age: 2,
          sex: f.sex, coat: f.coat,
          speed: f.speed, startSpeed: f.startSpeed,
          stamina: f.stamina, potential: f.potential,
          confidence: f.confidence, consistency: f.consistency,
          preferredSurface: f.preferredSurface,
          fatigue: 0,
          jockey: randomJockey(),
          clothColor: CLOTH_COLORS[rand(0, CLOTH_COLORS.length - 1)],
          sire: f.sire, dam: f.damName,
        });
        this.foalsReadyToName.push(horse);
      });
    }

    let trainTotal = 0, vetTotal = 0;
    this.horses.forEach(() => {
      trainTotal += rand(GAME_CONFIG.TRAINING_COST_MIN, GAME_CONFIG.TRAINING_COST_MAX);
      vetTotal   += rand(GAME_CONFIG.VET_COST_MIN,      GAME_CONFIG.VET_COST_MAX);
    });
    this.money -= trainTotal + vetTotal;
    if (this.horses.length > 0) {
      const n = this.horses.length;
      this.notify(
        `Training fees: ${formatMoney(trainTotal)} for ${n} horse${n !== 1 ? 's' : ''}.`,
        'cost'
      );
      this.notify(`Veterinary fees: ${formatMoney(vetTotal)}.`, 'cost');
    }

    // Farm upkeep — active (non-pensioned) mares $300–400/wk, foals $200–300/wk
    const activeMares = this.retiredMares.filter(m => !m.pensionedFromBreeding);
    let farmTotal = 0;
    activeMares.forEach(() => { farmTotal += rand(300, 400); });
    this.foals.forEach(()  => { farmTotal += rand(200, 300); });
    if (farmTotal > 0) {
      this.money -= farmTotal;
      const parts = [];
      if (activeMares.length > 0) parts.push(`${activeMares.length} mare${activeMares.length !== 1 ? 's' : ''}`);
      if (this.foals.length > 0)  parts.push(`${this.foals.length} foal${this.foals.length !== 1 ? 's' : ''}`);
      this.notify(`Farm upkeep: ${formatMoney(farmTotal)} (${parts.join(', ')}).`, 'cost');
    }

    this.horses.forEach(h => {
      h.advanceWeek(this.currentWeek);
      if (h.injured) {
        this.notify(
          `${h.name} is injured — ${h.injuryWeeksLeft} week${h.injuryWeeksLeft !== 1 ? 's' : ''} remaining.`,
          'warning'
        );
      }
    });

    // Foal birth checks — fires the week expectedFoalWeek is reached
    this.retiredMares.forEach(mare => {
      if (mare.breedingStatus !== 'pregnant' || this.currentWeek < mare.expectedFoalWeek) return;
      const stallion = STALLIONS.find(s => s.name === mare.sireAtCover);
      if (Math.random() < 0.90) {
        const foal = this._generateFoal(mare, stallion);
        this.foals.push(foal);
        mare.foalIds.push(foal.id);
        mare.breedingStatus   = 'open';
        mare.sireAtCover      = null;
        mare.coverWeek        = null;
        mare.expectedFoalWeek = null;
        this.notify(`🎉 ${mare.name} delivered a healthy ${foal.sex} by ${foal.sire}!`, 'success');
      } else {
        const refund = stallion ? stallion.studFee : 0;
        this.money += refund;
        mare.breedingStatus   = 'open';
        mare.sireAtCover      = null;
        mare.coverWeek        = null;
        mare.expectedFoalWeek = null;
        this.notify(
          `${mare.name}'s foal was not born successfully.${refund > 0 ? ` Stud fee of ${formatMoney(refund)} refunded.` : ''}`,
          'warning'
        );
      }
    });

    this.getConditionBook();
    return { week: this.currentWeek, trainTotal, vetTotal };
  }

  // ── Upcoming entries ───────────────────────────────────────────────────────

  getUpcomingEntries() {
    const entries = [];
    // Condition book entries
    if (this.conditionBook) {
      for (const day of this.conditionBook.raceDays) {
        for (const race of day.races) {
          if (race.playerEntry && !race.playerEntry.ran) {
            const horse = this.horses.find(h => h.id === race.playerEntry.horseId);
            entries.push({ race, horse });
          }
        }
      }
    }
    // BC/TC special race entries
    for (const race of [...this.bcRaces, ...this.tcRaces]) {
      if (race.playerEntry && !race.playerEntry.ran) {
        const horse = this.horses.find(h => h.id === race.playerEntry.horseId);
        entries.push({ race, horse });
      }
    }
    // Sort ascending by absolute week
    entries.sort((a, b) => a.race.weekNumber - b.race.weekNumber);
    return entries;
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  notify(text, type = 'info') {
    this.notifications.unshift({ week: this.currentWeek, text, type });
    if (this.notifications.length > 30) this.notifications.pop();
  }

  // ── Save / Load ────────────────────────────────────────────────────────────

  async saveToFile() {
    const inner = JSON.stringify(this.toJSON(), null, 2);
    const sig   = await _signSave(inner);
    const blob  = new Blob(
      [JSON.stringify({ _sig: sig, _data: inner }, null, 2)],
      { type: 'application/json' }
    );
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `simthoroughbred_week${this.currentWeek}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async saveToLocal() {
    try {
      const inner = JSON.stringify(this.toJSON());
      const sig   = await _signSave(inner);
      localStorage.setItem('simthoroughbred_autosave',
        JSON.stringify({ _sig: sig, _data: inner }));
    } catch(e) {}
  }

  toJSON() {
    return {
      _version: 4,
      stableName: this.stableName,
      money: this.money,
      currentWeek: this.currentWeek,
      horses: this.horses.map(h => h.toJSON()),
      conditionBook: this.conditionBook,
      nextBookPreview: this.nextBookPreview,
      notifications: this.notifications.slice(0, 20),
      raceResults: this.raceResults.slice(0, 10),
      _auctionPool: this._auctionPool.map(h => h.toJSON()),
      _lastAuctionRefreshWeek: this._lastAuctionRefreshWeek,
      recentRaceCombos: this.recentRaceCombos,
      bcRaces: this.bcRaces,
      tcRaces: this.tcRaces,
      retiredMares:     this.retiredMares.map(h => h.toJSON()),
      foals:            this.foals,
      foalsReadyToName: this.foalsReadyToName.map(h => h.toJSON()),
    };
  }

  static fromJSON(d) {
    if (!d || ![1, 2, 3, 4].includes(d._version))
      throw new Error('Invalid save file.');
    const g = new GameState();
    g.stableName        = d.stableName || '';
    g.money             = d.money;
    g.currentWeek       = d.currentWeek;
    g.horses            = (d.horses || []).map(h => Horse.fromJSON(h));
    g.conditionBook     = d.conditionBook   || null;
    g.nextBookPreview   = d.nextBookPreview || null;
    g.notifications     = d.notifications || [];
    g.raceResults       = d.raceResults || [];
    g._auctionPool             = (d._auctionPool || []).map(h => Horse.fromJSON(h));
    g._lastAuctionRefreshWeek  = d._lastAuctionRefreshWeek ?? 0;
    g.recentRaceCombos         = d.recentRaceCombos || {};
    g.bcRaces                  = d.bcRaces || [];
    g.tcRaces                  = d.tcRaces || [];
    g.retiredMares             = (d.retiredMares     || []).map(h => Horse.fromJSON(h));
    g.foals                    = d.foals             || [];
    g.foalsReadyToName         = (d.foalsReadyToName || []).map(h => Horse.fromJSON(h));
    return g;
  }

  // Parse and verify a raw save string (from file or localStorage).
  // Accepts the new signed format { _sig, _data } and legacy unsigned saves.
  // Throws if the signature exists but is invalid.
  static async loadFromBlob(raw) {
    const outer = JSON.parse(raw);
    if (outer._sig && outer._data) {
      const ok = await _verifySave(outer._data, outer._sig);
      if (!ok) throw new Error('Save file signature is invalid — the file may have been modified.');
      return GameState.fromJSON(JSON.parse(outer._data));
    }
    // Legacy unsigned save — accept without verification
    return GameState.fromJSON(outer);
  }

  static async loadFromLocal() {
    try {
      const raw = localStorage.getItem('simthoroughbred_autosave');
      if (!raw) return null;
      return await GameState.loadFromBlob(raw);
    } catch(e) { return null; }
  }
}
