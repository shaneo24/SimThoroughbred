// ─── Horse class ─────────────────────────────────────────────────────────────

class Horse {
  constructor(data) {
    this.id           = data.id || uid();
    this.name         = data.name;
    this.age          = data.age;             // 2, 3, 4, 5, 6…
    this.sex          = data.sex;             // 'colt','filly','horse','mare','gelding'
    this.coat         = data.coat;

    // ── Core stats (all hidden from player except tier) ──────────────────────
    this.speed        = data.speed;           // 5–40, hidden; shown as tier
    this.startSpeed   = data.startSpeed ?? data.speed; // baseline for potential cap
    this.stamina      = data.stamina;         // 10–24; ideal distance = stamina/2
    this.potential    = data.potential;       // 0–15, fully hidden
    this.confidence   = Math.max(0, Math.min(10, data.confidence  ?? 5)); // 0–10
    this.consistency  = Math.max(0, Math.min(10, data.consistency ?? 5)); // 0–10

    // ── Surface preference (hidden; revealed through jockey notes) ───────────
    this.preferredSurface = data.preferredSurface ?? 'both'; // 'dirt'|'turf'|'both'

    // ── Race state ───────────────────────────────────────────────────────────
    this.fatigue         = data.fatigue ?? 0;
    this.injured         = data.injured ?? false;
    this.injuryWeeksLeft = data.injuryWeeksLeft ?? 0;
    this.wonLastRace     = data.wonLastRace ?? false;
    this.weeksSinceRace  = data.weeksSinceRace ?? 99;
    this.ownedWeeks      = data.ownedWeeks ?? 0;

    // ── Career record ────────────────────────────────────────────────────────
    this.wins        = data.wins ?? 0;
    this.starts      = data.starts ?? 0;
    this.earnings    = data.earnings ?? 0;
    this.raceHistory = data.raceHistory ?? [];

    // ── Decline tracking (age 6+) ────────────────────────────────────────────
    this.speedDeclineAccum = data.speedDeclineAccum ?? 0;

    // ── Jockey observations (revealed after races) ───────────────────────────
    this.jockeyNotes = data.jockeyNotes ?? [];

    // ── Pedigree (set for farm-bred horses) ─────────────────────────────────
    this.sire = data.sire ?? null;   // stallion name
    this.dam  = data.dam  ?? null;   // dam name

    // ── Breeding farm state (for retired mares only) ─────────────────────────
    this.pensionAge            = data.pensionAge            ?? null;
    this.pensionedFromBreeding = data.pensionedFromBreeding ?? false;
    this.breedingStatus        = data.breedingStatus        ?? 'open'; // 'open'|'pregnant'|'failed_conception'
    this.breedingYear          = data.breedingYear          ?? null;
    this.sireAtCover           = data.sireAtCover           ?? null;
    this.coverWeek             = data.coverWeek             ?? null;
    this.expectedFoalWeek      = data.expectedFoalWeek      ?? null;
    this.foalIds               = data.foalIds               ?? [];

    // ── Display / auction ────────────────────────────────────────────────────
    this.jockey       = data.jockey || randomJockey();
    this.clothColor   = data.clothColor || CLOTH_COLORS[rand(0, CLOTH_COLORS.length - 1)];
    this._auctionPrice     = data._auctionPrice     ?? null;
    // Auction display tiers — may be inaccurate (see Horse.generate)
    this._displaySpeedTier = data._displaySpeedTier ?? null;
    this._displayPotTier   = data._displayPotTier   ?? null;
  }

  // ── Computed display values ────────────────────────────────────────────────

  // Speed tier shown to player at auction and in stable
  get speedTier() {
    if (this.speed <= 17) return 'Low';
    if (this.speed <= 32) return 'Fair';
    return 'Elite';
  }

  // Potential tier shown to player at auction — speed adjusted upward for younger horses
  // to reflect expected growth: 2yo +10, 3yo +5, older no adjustment.
  // Uses the same Low/Fair/Elite thresholds as speedTier.
  get potentialTier() {
    const adj = this.speed + (this.age === 2 ? 10 : this.age === 3 ? 5 : 0);
    if (adj <= 17) return 'Low';
    if (adj <= 32) return 'Fair';
    return 'Elite';
  }

  get label() {
    const cg = this.sex === 'colt' || this.sex === 'horse' || this.sex === 'gelding';
    return this.age + 'yo ' + (cg ? 'C/G' : 'F/M');
  }

  get statusLabel() {
    if (this.injured)        return { text: 'Injured',    cls: 'status-injured' };
    if (this.fatigue >= 70)  return { text: 'Fatigued',   cls: 'status-fatigued' };
    if (this.fatigue >= 10)  return { text: 'Recovering', cls: 'status-recovering' };
    return { text: 'Ready', cls: 'status-ready' };
  }

