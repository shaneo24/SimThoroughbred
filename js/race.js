// ─── Race simulation & Condition Book generation ──────────────────────────────

// ── Win probability table (speed - difficulty delta → P(win)) ─────────────────
function getWinProbability(delta) {
  const clamped = Math.max(-7, Math.min(6, Math.round(delta)));
  const TABLE = {
     6: 0.95,
     5: 0.90,
     4: 0.85,
     3: 0.75,  
     2: 0.65,  
     1: 0.55,  
     0: 0.45,   
    '-1': 0.35, 
    '-2': 0.25,
    '-3': 0.21, 
    '-4': 0.17, 
    '-5': 0.13, 
    '-6': 0.09, 
    '-7': 0.05  // ≤ −7: 5%
  };
  return TABLE[String(clamped)] ?? 0.050;
}

// ── Effective speed ───────────────────────────────────────────────────────────
// Applies all per-race modifiers to produce the adjusted speed used vs. difficulty
function calculateEffectiveSpeed(horse, distance, surface) {
  let spd = horse.speed;

  // Win streak buff — scales with confidence; cannot stack
  // (confidence + rand(0,10)) / 10 → min 0, avg ~1, max 2
  if (horse.wonLastRace) spd += (horse.confidence + rand(0, 10)) / 10;

  // Consistency roll
  const cons = horse.consistency;
  let cRoll;
  if (cons >= 8)      cRoll = rand(0, 1);    // 0 to +1
  else if (cons >= 4) cRoll = rand(-1, 1);   // −1 to +1
  else                cRoll = rand(-3, 1);   // −3 to +1
  spd += cRoll;

  // Fatigue penalty — low fatigue has no effect; high fatigue = up to −8
  // Formula: max(0, (fatigue − 20) / 50 × 8), capped at 8
  const fatiguePenalty = Math.round(Math.max(0, Math.min(8, (horse.fatigue - 20) / 50 * 8)));
  spd -= fatiguePenalty;

  // Stamina / distance fit  (ideal distance = stamina / 2)
  const idealDist = horse.stamina / 2;
  const diff      = Math.abs(distance - idealDist);
  if      (diff > 3) spd -= 6;
  else if (diff > 2) spd -= 4;
  else if (diff > 1) spd -= 2;
  // 0–1f from ideal: no penalty

  // Surface preference
  if (horse.preferredSurface !== 'both' && horse.preferredSurface !== surface) {
    spd -= rand(2, 7);
  }

  return spd;
}

// ── Claim probability table ───────────────────────────────────────────────────
// Based on horse.speed minus actual race difficulty (raw speed, not effective speed).
// Maiden claiming races use a reduced table — horses in those fields are less coveted.
function getClaimProbability(diff, isMaidenClaim = false) {
  if (isMaidenClaim) {
    if (diff >= 8) return 0.60;
    if (diff >= 7) return 0.50;
    if (diff >= 6) return 0.40;
    if (diff >= 5) return 0.30;
    if (diff >= 4) return 0.20;
    if (diff >= 3) return 0.10;
    return 0.05;
  }
  if (diff >= 8) return 0.80;
  if (diff >= 7) return 0.70;
  if (diff >= 6) return 0.60;
  if (diff >= 5) return 0.50;
  if (diff >= 4) return 0.40;
  if (diff >= 3) return 0.30;
  if (diff >= 2) return 0.20;
  return 0.05;
}

// ── Finishing position when player does not win ───────────────────────────────
function determineFinishPosition(delta, fieldSize) {
  // Weighted buckets: [2nd%, 3rd%, 4th%, 5th+%]
  let w2, w3, w4, wRest;
  if      (delta >= 4)  { [w2, w3, w4, wRest] = [80, 10, 5, 5]; }
  else if (delta == 3)  { [w2, w3, w4, wRest] = [70, 10, 10, 10]; }
  else if (delta == 2)  { [w2, w3, w4, wRest] = [60, 15, 15, 10]; }
  else if (delta == 1)  { [w2, w3, w4, wRest] = [40, 20, 20, 20]; }
  else if (delta == 0)  { [w2, w3, w4, wRest] = [35, 20, 20, 25]; }
  else if (delta == -1)  { [w2, w3, w4, wRest] = [25, 25, 20, 30]; }
  else if (delta == -2) { [w2, w3, w4, wRest] = [15, 15, 30, 40]; }
  else if (delta == -3) { [w2, w3, w4, wRest] = [10, 10, 20, 60]; }
  else if (delta == -4) { [w2, w3, w4, wRest] = [5, 10, 15, 70]; }
  else if (delta == -5) { [w2, w3, w4, wRest] = [5, 5, 15, 75]; }
  else if (delta == -6) { [w2, w3, w4, wRest] = [5, 5, 10, 80]; }
  else                  { [w2, w3, w4, wRest] = [5, 5, 5, 85]; }

  const r = Math.random() * 100;
  if (r < w2)              return 2;
  if (r < w2 + w3)         return 3;
  if (r < w2 + w3 + w4)   return 4;
  return rand(5, Math.min(fieldSize + 1, 10));
}