  get canRace() {
    return !this.injured && this.fatigue < 70 && this.weeksSinceRace >= GAME_CONFIG.WEEKS_BETWEEN_RACES;
  }

  // N1X eligibility: never won any non-maiden, non-claiming race
  get isN1XEligible() {
    return this.raceHistory.every(r => {
      if (r.position !== 1) return true; // non-wins don't matter
      const rt = RACE_TYPES[r.raceType];
      return rt && (rt.eligibility === 'maiden' || rt.claimingPrice !== null);
    });
  }

  // N2X eligibility: has not won two or more non-maiden, non-claiming races (≤1 such win)
  get isN2XEligible() {
    const nonMdnClmWins = this.raceHistory.filter(r => {
      if (r.position !== 1) return false;
      const rt = RACE_TYPES[r.raceType];
      return rt && rt.eligibility !== 'maiden' && rt.claimingPrice === null;
    }).length;
    return nonMdnClmWins < 2;
  }

  // Kentucky Derby qualification: top-3 finish in San Felipe Stakes OR Santa Anita Derby
  get isKentuckyDerbyEligible() {
    return this.raceHistory.some(r =>
      r.position <= 3 &&
      r.stakesName &&
      (r.stakesName === 'San Felipe Stakes' || r.stakesName === 'Santa Anita Derby')
    );
  }

  // ── Eligibility check ──────────────────────────────────────────────────────

  // Age and sex check only — no win-condition check.
  // Used for AOC races where non-N1X horses can still enter for the claiming price.
  qualifiesAgeAndSex(ageDivision, sexRestriction) {
    if (ageDivision) {
      if (ageDivision === '2yo'  && this.age !== 2) return false;
      if (ageDivision === '3yo'  && this.age !== 3) return false;
      if (ageDivision === '3yo+' && this.age < 3)   return false;
      if (ageDivision === '4yo+' && this.age < 4)   return false;
    }
    if (sexRestriction === 'fillies') {
      if (this.sex !== 'filly' && this.sex !== 'mare') return false;
    }
    return true;
  }

  qualifiesFor(raceTypeId, ageDivision, sexRestriction) {
    const rt = RACE_TYPES[raceTypeId];
    if (!rt) return false;

    // Race-type eligibility
    switch (rt.eligibility) {
      case 'maiden': if (this.wins > 0)           return false; break;
      case 'n1x':   if (!this.isN1XEligible)      return false; break;
      case 'n2x':   if (!this.isN2XEligible)      return false; break;
      case 'n2l':   if (this.wins > 1)             return false; break;
      case 'open':  /* no restriction */            break;
    }

    // Age eligibility
    if (ageDivision) {
      if (ageDivision === '2yo'  && this.age !== 2) return false;
      if (ageDivision === '3yo'  && this.age !== 3) return false;
      if (ageDivision === '3yo+' && this.age < 3)   return false;
      if (ageDivision === '4yo+' && this.age < 4)   return false;
    }

    // Sex eligibility — males cannot run in fillies/mares races
    if (sexRestriction === 'fillies') {
      if (this.sex !== 'filly' && this.sex !== 'mare') return false;
    }

    return true;
  }

  // ── Race result application ────────────────────────────────────────────────

  applyRaceResult(position, purse, raceTypeId, distance = null, surface = null) {
    this.starts++;
    this.weeksSinceRace = 0;

    const payout = GAME_CONFIG.PAYOUT[position - 1] ?? 0;
    const earned = Math.round(purse * payout);
    this.earnings += earned;

    // Win streak tracking
    if (position === 1) {
      this.wins++;
      this.wonLastRace = true;
    } else {
      this.wonLastRace = false;
    }

    // Fatigue from racing — 1st–4th costs more than 5th+
    const fatIncrease = position <= 4 ? rand(50, 60) : rand(40, 55);
    this.fatigue = Math.min(100, this.fatigue + fatIncrease);

    // Injury check
    if (Math.random() < GAME_CONFIG.INJURY_CHANCE_PER_RACE) {
      this.injured         = true;
      this.injuryWeeksLeft = rand(GAME_CONFIG.INJURY_MIN_WEEKS, GAME_CONFIG.INJURY_MAX_WEEKS);
    }

    this.raceHistory.unshift({ week: null, raceType: raceTypeId, position, earned, distance, surface });
    if (this.raceHistory.length > 20) this.raceHistory.pop();

    return earned;
  }

  // ── Weekly update ──────────────────────────────────────────────────────────

  advanceWeek(currentWeek) {
    this.ownedWeeks++;
    this.weeksSinceRace++;

    if (this.injured) {
      this.injuryWeeksLeft--;
      if (this.injuryWeeksLeft <= 0) {
        this.injured         = false;
        this.injuryWeeksLeft = 0;
        this.fatigue         = 20;
      }
      // No early return — improvement and decline apply even while injured
    } else {
      // Fatigue recovery — 10–15 pts per week
      if (this.fatigue > 0) {
        this.fatigue = Math.max(0, this.fatigue - rand(10, 15));
      }
    }

    // Potential-driven speed improvement — age < 5 only; fatigue and injury are no barrier
    // potential maps 1:1 to max gain (potential 7 → up to +7 from startSpeed)
    // 2yo horses don't begin developing until May (week 18) — they need time to mature.
    const improveCap    = this.startSpeed + this.potential;
    const past2yoFreeze = this.age !== 2 || weekInSeason(currentWeek) >= 18;
    if (this.age < 5 && this.speed < improveCap && past2yoFreeze && Math.random() < 0.11) {
      this.speed = Math.min(improveCap, this.speed + 1);
    }

    // Age 6+ speed decline — max ~5 pts/year (≈ 0–0.15 pts/week)
    if (this.age >= 6 && Math.random() < 0.08) {
      this.speedDeclineAccum += Math.random() * 0.15;
      if (this.speedDeclineAccum >= 1) {
        this.speed = Math.max(5, this.speed - 1);
        this.speedDeclineAccum -= 1;
      }
    }
  }

  // ── Generation ────────────────────────────────────────────────────────────

  static generate({ week = 1 } = {}) {
    // 2yo horses not available at auction until week 13 (≈ April 1)
    const allow2yo = weekInSeason(week) >= GAME_CONFIG.AUCTION_2YO_START_WEEK;
    const age    = allow2yo && Math.random() < 0.80 ? 2 : 3;
    const isMale = Math.random() < 0.5;
    const sex    = age <= 3 ? (isMale ? 'colt' : 'filly') : (isMale ? 'horse' : 'mare');

    // Speed range by age and sex
    // Colts min 7, fillies min 4 → avg gap of ~3 across all ages
    // Max startSpeed set so that startSpeed + max potential = 45 (colts) / 42 (fillies)
    // 2yo colts: 7–30 (ceiling 30+15=45); 2yo fillies: 4–27 (ceiling 27+15=42)
    // 3yo colts: 7–38 (ceiling 38+7=45); 3yo fillies: 4–35 (ceiling 35+7=42)
    const spdMin = isMale ? 7 : 4;
    const spdMax = age === 2 ? (isMale ? 30 : 27) : (isMale ? 38 : 35);
    const spd    = rand(spdMin, spdMax);
    const stam   = rand(10, 20);

    // 2yo: full potential range (0–15); they have their whole development ahead
    // 3yo: limited remaining potential (0–7); already partially developed
    const pot = age === 2 ? rand(0, 15) : rand(0, 7);

    const surfRoll = Math.random();
    const preferredSurface = surfRoll < 0.40 ? 'dirt' : surfRoll < 0.70 ? 'both' : 'turf';

    // Price based on age-adjusted speed only (potential excluded)
    // 2yo adj = speed + 5 (expected growth to 3yo); 3yo adj = speed as-is
    const adjSpd = spd + (age === 2 ? 5 : 0);
    const price  = Horse._auctionPriceFromAdjSpeed(adjSpd);

    // Auction display tiers — 50/50 true vs. random wrong tier, locked at generation.
    // Potential display is always >= speed display.
    const TIERS      = ['Low', 'Fair', 'Elite'];
    const TIER_ORDER = { 'Low': 0, 'Fair': 1, 'Elite': 2 };
    const spdTier    = spd <= 17 ? 'Low' : spd <= 32 ? 'Fair' : 'Elite';
    const potAdjSpd  = spd + (age === 2 ? 10 : age === 3 ? 5 : 0);
    const potTier    = potAdjSpd <= 17 ? 'Low' : potAdjSpd <= 32 ? 'Fair' : 'Elite';
    const wrongOf    = t => { const o = TIERS.filter(x => x !== t); return o[rand(0, 1)]; };
    const displaySpeedTier = Math.random() < 0.75 ? spdTier : wrongOf(spdTier);
    let   displayPotTier   = Math.random() < 0.75 ? potTier : wrongOf(potTier);
    if (TIER_ORDER[displayPotTier] < TIER_ORDER[displaySpeedTier]) displayPotTier = displaySpeedTier;

    return new Horse({
      id: uid(),
      name: randomName(),
      age,
      sex,
      coat: randomCoat(),
      speed: spd,
      startSpeed: spd,
      stamina: stam,
      potential: pot,
      confidence: rand(3, 8),
      consistency: rand(2, 8),
      preferredSurface,
      fatigue: 0,
      jockey: randomJockey(),
      clothColor: CLOTH_COLORS[rand(0, CLOTH_COLORS.length - 1)],
      _auctionPrice:     price,
      _displaySpeedTier: displaySpeedTier,
      _displayPotTier:   displayPotTier,
    });
  }