// ── Main simulation ───────────────────────────────────────────────────────────
// race must have: { raceTypeId, distance, surface, baseDifficulty }
// Returns results array sorted by position: [{ horse, isPlayer, position, claimed }]
function simulateRace(playerHorse, race) {
  // Randomise difficulty ±1 for stakes (fixed, prestige events), ±2 for regular races
  const actualDifficulty = race.baseDifficulty + rand(race.isStakes ? -1 : -2, race.isStakes ? 1 : 2);

  // Player effective speed and delta
  const effectiveSpeed = calculateEffectiveSpeed(playerHorse, race.distance, race.surface);
  const delta          = effectiveSpeed - actualDifficulty;

  // Determine player position — fixedFieldSize used for Kentucky Derby (20-horse field)
  const fieldSize      = race.fixedFieldSize != null ? (race.fixedFieldSize - 1) : rand(5, 12);
  const playerWins     = Math.random() < getWinProbability(delta);
  const playerPosition = playerWins ? 1 : determineFinishPosition(delta, fieldSize);

  // Generate AI opponents — Kentucky Derby fixes the field at 20 (19 opponents + player)
  const opponents = Array.from({ length: fieldSize },
    () => Horse.generateOpponent(race.fieldStrength));

  // Ensure no two horses share a jockey — shuffle the full list, reserve the
  // player's jockey, then deal unique jockeys to opponents in order.
  const jockeyPool = [...JOCKEY_NAMES].filter(j => j !== playerHorse.jockey);
  shuffleArray(jockeyPool);
  opponents.forEach((h, i) => { h.jockey = jockeyPool[i % jockeyPool.length]; });

  // Assign every position except the player's to opponents randomly
  const otherPositions = Array.from({ length: fieldSize + 1 }, (_, i) => i + 1)
    .filter(p => p !== playerPosition);
  shuffleArray(otherPositions);

  const results = [
    { horse: playerHorse, isPlayer: true,  position: playerPosition, claimed: false, finalScore: effectiveSpeed },
    ...opponents.map((h, i) => ({ horse: h, isPlayer: false, position: otherPositions[i], claimed: false, finalScore: 0 }))
  ];

  results.sort((a, b) => a.position - b.position);

  // Claiming — based on raw speed vs actual difficulty (not effective speed).
  // For AOC races, only apply claiming if the player elected to run for the tag
  // (stored as effectiveClaimingPrice in playerEntry during enterRace).
  const activeClaimPrice = race.claimingPrice || race.playerEntry?.effectiveClaimingPrice || null;
  if (activeClaimPrice) {
    const pe             = results.find(e => e.isPlayer);
    const claimDiff      = playerHorse.speed - actualDifficulty;
    const isMaidenClaim  = race.eligibility === 'maiden';
    if (Math.random() < getClaimProbability(claimDiff, isMaidenClaim)) {
      pe.claimed = true;
    }
  }

  return results;
}

// ── Jockey observations ───────────────────────────────────────────────────────
// Called by game.js after a race to generate hints about surface / distance fit
function computeJockeyNotes(horse, race) {
  const notes = [];
  const idealDist  = horse.stamina / 2;
  const distDiff   = Math.abs(race.distance - idealDist);
  const wrongSurf  = horse.preferredSurface !== 'both' && horse.preferredSurface !== race.surface;

  if (wrongSurf) {
    notes.push({
      type: 'surface',
      text: `${horse.jockey} felt ${horse.name} was uncomfortable on the ${race.surface} — consider trying ${race.surface === 'dirt' ? 'turf' : 'dirt'}.`
    });
  }
  if (distDiff > 1) {
    const dir = race.distance > idealDist ? 'shorter' : 'longer';
    notes.push({
      type: 'distance',
      text: `${horse.jockey} thought ${horse.name} might prefer a ${dir} race than ${race.distance}f.`
    });
  }
  return notes;
}