  // Price bands keyed on age-adjusted speed, rounded to nearest $5k
  static _auctionPriceFromAdjSpeed(adj) {
    let min, max;
    if      (adj >= 30) { min =  200000; max = 3000000; }
    else if (adj >= 27) { min =  100000; max = 1500000; }
    else if (adj >= 24) { min =   80000; max =  800000; }
    else if (adj >= 21) { min =   70000; max =  500000; }
    else if (adj >= 18) { min =   50000; max =  200000; }
    else if (adj >= 15) { min =   40000; max =  150000; }
    else if (adj >= 12) { min =   30000; max =  100000; }
    else if (adj >=  9) { min =   20000; max =   80000; }
    else                { min =   20000; max =   50000; }  // ≤ 8
    return Math.round(rand(min, max) / 5000) * 5000;
  }

  // AI opponent — speed from the race's fieldStrength range.
  // Accepts a fieldStrength object { spMin, spMax } directly (no RACE_TYPES lookup needed).
  // Falls back to a mid-range field if called with a missing/old-format value.
  static generateOpponent(fieldStrength) {
    const fs      = (fieldStrength && fieldStrength.spMin != null)
                    ? fieldStrength : { spMin: 15, spMax: 28 };
    const spd     = rand(fs.spMin, fs.spMax);
    const stam    = rand(10, 20);
    const surfRoll = Math.random();
    const preferredSurface = surfRoll < 0.40 ? 'dirt' : surfRoll < 0.70 ? 'both' : 'turf';
    return new Horse({
      id: uid(),
      name: randomName(),
      age: rand(3, 6),
      sex: Math.random() < 0.5 ? 'colt' : 'filly',
      coat: randomCoat(),
      speed: spd,
      startSpeed: spd,
      stamina: stam,
      potential: rand(0, 15),
      confidence: rand(3, 8),
      consistency: rand(2, 8),
      preferredSurface,
      fatigue: rand(0, 25),
      jockey: randomJockey(),
      clothColor: CLOTH_COLORS[rand(0, CLOTH_COLORS.length - 1)]
    });
  }

  // ── Auction price ─────────────────────────────────────────────────────────

  get auctionPrice() {
    if (this._auctionPrice !== null) return this._auctionPrice;
    // Fallback: compute from age-adjusted speed (e.g. for horses without a set price)
    const adjSpd = this.speed + (this.age === 2 ? 5 : 0);
    return Horse._auctionPriceFromAdjSpeed(adjSpd);
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  toJSON() {
    return {
      id: this.id, name: this.name, age: this.age, sex: this.sex, coat: this.coat,
      speed: this.speed, startSpeed: this.startSpeed,
      stamina: this.stamina, potential: this.potential,
      confidence: this.confidence, consistency: this.consistency,
      preferredSurface: this.preferredSurface,
      fatigue: this.fatigue, injured: this.injured, injuryWeeksLeft: this.injuryWeeksLeft,
      wonLastRace: this.wonLastRace,
      weeksSinceRace: this.weeksSinceRace, ownedWeeks: this.ownedWeeks,
      wins: this.wins, starts: this.starts, earnings: this.earnings,
      raceHistory: this.raceHistory, speedDeclineAccum: this.speedDeclineAccum,
      jockeyNotes: this.jockeyNotes,
      jockey: this.jockey, clothColor: this.clothColor,
      _auctionPrice:     this._auctionPrice,
      _displaySpeedTier: this._displaySpeedTier,
      _displayPotTier:   this._displayPotTier,
      // Pedigree
      sire: this.sire, dam: this.dam,
      // Breeding farm state
      pensionAge:            this.pensionAge,
      pensionedFromBreeding: this.pensionedFromBreeding,
      breedingStatus:        this.breedingStatus,
      breedingYear:          this.breedingYear,
      sireAtCover:           this.sireAtCover,
      coverWeek:             this.coverWeek,
      expectedFoalWeek:      this.expectedFoalWeek,
      foalIds:               this.foalIds,
    };
  }

  static fromJSON(d) { return new Horse(d); }
}