// ── Condition Book generation ─────────────────────────────────────────────────
// Automatically selects the active track via the circuit schedule; dark weeks
// produce race days with no races. Adding a new circuit just means updating
// CIRCUIT_SCHEDULE and defining a new track config in data.js.
function generateConditionBook(startWeek, recentCombos) {
  recentCombos = recentCombos || {};

  const book = {
    id: uid(),
    startWeek,
    endWeek: startWeek + 1,
    raceDays: []
  };

  const isBefore_Jun1 = weekInSeason(startWeek) < GAME_CONFIG.SEASON_SWITCH_WEEK;

  // Build the ordered list of race days from each week's track schedule.
  // Tracks declare their own racingDays (e.g. Del Mar adds Friday).
  const dayEntries = [];
  for (let weekIdx = 0; weekIdx <= 1; weekIdx++) {
    const wn         = startWeek + weekIdx;
    const wkTrack    = getActiveTrack(wn);
    const racingDays = wkTrack ? wkTrack.racingDays(weekInSeason(wn)) : ['Saturday', 'Sunday'];
    for (const dayLabel of racingDays) {
      dayEntries.push({ weekNumber: wn, dayLabel });
    }
  }

  // Track combos used inside this book to prevent intra-book duplication
  const thisBookCombos = new Set();
  // Track distances used per type+surface+sex+age to enforce the within-1-furlong
  // spread rule — prevents e.g. a 7f and 8f Allowance for 3yo in the same book
  // even though they fall in different sprint/route categories.
  const thisBookDistsByBase = {};

  for (const { weekNumber, dayLabel } of dayEntries) {
    const track = getActiveTrack(weekNumber);

    const raceDay = {
      id: uid(),
      weekNumber,
      dayLabel,
      races:     [],
      dark:      !track,
      trackId:   track ? track.id   : null,
      trackName: track ? track.name : null,
    };

    if (!track) {
      // Dark week — push an empty race day and move on
      book.raceDays.push(raceDay);
      continue;
    }

    // Build the merged type pool for this track
    // Template fields (name, eligibility, claimingPrice, weight) + track fields
    // (purse, entryFee, difficulty, fieldStrength) combined via spread
    const typePool = track.raceTypes
      .map(rt => ({ ...RACE_TYPES[rt.id], ...rt }))
      .filter(Boolean);

    for (let num = 1; num <= GAME_CONFIG.RACES_PER_DAY; num++) {
      let race     = null;
      let attempts = 0;

      while (!race && attempts < 40) {
        attempts++;

        const rt = weightedPick(typePool.map(t => ({ ...t })));

        // Surface — consult track's turfEligible list
        const canTurf = track.turfEligible.includes(rt.id);
        const surface = (canTurf && Math.random() < 0.35) ? 'turf' : 'dirt';

        // Age division — base pool.
        // Horses age at the start of week 1 (Jan 1 universal birthday).
        // Week 52 races (Dec 26–29) are pre-birthday, so they use the same
        // post-Jun-1 pool as the rest of the second half of the year.
        // Week 1 onward (isBefore_Jun1) uses the post-birthday split.
        // Post-Jun 1: 3yo+ is weighted higher than 3yo (open races are more
        // prevalent on the card than straight 3yo-only races after June).
        const wis = weekInSeason(weekNumber);
        let ageWeights;
        if (isBefore_Jun1) {
          ageWeights = [{ val: '3yo', weight: 1 }, { val: '4yo+', weight: 1 }];
        } else {
          ageWeights = [{ val: '3yo', weight: 30 }, { val: '3yo+', weight: 50 }];
        }

        // Add 2yo if this track/type allows it at this point in the season.
        // Cap at week 52: horses are still 2yo through Dec 29 (pre-birthday);
        // they turn 3 on Jan 1 (week 1), so no 2yo races from week 1 onward.
        const twoYoFromWeek = track.twoYoEligible[rt.id];
        if (twoYoFromWeek !== undefined && wis >= twoYoFromWeek && wis <= 52) {
          ageWeights.unshift({ val: '2yo', weight: 20 });
        }

        const ageDivision = weightedPick(ageWeights).val;

        // Sex restriction — 50% fillies-only, 50% open
        const sexRestriction = Math.random() < 0.50 ? 'fillies' : 'open';

        // Distance selection — must happen before the uniqueness check so the
        // distance category (sprint vs route) can be part of the combo key.
        // Dirt sprint: ≤7f  |  Dirt route: >7f
        // Turf sprint: ≤6.5f  |  Turf route: >6.5f
        const surfaceConfig  = track.tracks.find(t => t.surface === surface);
        const distPool       = surfaceConfig.distances;
        const distance       = distPool[rand(0, distPool.length - 1)];
        const sprintCutoff   = surface === 'turf' ? 6.5 : 7;
        const distCategory   = distance <= sprintCutoff ? 'sprint' : 'route';

        // Uniqueness check — sprint and route count as separate races, so e.g. a
        // Claiming $20k dirt sprint and a Claiming $20k dirt route can both appear.
        // Age-overlap rule still applies within each distance category.
        const AGE_OVERLAPS = { '3yo': ['3yo+'], '3yo+': ['3yo', '4yo+'], '4yo+': ['3yo+'], '2yo': [] };
        const baseKey  = `${track.id}-${rt.id}-${surface}-${distCategory}-${sexRestriction}`;
        const comboKey = `${baseKey}-${ageDivision}`;
        if (thisBookCombos.has(comboKey)) continue;
        const lockedUntil = recentCombos[comboKey] ?? 0;
        if (startWeek <= lockedUntil) continue;
        const hasAgeOverlap = (AGE_OVERLAPS[ageDivision] || [])
          .some(alt => thisBookCombos.has(`${baseKey}-${alt}`));
        if (hasAgeOverlap) continue;

        // Within-1-furlong distance check — same type, surface, sex, and age
        // division cannot appear within 1f of an existing race in this book,
        // regardless of sprint/route category.
        const distBaseKey = `${track.id}-${rt.id}-${surface}-${sexRestriction}-${ageDivision}`;
        const tooClose = (thisBookDistsByBase[distBaseKey] || [])
          .some(d => Math.abs(d - distance) <= 1);
        if (tooClose) continue;

        // Difficulty with age + sex adjustments
        const baseDifficulty = rt.difficulty
          + getAgeDiffAdj(ageDivision, weekNumber)
          + (SEX_DIFF_ADJ[sexRestriction] ?? 0);

        race = {
          id: uid(),
          number:               num,
          raceTypeId:           rt.id,
          name:                 rt.name,
          shortName:            rt.shortName,
          purse:                rt.purse,
          entryFee:             rt.entryFee,
          claimingPrice:        rt.claimingPrice,
          optionalClaimingPrice: rt.optionalClaimingPrice ?? null,
          eligibility:          rt.eligibility,
          fieldStrength:        rt.fieldStrength,
          surface,
          distance,
          ageDivision,
          sexRestriction,
          division:      formatDivision(ageDivision, sexRestriction),
          baseDifficulty,
          trackId:       track.id,
          trackName:     track.name,
          weekNumber,
          dayLabel,
          playerEntry: null
        };
        thisBookCombos.add(comboKey);
        if (!thisBookDistsByBase[distBaseKey]) thisBookDistsByBase[distBaseKey] = [];
        thisBookDistsByBase[distBaseKey].push(distance);
      }

      if (race) raceDay.races.push(race);
    }

    // Append stakes races for this day — fixed annual events from STAKES_SCHEDULE.
    // Stakes skip all combo/uniqueness logic; difficulty is taken straight from CSV.
    const wis = weekInSeason(weekNumber);
    const dayStakes = STAKES_SCHEDULE.filter(s =>
      s.trackId === track.id &&
      s.weekNumber === wis &&
      s.dayLabel === dayLabel
    );
    dayStakes.forEach((s, i) => {
      raceDay.races.push({
        id:                    uid(),
        number:                11 + i,
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
        trackId:               track.id,
        trackName:             track.name,
        weekNumber,
        dayLabel,
        playerEntry:           null
      });
    });

    book.raceDays.push(raceDay);
  }

  return book;
}
