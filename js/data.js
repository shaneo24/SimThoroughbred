// ─── Static game data ────────────────────────────────────────────────────────

const GAME_CONFIG = {
  STARTING_MONEY: 100000,
  TRAINING_COST_MIN: 1000,
  TRAINING_COST_MAX: 1500,
  VET_COST_MIN: 300,
  VET_COST_MAX: 450,
  WEEKS_BETWEEN_RACES: 2,
  // Injury chances per race: first roll whether any injury occurs, then roll severity
  INJURY_CHANCE_RACE:          0.10,  // 10% chance of any injury per race
  INJURY_MAJOR_CHANCE_RACE:    0.20,  // 20% of injuries are major
  INJURY_MODERATE_CHANCE_RACE: 0.50,  // 50% of injuries are major or moderate (next 30%)
  // remaining 50% are minor (no constant needed)
  // Weekly training injury (non-racing, non-injured horses)
  INJURY_WEEKLY_CHANCE:        0.01,
  // Weekly shin soreness chance for 2yo horses
  INJURY_SHIN_CHANCE_2YO:      0.01,
  // Duration ranges (weeks) per severity
  INJURY_MAJOR_MIN: 10, INJURY_MAJOR_MAX: 20,
  INJURY_MODERATE_MIN: 6, INJURY_MODERATE_MAX: 10,
  INJURY_MINOR_MIN: 4,  INJURY_MINOR_MAX: 6,
  INJURY_SHIN_MIN: 12,  INJURY_SHIN_MAX: 20,
  INJURY_MAJOR_NAMES: ['ankle surgery', 'knee chip removal', 'colic', 'soreness'],
  AUCTION_HORSE_COUNT: 8,
  CONDITION_BOOK_WEEKS: 2,
  RACES_PER_DAY: 10,
  PAYOUT: [0.54, 0.18, 0.09, 0.063, 0.027],
  GAME_START_WEEK: 1,
  // Week 22 ≈ June 1: 4yo+ divisions replaced by 3yo+
  SEASON_SWITCH_WEEK: 22,
  // Horse age advances every 52 weeks of calendar time
  WEEKS_PER_YEAR: 52,
  // 2yo horses available at auction from week 13 (≈ April 1)
  AUCTION_2YO_START_WEEK: 13
};

// ── Age difficulty adjustments ────────────────────────────────────────────────
// Varies by month for 2yo and 3yo as horses develop through the season.
// All adjustments relative to 4yo+ open baseline (avg peak speed ~25 for colts).
//
// 2yo colts (avg start speed 20, 9%/wk improvement from first auction in May):
//   May:      avg ~20  → gap −6
//   Jun–Aug:  avg ~21  → gap −5
//   Sep–Oct:  avg ~22  → gap −4
//   Nov–Dec:  avg ~23  → gap −3
//
// 3yo colts (avg start speed 22.5, developing through the year):
// With potential now 0–15 (avg 7.5), mature horses develop further, widening
// the gap vs still-developing 3yos. Three-phase taper reflects gradual parity.
//   Jan–May:  avg ~22  → gap −3
//   Jun–Oct:  avg ~24  → gap −2
//   Nov–Dec:  avg ~25  → gap −1  (approaching 4yo+ parity)
function getAgeDiffAdj(ageDivision, weekNum) {
  const w = weekInSeason(weekNum);
  if (ageDivision === '2yo') {
    if (w >= 46) return -3;   // Nov–Dec
    if (w >= 36) return -4;   // Sep–Oct
    if (w >= 22) return -5;   // Jun–Aug
    return -6;                 // May (first 2yo races)
  }
  if (ageDivision === '3yo') {
    if (w >= 44) return -1;   // Nov–Dec: near parity with 4yo+
    if (w >= 22) return -2;   // Jun–Oct: gaining experience
    return -3;                 // Jan–May: still developing
  }
  return 0;  // '3yo+' and '4yo+' — baseline
}

// ── Sex difficulty adjustments ────────────────────────────────────────────────
// Fillies generated 3 pts below colts on max speed (2yo: 32 vs 35; 3yo: 37 vs 40)
const SEX_DIFF_ADJ = {
  'open':    0,
  'fillies': -3
};

// ── Race type templates — shared across all tracks ────────────────────────────
// purse, entryFee, difficulty, and fieldStrength vary per track; they live in
// each track's raceTypes array and are merged at runtime.
// eligibility, claimingPrice, and weight are constant across tracks.
const RACE_TYPES = {
  MAIDEN: {
    id: 'MAIDEN',
    name: 'Maiden',
    shortName: 'Mdn',
    eligibility: 'maiden',
    claimingPrice: null,
    weight: 15,
  },
  ALLOWANCE_N1X: {
    id: 'ALLOWANCE_N1X',
    name: 'Allowance N1X',
    shortName: 'Alw N1X',
    // n1x = never won other than a maiden or claiming race
    eligibility: 'n1x',
    claimingPrice: null,
    weight: 10,
  },
  ALLOWANCE_N2X: {
    id: 'ALLOWANCE_N2X',
    name: 'Allowance N2X',
    shortName: 'Alw N2X',
    // n2x = never won two races other than maiden or claiming (≤1 such win)
    eligibility: 'n2x',
    claimingPrice: null,
    optionalClaimingPrice: 100000,
    weight: 5,
  },
  CLAIMING_50: {
    id: 'CLAIMING_50',
    name: 'Claiming $50,000',
    shortName: 'Clm $50k',
    eligibility: 'open',
    claimingPrice: 50000,
    weight: 7,
  },
  CLAIMING_35: {
    id: 'CLAIMING_35',
    name: 'Claiming $35,000',
    shortName: 'Clm $35k',
    eligibility: 'open',
    claimingPrice: 35000,
    weight: 10,
  },
  CLAIMING_20: {
    id: 'CLAIMING_20',
    name: 'Claiming $20,000',
    shortName: 'Clm $20k',
    eligibility: 'open',
    claimingPrice: 20000,
    weight: 12,
  },
  CLAIMING_10: {
    id: 'CLAIMING_10',
    name: 'Claiming $10,000',
    shortName: 'Clm $10k',
    eligibility: 'open',
    claimingPrice: 10000,
    weight: 8,
  },
  CLAIMING_50_N2L: {
    id: 'CLAIMING_50_N2L',
    name: 'Claiming $50,000 N2L',
    shortName: 'Clm $50k N2L',
    eligibility: 'n2l',
    claimingPrice: 50000,
    weight: 8,
  },
  CLAIMING_25_N2L: {
    id: 'CLAIMING_25_N2L',
    name: 'Claiming $25,000 N2L',
    shortName: 'Clm $25k N2L',
    eligibility: 'n2l',
    claimingPrice: 25000,
    weight: 11,
  },
  MAIDEN_CLAIMING_100: {
    id: 'MAIDEN_CLAIMING_100',
    name: 'Maiden Claiming $100,000',
    shortName: 'Mdn Clm $100k',
    eligibility: 'maiden',
    claimingPrice: 100000,
    weight: 5,
  },
  MAIDEN_CLAIMING_50: {
    id: 'MAIDEN_CLAIMING_50',
    name: 'Maiden Claiming $50,000',
    shortName: 'Mdn Clm $50k',
    eligibility: 'maiden',
    claimingPrice: 50000,
    weight: 12,
  },
  MAIDEN_CLAIMING_20: {
    id: 'MAIDEN_CLAIMING_20',
    name: 'Maiden Claiming $20,000',
    shortName: 'Mdn Clm $20k',
    eligibility: 'maiden',
    claimingPrice: 20000,
    weight: 8,
  },
};

// ── Track configuration — Santa Anita Park ────────────────────────────────────
// Dirt: 5.5f–7f · 8f–9f   |   Turf: 6f–6.5f · 8f–10f
const SANTA_ANITA = {
  id: 'santa_anita',
  name: 'Santa Anita Park',
  location: 'Arcadia, California',
  // Wks 1–32: Fri+Sat+Sun.  Wks 33+: Thu+Fri+Sat+Sun.
  racingDays: w => w >= 33 ? ['Thursday', 'Friday', 'Saturday', 'Sunday'] : ['Friday', 'Saturday', 'Sunday'],
  tracks: [
    { surface: 'dirt', distances: [5.5, 6, 6.5, 7, 8, 8.5, 9] },
    { surface: 'turf', distances: [6, 6.5, 8, 8.5, 9, 9.5, 10] }
  ],
  // Per-track race config: merges with RACE_TYPES template at runtime via spread
  raceTypes: [
    { id: 'MAIDEN',             purse:  80000, entryFee: 0, difficulty: 25, fieldStrength: { spMin: 18, spMax: 32 } },
    { id: 'ALLOWANCE_N1X',      purse:  85000, entryFee: 0, difficulty: 28, fieldStrength: { spMin: 22, spMax: 35 }, optionalClaimingPrice: 75000 },
    { id: 'ALLOWANCE_N2X',      purse:  90000, entryFee: 0, difficulty: 30, fieldStrength: { spMin: 26, spMax: 38 }, optionalClaimingPrice: 100000 },
    { id: 'CLAIMING_50',        purse:  70000, entryFee: 0, difficulty: 25, fieldStrength: { spMin: 18, spMax: 32 } },
    { id: 'CLAIMING_35',        purse:  60000, entryFee: 0, difficulty: 22, fieldStrength: { spMin: 15, spMax: 27 } },
    { id: 'CLAIMING_20',        purse:  50000, entryFee: 0, difficulty: 19, fieldStrength: { spMin: 12, spMax: 23 } },
    { id: 'CLAIMING_10',        purse:  40000, entryFee: 0, difficulty: 16, fieldStrength: { spMin:  8, spMax: 18 } },
    { id: 'CLAIMING_50_N2L',    purse:  45000, entryFee: 0, difficulty: 21, fieldStrength: { spMin: 14, spMax: 25 } },
    { id: 'CLAIMING_25_N2L',    purse:  32000, entryFee: 0, difficulty: 15, fieldStrength: { spMin:  9, spMax: 20 } },
    { id: 'MAIDEN_CLAIMING_50', purse:  40000, entryFee: 0, difficulty: 19, fieldStrength: { spMin: 10, spMax: 21 } },
    { id: 'MAIDEN_CLAIMING_20', purse:  30000, entryFee: 0, difficulty: 13, fieldStrength: { spMin:  7, spMax: 16 } },
  ],
  // Race types eligible for the turf course
  turfEligible: ['MAIDEN', 'ALLOWANCE_N1X', 'ALLOWANCE_N2X', 'CLAIMING_50', 'CLAIMING_35', 'CLAIMING_20', 'MAIDEN_CLAIMING_50'],
  // Earliest week-in-season 2yo divisions are offered per race type
  // Week 17 ≈ May 1 · Week 22 ≈ Jun 1 · Week 26 ≈ Jul 1 · Week 30 ≈ Aug 1 · Week 35 ≈ Sep 1
  twoYoEligible: {
    'MAIDEN':             16,
    'MAIDEN_CLAIMING_50': 20,
    'MAIDEN_CLAIMING_20': 20,
    'ALLOWANCE_N1X':      39,
    'CLAIMING_50':        35,
    'CLAIMING_35':        35,
    'ALLOWANCE_N2X':      51,
    'CLAIMING_50_N2L':    30,
    'CLAIMING_25_N2L':    39,
    'CLAIMING_20':        51,
    'CLAIMING_10':        51,
  }
};

// ── Track configuration — Del Mar ─────────────────────────────────────────────
// Dirt: 5.5f–9f   |   Turf: 5f · 8f–9f
// Purses and difficulties run ~2 pts higher than Santa Anita (summer meet premium).
const DEL_MAR = {
  id: 'del_mar',
  name: 'Del Mar',
  location: 'Del Mar, California',
  // Wks 27–32: Fri+Sat+Sun.  Wks 33+: Thu+Fri+Sat+Sun.
  racingDays: w => w >= 33 ? ['Thursday', 'Friday', 'Saturday', 'Sunday'] : ['Friday', 'Saturday', 'Sunday'],
  tracks: [
    { surface: 'dirt', distances: [5.5, 6, 6.5, 7, 8, 8.5, 9] },
    { surface: 'turf', distances: [5, 8, 8.5, 9] }
  ],
  raceTypes: [
    { id: 'MAIDEN',              purse:  95000, entryFee: 0, difficulty: 26, fieldStrength: { spMin: 20, spMax: 34 } },
    { id: 'ALLOWANCE_N1X',       purse: 100000, entryFee: 0, difficulty: 29, fieldStrength: { spMin: 24, spMax: 37 }, optionalClaimingPrice: 80000 },
    { id: 'ALLOWANCE_N2X',       purse: 110000, entryFee: 0, difficulty: 31, fieldStrength: { spMin: 28, spMax: 40 }, optionalClaimingPrice: 100000 },
    { id: 'CLAIMING_50',         purse:  80000, entryFee: 0, difficulty: 26, fieldStrength: { spMin: 20, spMax: 34 } },
    { id: 'CLAIMING_35',         purse:  70000, entryFee: 0, difficulty: 23, fieldStrength: { spMin: 17, spMax: 29 } },
    { id: 'CLAIMING_20',         purse:  60000, entryFee: 0, difficulty: 20, fieldStrength: { spMin: 14, spMax: 25 } },
    { id: 'CLAIMING_10',         purse:  50000, entryFee: 0, difficulty: 17, fieldStrength: { spMin: 10, spMax: 20 } },
    { id: 'CLAIMING_50_N2L',     purse:  50000, entryFee: 0, difficulty: 22, fieldStrength: { spMin: 16, spMax: 27 } },
    { id: 'CLAIMING_25_N2L',     purse:  37000, entryFee: 0, difficulty: 16, fieldStrength: { spMin: 11, spMax: 22 } },
    { id: 'MAIDEN_CLAIMING_100', purse:  60000, entryFee: 0, difficulty: 23, fieldStrength: { spMin: 14, spMax: 26 } },
    { id: 'MAIDEN_CLAIMING_50',  purse:  45000, entryFee: 0, difficulty: 20, fieldStrength: { spMin: 12, spMax: 23 } },
    { id: 'MAIDEN_CLAIMING_20',  purse:  35000, entryFee: 0, difficulty: 14, fieldStrength: { spMin:  9, spMax: 18 } },
  ],
  // All races turf-eligible except Claiming 10, Claiming $25k N2L and Maiden Claiming $20k
  turfEligible: [
    'MAIDEN', 'ALLOWANCE_N1X', 'ALLOWANCE_N2X',
    'CLAIMING_50', 'CLAIMING_35', 'CLAIMING_20',
    'CLAIMING_50_N2L', 'MAIDEN_CLAIMING_100', 'MAIDEN_CLAIMING_50',
  ],
  twoYoEligible: {
    'MAIDEN':              16,
    'MAIDEN_CLAIMING_100': 20,
    'MAIDEN_CLAIMING_50':  20,
    'MAIDEN_CLAIMING_20':  20,
    'ALLOWANCE_N1X':       39,
    'CLAIMING_50':         35,
    'CLAIMING_35':         35,
    'ALLOWANCE_N2X':       51,
    'CLAIMING_50_N2L':     30,
    'CLAIMING_25_N2L':     39,
    'CLAIMING_20':         51,
    'CLAIMING_10':         51,
  }
};

// ── Southern California Circuit — meet schedule ───────────────────────────────
// Weeks are weekInSeason (1–52). track: null means no racing (dark week).
//
//  SA Winter/Spring  Wks  1–24  (Jan  4 – Jun 16)   Fri/Sat/Sun
//  Dark              Wks 25–26  (Jun 18 – Jul  1)
//  Del Mar Summer    Wks 27–37  (Jul  5 – Sep 15)   Fri/Sat/Sun → Thu–Sun from wk 33
//  Dark              Wk  38     (Sep 17 – Sep 23)
//  SA Fall           Wks 39–44  (Sep 26 – Nov  3)   Thu/Fri/Sat/Sun
//  Del Mar Fall      Wks 45–49  (Nov  7 – Dec  8)   Thu/Fri/Sat/Sun
//  Dark              Wks 50–51  (Dec 10 – Dec 23)
//  SA Winter/Spring  Wk  52     (Dec 26 – Dec 29)   Thu/Fri/Sat/Sun
const CIRCUIT_SCHEDULE = [
  { start:  1, end: 24, track: 'santa_anita', label: 'Santa Anita Park — Winter/Spring Meet' },
  { start: 25, end: 26, track: null,           label: 'Dark'                                   },
  { start: 27, end: 37, track: 'del_mar',      label: 'Del Mar — Summer Meet'                  },
  { start: 38, end: 38, track: null,           label: 'Dark'                                   },
  { start: 39, end: 44, track: 'santa_anita',  label: 'Santa Anita Park — Fall Meet'           },
  { start: 45, end: 49, track: 'del_mar',      label: 'Del Mar — Fall Meet'                    },
  { start: 50, end: 51, track: null,           label: 'Dark'                                   },
  { start: 52, end: 52, track: 'santa_anita',  label: 'Santa Anita Park — Winter/Spring Meet'  },
];

// Returns the active track config for the given (absolute) week number, or null if dark.
function getActiveTrack(weekNum) {
  const w     = weekInSeason(weekNum);
  const entry = CIRCUIT_SCHEDULE.find(s => w >= s.start && w <= s.end);
  if (!entry || !entry.track) return null;
  return entry.track === 'santa_anita' ? SANTA_ANITA : DEL_MAR;
}

// ── Name / Color tables ───────────────────────────────────────────────────────
const HORSE_NAMES_A = [
  'Golden','Silver','Dark','Wild','Swift','Royal','Noble','Iron','Storm',
  'Thunder','Bold','Lucky','Brave','Fine','Star','Fire','Blue','Red',
  'Black','Bright','Steel','Flash','Wind','Sun','Moon','Night','Dawn',
  'Desert','Prairie','Shadow','Mystic','Phantom','Ghost','True','Proud',
  'Grand','First','Final','Coal','Copper','Crimson','Emerald','Frost'
];
const HORSE_NAMES_B = [
  'Arrow','Wind','Spirit','Run','Dance','Fire','Moon','Crown','Vale',
  'Ridge','Creek','Gate','Light','Storm','Quest','Dream','Glory','Honor',
  'Legacy','Empire','Legend','Thunder','Blade','Star','Wing','Flight',
  'Gallop','Stride','Leap','Runner','Blazer','Comet','Meteor','Rocket',
  'Bullet','Hawk','Eagle','Falcon','Raven','Phoenix','Banner','Crest'
];

const JOCKEY_NAMES = [
  'J. Rosario','F. Prat','T. Baze','R. Bejarano','M. Smith',
  'V. Espinoza','J. Castellano','J. Velazquez','I. Ortiz Jr.',
  'L. Saez','J. Bravo','E. Prado','D. Flores',
  'K. Desormeaux','E. Maldonado','J. Ortiz','M. Gutierrez',
  'A. Fresu','R. Gutierrez','A. Centeno','T. Gaffalione',
  'M. Franco','F. Arrieta','C. Torres','J. Hernandez','J. Alvarado','R. Santana Jr',
  'K. Carmouche','E. Jaramillo','K. Kimura','F. Geroux'
];

const COAT_COLORS = [
  { name: 'Bay',       hex: '#7B3F00' },
  { name: 'Chestnut',  hex: '#954535' },
  { name: 'Dark Bay',  hex: '#3B1F0A' },
  { name: 'Gray',      hex: '#9E9E9E' },
  { name: 'Black',     hex: '#222222' },
  { name: 'Roan',      hex: '#A0624A' }
];

const CLOTH_COLORS = [
  '#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6',
  '#1abc9c','#e67e22','#e91e63','#00bcd4','#8bc34a',
  '#ff5722','#795548','#ff9800','#009688','#673ab7'
];

// ── Utility functions ─────────────────────────────────────────────────────────
function randomName() {
  const a = HORSE_NAMES_A[Math.floor(Math.random() * HORSE_NAMES_A.length)];
  const b = HORSE_NAMES_B[Math.floor(Math.random() * HORSE_NAMES_B.length)];
  return `${a} ${b}`;
}

function randomCoat() {
  return COAT_COLORS[Math.floor(Math.random() * COAT_COLORS.length)];
}

function randomJockey() {
  return JOCKEY_NAMES[Math.floor(Math.random() * JOCKEY_NAMES.length)];
}

// Returns the week number within the current season year (always 1–52).
// e.g. week 1→1, week 52→52, week 53→1, week 54→2
function weekInSeason(week) {
  return ((week - 1) % GAME_CONFIG.WEEKS_PER_YEAR) + 1;
}

// "Yr 1 Wk 4", "Yr 2 Wk 4", etc.
function formatWeekLabel(week) {
  const year = Math.ceil(week / GAME_CONFIG.WEEKS_PER_YEAR);
  const w    = weekInSeason(week);
  return `Yr ${year} Wk ${w}`;
}

// "Jan 6, Yr 1" — date derived from week + optional day offset (e.g. +4 for Saturday)
function formatDateYr(week, dayOffset = 0) {
  const d    = weekToDate(week);
  d.setDate(d.getDate() + dayOffset);
  const year = Math.ceil(week / GAME_CONFIG.WEEKS_PER_YEAR);
  return `${formatDate(d)}, Yr ${year}`;
}

function weekToDate(week) {
  // Anchor each game year to the correct calendar year so the 364-day game
  // year doesn't drift vs. the 365.25-day real year.  Year 1 Wk 1 = Jan 6,
  // 2026; Year 2 Wk 1 = Jan 6, 2027; Year N Wk 1 = Jan 6, 2025+N.
  const gameYear   = Math.ceil(week / GAME_CONFIG.WEEKS_PER_YEAR);
  const seasonWeek = weekInSeason(week);
  const base       = new Date(2025 + gameYear, 0, 1); // Jan 1 (Tuesday) of the right year
  base.setDate(base.getDate() + (seasonWeek - 1) * 7);
  return base;
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMoney(n) {
  return '$' + n.toLocaleString();
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function gaussianRandom(mean, std) {
  const u1 = Math.random(), u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z;
}

function weightedPick(items) {
  const total = items.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Human-readable division label
// open:    2yo | 3yo | 4yo+ | 3yo+
// fillies: 2yo F | 3yo F | 4yo+ F&M | 3yo+ F&M
function formatDivision(ageDivision, sexRestriction) {
  if (sexRestriction === 'fillies') {
    if (ageDivision === '4yo+' || ageDivision === '3yo+') return ageDivision + ' F&M';
    return ageDivision + ' F';
  }
  return ageDivision;
}

// ── Southern California Stakes Schedule ──────────────────────────────────────
// Fixed annual events derived from SoCalStakes.csv.
// difficulty is taken directly from the CSV — no age/sex adjustments applied.
// §BUILD_START:STAKES_SCHEDULE
const STAKES_SCHEDULE = [

  // ══ SANTA ANITA PARK — WINTER/SPRING MEET (Weeks 1–24) ═══════════════════════

  // ── Week 1: Fri Jan 4 / Sat Jan 5 ────────────────────────────────────────────────────────
  { name: 'Santa Ynez Stakes',              trackId: 'santa_anita', weekNumber:  1, dayLabel: 'Friday',
    purse:   150000, grade: 'L',  ageDivision: '3yo',  sexRestriction: 'fillies', surface: 'dirt', distance: 7,   difficulty: 30 },
  { name: 'Las Flores Stakes',              trackId: 'santa_anita', weekNumber:  1, dayLabel: 'Friday',
    purse:   200000, grade: 'G3', ageDivision: '4yo+', sexRestriction: 'fillies', surface: 'dirt', distance: 6,   difficulty: 31 },
  { name: 'La Canada Stakes',               trackId: 'santa_anita', weekNumber:  1, dayLabel: 'Saturday',
    purse:   200000, grade: 'G3', ageDivision: '4yo+', sexRestriction: 'fillies', surface: 'dirt', distance: 8.5, difficulty: 31 },

  // ── Week 2: Fri Jan 11 / Sat Jan 12 ─────────────────────────────────────────
  { name: 'San Vicente Stakes',             trackId: 'santa_anita', weekNumber:  2, dayLabel: 'Friday',
    purse:   400000, grade: 'G2', ageDivision: '3yo',  sexRestriction: 'open',    surface: 'dirt', distance: 7,   difficulty: 33 },
  { name: 'Las Cienegas Stakes',            trackId: 'santa_anita', weekNumber:  2, dayLabel: 'Saturday',
    purse:   200000, grade: 'G3', ageDivision: '4yo+', sexRestriction: 'fillies', surface: 'turf', distance: 6,   difficulty: 30 },

  // ── Week 3: Sat Jan 19 ───────────────────────────────────────────────────────
  { name: 'Astra Stakes',                   trackId: 'santa_anita', weekNumber:  3, dayLabel: 'Saturday',
    purse:   200000, grade: 'L',  ageDivision: '4yo+', sexRestriction: 'fillies', surface: 'turf', distance: 10,  difficulty: 30 },

  // ── Week 4: Fri Jan 25 ───────────────────────────────────────────────────────
  { name: 'Baffle Stakes',                  trackId: 'santa_anita', weekNumber:  4, dayLabel: 'Friday',
    purse:   150000, grade: null, ageDivision: '3yo',  sexRestriction: 'open',    surface: 'turf', distance: 6.5, difficulty: 30 },

  // ── Week 5: Sat Feb 2 ────────────────────────────────────────────────────────
  { name: 'San Pasqual Stakes',             trackId: 'santa_anita', weekNumber:  5, dayLabel: 'Saturday',
    purse:   400000, grade: 'G2', ageDivision: '4yo+', sexRestriction: 'open',    surface: 'dirt', distance: 9,   difficulty: 35 },
  { name: 'Megahertz Stakes',               trackId: 'santa_anita', weekNumber:  5, dayLabel: 'Saturday',
    purse:   200000, grade: 'G3', ageDivision: '4yo+', sexRestriction: 'fillies', surface: 'turf', distance: 8,   difficulty: 30 },
  { name: 'Las Virgenes Stakes',            trackId: 'santa_anita', weekNumber:  5, dayLabel: 'Saturday',
    purse:   200000, grade: 'G3', ageDivision: '3yo',  sexRestriction: 'fillies', surface: 'dirt', distance: 8,   difficulty: 30 },

  // ── Week 6: Sat Feb 9 / Sun Feb 10 ──────────────────────────────────────────
  { name: 'D Wayne Lukas Stakes',           trackId: 'santa_anita', weekNumber:  6, dayLabel: 'Saturday',
    purse:   500000, grade: 'G2', ageDivision: '4yo+', sexRestriction: 'fillies', surface: 'dirt', distance: 7,   difficulty: 33 },
  { name: 'Robert B Lewis Stakes',          trackId: 'santa_anita', weekNumber:  6, dayLabel: 'Saturday',
    purse:   500000, grade: 'G3', ageDivision: '3yo',  sexRestriction: 'open',    surface: 'dirt', distance: 8,   difficulty: 33 },
  { name: 'Thunder Road Stakes',            trackId: 'santa_anita', weekNumber:  6, dayLabel: 'Sunday',
    purse:   300000, grade: 'G3', ageDivision: '4yo+', sexRestriction: 'open',    surface: 'turf', distance: 8,   difficulty: 34 },
  { name: 'Sweet Life Stakes',              trackId: 'santa_anita', weekNumber:  6, dayLabel: 'Sunday',
    purse:   200000, grade: 'L',  ageDivision: '3yo',  sexRestriction: 'fillies', surface: 'turf', distance: 6,   difficulty: 27 },
  { name: 'Clockers Corner Stakes',         trackId: 'santa_anita', weekNumber:  6, dayLabel: 'Sunday',
    purse:   150000, grade: null, ageDivision: '4yo+', sexRestriction: 'open',    surface: 'turf', distance: 6,   difficulty: 32 },

  // ── Week 7: Fri Feb 15 / Sat Feb 16 ─────────────────────────────────────────
  { name: 'San Marcos Stakes',              trackId: 'santa_anita', weekNumber:  7, dayLabel: 'Friday',
    purse:   200000, grade: 'G3', ageDivision: '4yo+', sexRestriction: 'open',    surface: 'turf', distance: 10,  difficulty: 33 },
  { name: 'Palos Verdes Stakes',            trackId: 'santa_anita', weekNumber:  7, dayLabel: 'Saturday',
    purse:   200000, grade: 'G3', ageDivision: '4yo+', sexRestriction: 'open',    surface: 'dirt', distance: 6,   difficulty: 33 },

  // ── Week 8: Fri Feb 22 / Sat Feb 23 ─────────────────────────────────────────
  { name: 'Wishing Well Stakes',            trackId: 'santa_anita', weekNumber:  8, dayLabel: 'Friday',
    purse:   150000, grade: null, ageDivision: '4yo+', sexRestriction: 'fillies', surface: 'turf', distance: 6,   difficulty: 29 },
  { name: 'Pasadena Stakes',                trackId: 'santa_anita', weekNumber:  8, dayLabel: 'Saturday',
    purse:   200000, grade: null, ageDivision: '3yo',  sexRestriction: 'open',    surface: 'turf', distance: 8,   difficulty: 29 },

  // ── Week 9: Sat Mar 2 ────────────────────────────────────────────────────────
  { name: 'Buena Vista Stakes',             trackId: 'santa_anita', weekNumber:  9, dayLabel: 'Saturday',
    purse:   500000, grade: 'G2', ageDivision: '4yo+', sexRestriction: 'fillies', surface: 'turf', distance: 8,   difficulty: 34 },
  { name: 'Santa Anita Handicap',           trackId: 'santa_anita', weekNumber:  9, dayLabel: 'Saturday',
    purse:  1500000, grade: 'G1', ageDivision: '4yo+', sexRestriction: 'open',    surface: 'dirt', distance: 10,  difficulty: 39 },
  { name: 'Santa Ysabel Stakes',            trackId: 'santa_anita', weekNumber:  9, dayLabel: 'Saturday',
    purse:   500000, grade: 'G3', ageDivision: '3yo',  sexRestriction: 'fillies', surface: 'dirt', distance: 8.5, difficulty: 31 },

  // ── Week 10: Sat Mar 9 / Sun Mar 9 ───────────────────────────────────────────
  { name: 'China Doll Stakes',              trackId: 'santa_anita', weekNumber: 10, dayLabel: 'Saturday',
    purse:   200000, grade: 'L',  ageDivision: '3yo',  sexRestriction: 'fillies', surface: 'turf', distance: 8,   difficulty: 27 },
  { name: 'Frank E Kilroe Mile',            trackId: 'santa_anita', weekNumber: 10, dayLabel: 'Sunday',
    purse:  1000000, grade: 'G1', ageDivision: '4yo+', sexRestriction: 'open',    surface: 'turf', distance: 8,   difficulty: 38 },
  { name: 'Beholder Mile',                  trackId: 'santa_anita', weekNumber: 10, dayLabel: 'Sunday',
    purse:  1000000, grade: 'G1', ageDivision: '4yo+', sexRestriction: 'fillies', surface: 'dirt', distance: 8,   difficulty: 36 },
  { name: 'San Felipe Stakes',              trackId: 'santa_anita', weekNumber: 10, dayLabel: 'Sunday',
    purse:   750000, grade: 'G2', ageDivision: '3yo',  sexRestriction: 'open',    surface: 'dirt', distance: 8.5, difficulty: 34 },

  // ── Week 11: Fri Mar 15 / Sat Mar 16 ────────────────────────────────────────
  { name: 'San Simeon Stakes',              trackId: 'santa_anita', weekNumber: 11, dayLabel: 'Friday',
    purse:   200000, grade: 'G3', ageDivision: '4yo+', sexRestriction: 'open',    surface: 'turf', distance: 6,   difficulty: 33 },
  { name: 'Santa Ana Stakes',               trackId: 'santa_anita', weekNumber: 11, dayLabel: 'Saturday',
    purse:   200000, grade: 'G3', ageDivision: '4yo+', sexRestriction: 'fillies', surface: 'turf', distance: 10,  difficulty: 30 },

  // ── Week 12: Fri Mar 21 ──────────────────────────────────────────────────────
  { name: 'San Luis Rey Stakes',            trackId: 'santa_anita', weekNumber: 12, dayLabel: 'Friday',
    purse:   200000, grade: 'G3', ageDivision: '4yo+', sexRestriction: 'open',    surface: 'turf', distance: 10,  difficulty: 33 },

  // ── Week 13: Sat Mar 30 ──────────────────────────────────────────────────────
  { name: 'Wilshire Stakes',                trackId: 'santa_anita', weekNumber: 13, dayLabel: 'Saturday',
    purse:   200000, grade: 'G3', ageDivision: '4yo+', sexRestriction: 'fillies', surface: 'turf', distance: 8,   difficulty: 30 },
  { name: 'San Carlos Stakes',              trackId: 'santa_anita', weekNumber: 13, dayLabel: 'Saturday',
    purse:   300000, grade: 'G3', ageDivision: '4yo+', sexRestriction: 'open',    surface: 'dirt', distance: 7,   difficulty: 34 },

  // ── Week 14: Sat Apr 6 / Sun Apr 6 ───────────────────────────────────────────
  { name: 'John Shear Stakes',              trackId: 'santa_anita', weekNumber: 14, dayLabel: 'Saturday',
    purse:   150000, grade: 'L',  ageDivision: '3yo',  sexRestriction: 'open',    surface: 'turf', distance: 6.5, difficulty: 30 },
  { name: 'Santa Anita Derby',              trackId: 'santa_anita', weekNumber: 14, dayLabel: 'Sunday',
    purse:  1000000, grade: 'G1', ageDivision: '3yo',  sexRestriction: 'open',    surface: 'dirt', distance: 9,   difficulty: 35 },
  { name: 'Santa Anita Oaks',               trackId: 'santa_anita', weekNumber: 14, dayLabel: 'Sunday',
    purse:   750000, grade: 'G1', ageDivision: '3yo',  sexRestriction: 'fillies', surface: 'dirt', distance: 8.5, difficulty: 32 },
  { name: 'Monrovia Stakes',                trackId: 'santa_anita', weekNumber: 14, dayLabel: 'Sunday',
    purse:   200000, grade: 'G3', ageDivision: '4yo+', sexRestriction: 'fillies', surface: 'turf', distance: 6,   difficulty: 30 },
  { name: 'Providencia Stakes',             trackId: 'santa_anita', weekNumber: 14, dayLabel: 'Sunday',
    purse:   150000, grade: 'L',  ageDivision: '3yo',  sexRestriction: 'fillies', surface: 'turf', distance: 9,   difficulty: 27 },

  // ── Week 16: Fri Apr 19 / Sat Apr 20 ────────────────────────────────────────
  { name: 'American Stakes',               trackId: 'santa_anita', weekNumber: 16, dayLabel: 'Friday',
    purse:   300000, grade: 'G3', ageDivision: '4yo+', sexRestriction: 'open',    surface: 'turf', distance: 8,   difficulty: 34 },
  { name: 'Santa Maria Stakes',             trackId: 'santa_anita', weekNumber: 16, dayLabel: 'Saturday',
    purse:   300000, grade: 'G2', ageDivision: '4yo+', sexRestriction: 'fillies', surface: 'dirt', distance: 8.5, difficulty: 32 },

  // ── Week 17: Fri Apr 26 ──────────────────────────────────────────────────────
  { name: 'Royal Heroine Stakes',           trackId: 'santa_anita', weekNumber: 17, dayLabel: 'Friday',
    purse:   400000, grade: 'G3', ageDivision: '4yo+', sexRestriction: 'fillies', surface: 'turf', distance: 8,   difficulty: 30 },

  // ── Week 18: Fri May 3 ───────────────────────────────────────────────────────
  { name: 'Charles Whittingham Stakes',     trackId: 'santa_anita', weekNumber: 18, dayLabel: 'Friday',
    purse:   400000, grade: 'G3', ageDivision: '4yo+', sexRestriction: 'open',    surface: 'turf', distance: 10,  difficulty: 33 },
  { name: 'Santa Barbara Stakes',           trackId: 'santa_anita', weekNumber: 18, dayLabel: 'Friday',
    purse:   150000, grade: 'L',  ageDivision: '4yo+', sexRestriction: 'fillies', surface: 'turf', distance: 10,  difficulty: 29 },

  // ── Week 19: Fri May 10 / Sat May 11 ────────────────────────────────────────
  { name: 'Senorita Stakes',                trackId: 'santa_anita', weekNumber: 19, dayLabel: 'Friday',
    purse:   200000, grade: 'G3', ageDivision: '3yo',  sexRestriction: 'fillies', surface: 'turf', distance: 6,   difficulty: 27 },
  { name: 'Siren Lure Stakes',              trackId: 'santa_anita', weekNumber: 19, dayLabel: 'Saturday',
    purse:   200000, grade: 'L',  ageDivision: '4yo+', sexRestriction: 'open',    surface: 'turf', distance: 6,   difficulty: 33 },

  // ── Week 20: Fri May 17 / Sat May 18 ────────────────────────────────────────
  { name: 'Mizdirection Stakes',            trackId: 'santa_anita', weekNumber: 20, dayLabel: 'Friday',
    purse:   200000, grade: 'L',  ageDivision: '4yo+', sexRestriction: 'fillies', surface: 'turf', distance: 6,   difficulty: 30 },
  { name: 'Cinema Stakes',                  trackId: 'santa_anita', weekNumber: 20, dayLabel: 'Saturday',
    purse:   200000, grade: null, ageDivision: '3yo',  sexRestriction: 'open',    surface: 'turf', distance: 8,   difficulty: 30 },

  // ── Week 21: Sat May 25 ──────────────────────────────────────────────────────
  { name: 'Shoemaker Mile',                 trackId: 'santa_anita', weekNumber: 21, dayLabel: 'Saturday',
    purse:  1000000, grade: 'G1', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'turf', distance: 8,   difficulty: 38 },
  { name: 'Gamely Stakes',                  trackId: 'santa_anita', weekNumber: 21, dayLabel: 'Saturday',
    purse:  1000000, grade: 'G1', ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'turf', distance: 9,   difficulty: 35 },
  { name: 'Hollywood Gold Cup',             trackId: 'santa_anita', weekNumber: 21, dayLabel: 'Saturday',
    purse:  1000000, grade: 'G1', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'dirt', distance: 10,  difficulty: 38 },

  // ── Week 22: Fri May 31 ──────────────────────────────────────────────────────
  { name: 'Santa Margarita Stakes',         trackId: 'santa_anita', weekNumber: 22, dayLabel: 'Friday',
    purse:   500000, grade: 'G2', ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'dirt', distance: 9,   difficulty: 33 },
  { name: 'Triple Bend Stakes',             trackId: 'santa_anita', weekNumber: 22, dayLabel: 'Friday',
    purse:   500000, grade: 'G2', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'dirt', distance: 7,   difficulty: 36 },

  // ── Week 23: Sat Jun 8 / Sun Jun 9 ──────────────────────────────────────────
  { name: 'Honeymoon Stakes',               trackId: 'santa_anita', weekNumber: 23, dayLabel: 'Saturday',
    purse:   200000, grade: 'G3', ageDivision: '3yo',  sexRestriction: 'fillies', surface: 'turf', distance: 8,   difficulty: 29 },
  { name: 'Desert Stormer Stakes',          trackId: 'santa_anita', weekNumber: 23, dayLabel: 'Sunday',
    purse:   200000, grade: 'L',  ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'dirt', distance: 6,   difficulty: 30 },
  { name: 'Affirmed Stakes',                trackId: 'santa_anita', weekNumber: 23, dayLabel: 'Sunday',
    purse:   300000, grade: 'L',  ageDivision: '3yo',  sexRestriction: 'open',    surface: 'dirt', distance: 8.5, difficulty: 32 },

  // ── Week 24: Fri Jun 14 / Sat Jun 15 / Sun Jun 16 ───────────────────────────
  { name: 'Possibly Perfect Stakes',        trackId: 'santa_anita', weekNumber: 24, dayLabel: 'Friday',
    purse:   300000, grade: 'L',  ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'turf', distance: 10,  difficulty: 31 },
  { name: 'Daytona Stakes',                 trackId: 'santa_anita', weekNumber: 24, dayLabel: 'Saturday',
    purse:   300000, grade: 'G3', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'turf', distance: 6,   difficulty: 33 },
  { name: 'Summertime Oaks',                trackId: 'santa_anita', weekNumber: 24, dayLabel: 'Saturday',
    purse:   400000, grade: 'G2', ageDivision: '3yo',  sexRestriction: 'fillies', surface: 'dirt', distance: 8.5, difficulty: 30 },
  { name: 'San Juan Capistrano Stakes',     trackId: 'santa_anita', weekNumber: 24, dayLabel: 'Sunday',
    purse:   500000, grade: 'G3', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'turf', distance: 10,  difficulty: 35 },

  // ══ DEL MAR — SUMMER MEET (Weeks 27–37) ══════════════════════════════════════

  // ── Week 27: Fri Jul 5 / Sat Jul 6 / Sun Jul 7 ──────────────────────────────
  { name: 'Oceanside Stakes',               trackId: 'del_mar',     weekNumber: 27, dayLabel: 'Friday',
    purse:   150000, grade: 'L',  ageDivision: '3yo',  sexRestriction: 'open',    surface: 'turf', distance: 8,   difficulty: 31 },
  { name: 'CashCall Derby',                 trackId: 'del_mar',     weekNumber: 27, dayLabel: 'Saturday',
    purse:   400000, grade: 'G3', ageDivision: '3yo',  sexRestriction: 'open',    surface: 'dirt', distance: 9,   difficulty: 33 },
  { name: 'Landaluce Stakes',               trackId: 'del_mar',     weekNumber: 27, dayLabel: 'Saturday',
    purse:   150000, grade: null, ageDivision: '2yo',  sexRestriction: 'fillies',    surface: 'dirt', distance: 5.5,   difficulty: 21 },
  { name: 'Hollywood Juvenile',             trackId: 'del_mar',     weekNumber: 27, dayLabel: 'Sunday',
    purse:   150000, grade: null, ageDivision: '2yo', sexRestriction: 'open', surface: 'dirt', distance: 5.5, difficulty: 24 },
  { name: 'Great Lady M Stakes',            trackId: 'del_mar',     weekNumber: 27, dayLabel: 'Sunday',
    purse:   500000, grade: 'G2', ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'dirt', distance: 6.5, difficulty: 33 },

  // ── Week 28: Fri Jul 12 / Sat Jul 13 / Sun Jul 14 ───────────────────────────
  { name: 'San Clemente Handicap',          trackId: 'del_mar',     weekNumber: 28, dayLabel: 'Saturday',
    purse:   300000, grade: 'G2', ageDivision: '3yo',  sexRestriction: 'fillies', surface: 'turf', distance: 8,   difficulty: 30 },
  { name: 'Pamplemousse Sprint',            trackId: 'del_mar',     weekNumber: 28, dayLabel: 'Sunday',
    purse:   300000, grade: 'G3', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'turf', distance: 5,   difficulty: 34 },
  { name: 'Wickerr Stakes',                 trackId: 'del_mar',     weekNumber: 28, dayLabel: 'Sunday',
    purse:   150000, grade: null, ageDivision: '3yo+', sexRestriction: 'open',    surface: 'turf', distance: 8,   difficulty: 32 },

  // ── Week 29: Fri Jul 19 / Sat Jul 20 / Sun Jul 21 ───────────────────────────
  { name: 'Bing Crosby Stakes',             trackId: 'del_mar',     weekNumber: 29, dayLabel: 'Friday',
    purse:  1000000, grade: 'G1', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'dirt', distance: 6,   difficulty: 38 },
  { name: 'Daisycutter Handicap',           trackId: 'del_mar',     weekNumber: 29, dayLabel: 'Saturday',
    purse:   300000, grade: null, ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'turf', distance: 5,   difficulty: 30 },
  { name: 'Osunitas Stakes',                trackId: 'del_mar',     weekNumber: 29, dayLabel: 'Sunday',
    purse:   200000, grade: null, ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'turf', distance: 8,   difficulty: 29 },

  // ── Week 30: Sat Jul 27 / Sun Jul 28 ──────────────────────────────────────────────────────
  { name: 'La Jolla Handicap',              trackId: 'del_mar',     weekNumber: 30, dayLabel: 'Saturday',
    purse:   200000, grade: 'G3', ageDivision: '3yo',  sexRestriction: 'open',    surface: 'turf', distance: 8.5, difficulty: 33 },
  { name: 'Eddie Read Stakes',              trackId: 'del_mar',     weekNumber: 30, dayLabel: 'Saturday',
    purse:  1000000, grade: 'G2', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'turf', distance: 9,   difficulty: 37 },
  { name: 'San Diego Handicap',             trackId: 'del_mar',     weekNumber: 30, dayLabel: 'Sunday',
    purse:   500000, grade: 'G2', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'dirt', distance: 8.5, difficulty: 36 },

  // ── Week 31: Sat Aug 3 ───────────────────────────────────────────────────────
  { name: 'Clement L Hirsch Stakes',        trackId: 'del_mar',     weekNumber: 31, dayLabel: 'Saturday',
    purse:  1000000, grade: 'G1', ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'dirt', distance: 8.5, difficulty: 35 },

  // ── Week 32: Sat Aug 10 ──────────────────────────────────────────────────────
  { name: 'Best Pal Stakes',                trackId: 'del_mar',     weekNumber: 32, dayLabel: 'Saturday',
    purse:   200000, grade: 'G3', ageDivision: '2yo',  sexRestriction: 'open',    surface: 'dirt', distance: 6,   difficulty: 25 },
  { name: 'Sorrento Stakes',                trackId: 'del_mar',     weekNumber: 32, dayLabel: 'Saturday',
    purse:   200000, grade: 'G3', ageDivision: '2yo',  sexRestriction: 'fillies', surface: 'dirt', distance: 6,   difficulty: 22 },

  // ── Week 33: Fri Aug 16 / Sat Aug 17 ────────────────────────────────────────
  { name: 'Yellow Ribbon Handicap',         trackId: 'del_mar',     weekNumber: 33, dayLabel: 'Friday',
    purse:   500000, grade: 'G2', ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'turf', distance: 8.5, difficulty: 32 },
  { name: 'CTT and TOC Stakes',             trackId: 'del_mar',     weekNumber: 33, dayLabel: 'Friday',
    purse:   300000, grade: null, ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'turf', distance: 10,  difficulty: 31 },
  { name: 'Rancho Bernardo Stakes',         trackId: 'del_mar',     weekNumber: 33, dayLabel: 'Saturday',
    purse:   300000, grade: 'G3', ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'dirt', distance: 6.5, difficulty: 31 },
  { name: 'Pacific Sprint',                 trackId: 'del_mar',     weekNumber: 33, dayLabel: 'Saturday',
    purse:  1000000, grade: 'G1', ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'turf', distance: 5,   difficulty: 35 },

  // ── Week 34: Sat Aug 24 / Sun Aug 25 ────────────────────────────────────────
  { name: 'Pacific Classic',                trackId: 'del_mar',     weekNumber: 34, dayLabel: 'Saturday',
    purse:  1000000, grade: 'G1', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'dirt', distance: 10,  difficulty: 38 },
  { name: 'Del Mar Oaks',                   trackId: 'del_mar',     weekNumber: 34, dayLabel: 'Saturday',
    purse:  1000000, grade: 'G1', ageDivision: '3yo',  sexRestriction: 'fillies', surface: 'turf', distance: 9,   difficulty: 32 },
  { name: 'Del Mar Mile',                   trackId: 'del_mar',     weekNumber: 34, dayLabel: 'Saturday',
    purse:  1000000, grade: 'G2', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'turf', distance: 8,   difficulty: 37 },
  { name: 'Green Flash Handicap',           trackId: 'del_mar',     weekNumber: 34, dayLabel: 'Saturday',
    purse:  1000000, grade: 'G2', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'turf', distance: 5,   difficulty: 37 },
  { name: 'Del Mar Derby',                  trackId: 'del_mar',     weekNumber: 34, dayLabel: 'Sunday',
    purse:  1000000, grade: 'G2', ageDivision: '3yo',  sexRestriction: 'open',    surface: 'turf', distance: 9,   difficulty: 35 },

  // ── Week 35: Sat Aug 31 / Sun Sep 1 ─────────────────────────────────────────
  { name: 'Del Mar Handicap',               trackId: 'del_mar',     weekNumber: 35, dayLabel: 'Saturday',
    purse:  1000000, grade: 'G2', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'turf', distance: 10,  difficulty: 37 },
  { name: "Pat O'Brien Stakes",             trackId: 'del_mar',     weekNumber: 35, dayLabel: 'Saturday',
    purse:  1000000, grade: 'G2', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'dirt', distance: 7,   difficulty: 36 },
  { name: 'Torrey Pines Stakes',            trackId: 'del_mar',     weekNumber: 35, dayLabel: 'Sunday',
    purse:   300000, grade: 'G3', ageDivision: '3yo',  sexRestriction: 'fillies', surface: 'dirt', distance: 8,   difficulty: 29 },

  // ── Week 36: Sat Sep 7 / Sun Sep 8 ──────────────────────────────────────────
  { name: 'Del Mar Debutante',              trackId: 'del_mar',     weekNumber: 36, dayLabel: 'Saturday',
    purse:   300000, grade: 'G1', ageDivision: '2yo',  sexRestriction: 'fillies', surface: 'dirt', distance: 7,   difficulty: 24 },
  { name: 'Del Mar Juvenile Turf',          trackId: 'del_mar',     weekNumber: 36, dayLabel: 'Saturday',
    purse:   150000, grade: 'G3', ageDivision: '2yo',  sexRestriction: 'open',    surface: 'turf', distance: 8,   difficulty: 25 },
  { name: 'Tranquility Lake Stakes',        trackId: 'del_mar',     weekNumber: 36, dayLabel: 'Saturday',
    purse:   200000, grade: null, ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'dirt', distance: 8,   difficulty: 30 },
  { name: 'Del Mar Futurity',               trackId: 'del_mar',     weekNumber: 36, dayLabel: 'Sunday',
    purse:   300000, grade: 'G1', ageDivision: '2yo',  sexRestriction: 'open',    surface: 'dirt', distance: 7,   difficulty: 27 },
  { name: 'Del Mar Juvenile Fillies Turf',  trackId: 'del_mar',     weekNumber: 36, dayLabel: 'Sunday',
    purse:   150000, grade: null, ageDivision: '2yo',  sexRestriction: 'fillies', surface: 'turf', distance: 8,   difficulty: 22 },

  // ── Week 37: Sat Sep 14 / Sun Sep 15 ────────────────────────────────────────
  { name: 'John C. Mabee Stakes',           trackId: 'del_mar',     weekNumber: 37, dayLabel: 'Saturday',
    purse:   500000, grade: 'G2', ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'turf', distance: 9,   difficulty: 33 },
  { name: 'Shared Belief Stakes',           trackId: 'del_mar',     weekNumber: 37, dayLabel: 'Sunday',
    purse:   400000, grade: null, ageDivision: '3yo',  sexRestriction: 'open',    surface: 'dirt', distance: 8,   difficulty: 32 },

  // ══ SANTA ANITA PARK — FALL MEET (Weeks 39–44) ═══════════════════════════════

  // ── Week 39: Fri Sep 27 / Sat Sep 28 / Sun Sep 29 ───────────────────────────
  { name: 'City of Hope Mile',              trackId: 'santa_anita', weekNumber: 39, dayLabel: 'Friday',
    purse:   500000, grade: 'G2', ageDivision: '3yo',  sexRestriction: 'open',    surface: 'turf', distance: 8,   difficulty: 34 },
  { name: 'Cedar Stakes',                   trackId: 'santa_anita', weekNumber: 39, dayLabel: 'Friday',
    purse:   200000, grade: null, ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'turf', distance: 6,   difficulty: 30 },
  { name: 'Chillingworth Stakes',           trackId: 'santa_anita', weekNumber: 39, dayLabel: 'Saturday',
    purse:   250000, grade: 'G3', ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'dirt', distance: 6.5, difficulty: 31 },
  { name: 'Eddie D Stakes',                 trackId: 'santa_anita', weekNumber: 39, dayLabel: 'Saturday',
    purse:   400000, grade: 'G2', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'turf', distance: 6,   difficulty: 35 },
  { name: 'John C Harris Stakes',           trackId: 'santa_anita', weekNumber: 39, dayLabel: 'Sunday',
    purse:   150000, grade: null, ageDivision: '3yo',  sexRestriction: 'fillies', surface: 'turf', distance: 6,   difficulty: 28 },
  { name: 'Santa Anita Sprint Championship', trackId: 'santa_anita', weekNumber: 39, dayLabel: 'Sunday',
    purse:   400000, grade: 'G2', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'dirt', distance: 6,   difficulty: 35 },

  // ── Week 40: Fri Oct 4 / Sat Oct 5 / Sun Oct 6 ──────────────────────────────
  { name: 'Zenyatta Stakes',                trackId: 'santa_anita', weekNumber: 40, dayLabel: 'Friday',
    purse:   500000, grade: 'G2', ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'dirt', distance: 8.5, difficulty: 33 },
  { name: 'Zuma Beach Stakes',              trackId: 'santa_anita', weekNumber: 40, dayLabel: 'Friday',
    purse:   200000, grade: 'G3', ageDivision: '2yo',  sexRestriction: 'open',    surface: 'turf', distance: 8,   difficulty: 27 },
  { name: 'Anoakia Stakes',                 trackId: 'santa_anita', weekNumber: 40, dayLabel: 'Friday',
    purse:   150000, grade: null, ageDivision: '2yo',  sexRestriction: 'fillies', surface: 'dirt', distance: 6,   difficulty: 23 },
  { name: 'Goodwood Stakes',                trackId: 'santa_anita', weekNumber: 40, dayLabel: 'Saturday',
    purse:   500000, grade: 'G1', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'dirt', distance: 9,   difficulty: 36 },
  { name: 'American Pharoah Stakes',        trackId: 'santa_anita', weekNumber: 40, dayLabel: 'Saturday',
    purse:   500000, grade: 'G1', ageDivision: '2yo',  sexRestriction: 'open',    surface: 'dirt', distance: 8.5, difficulty: 29 },
  { name: 'Oak Leaf Stakes',                trackId: 'santa_anita', weekNumber: 40, dayLabel: 'Saturday',
    purse:   500000, grade: 'G2', ageDivision: '2yo',  sexRestriction: 'fillies', surface: 'dirt', distance: 8.5, difficulty: 26 },
  { name: 'John Henry Turf Championship',   trackId: 'santa_anita', weekNumber: 40, dayLabel: 'Sunday',
    purse:   500000, grade: 'G2', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'turf', distance: 9,   difficulty: 36 },
  { name: 'Rodeo Drive Stakes',             trackId: 'santa_anita', weekNumber: 40, dayLabel: 'Sunday',
    purse:   750000, grade: 'G2', ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'turf', distance: 10,  difficulty: 33 },
  { name: 'Surfer Girl Stakes',             trackId: 'santa_anita', weekNumber: 40, dayLabel: 'Sunday',
    purse:   200000, grade: 'G3', ageDivision: '2yo',  sexRestriction: 'fillies', surface: 'turf', distance: 8,   difficulty: 24 },

  // ── Week 41: Sat Oct 12 ──────────────────────────────────────────────────────
  { name: 'Speakeasy Stakes',               trackId: 'santa_anita', weekNumber: 41, dayLabel: 'Saturday',
    purse:   150000, grade: null, ageDivision: '2yo',  sexRestriction: 'open',    surface: 'turf', distance: 6,   difficulty: 27 },

  // ── Week 42: Sat Oct 19 ──────────────────────────────────────────────────────
  { name: 'Swingtime Stakes',               trackId: 'santa_anita', weekNumber: 42, dayLabel: 'Saturday',
    purse:   150000, grade: null, ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'turf', distance: 8,   difficulty: 29 },

  // ── Week 43: Sat Oct 26 ──────────────────────────────────────────────────────
  { name: 'Autumn Miss Stakes',             trackId: 'santa_anita', weekNumber: 43, dayLabel: 'Saturday',
    purse:   250000, grade: 'G3', ageDivision: '3yo',  sexRestriction: 'fillies', surface: 'turf', distance: 8,   difficulty: 30 },

  // ── Week 44: Sat Nov 2 / Sun Nov 3 ──────────────────────────────────────────
  { name: 'Twilight Derby',                 trackId: 'santa_anita', weekNumber: 44, dayLabel: 'Saturday',
    purse:   400000, grade: 'G3', ageDivision: '3yo',  sexRestriction: 'open',    surface: 'turf', distance: 9,   difficulty: 33 },
  { name: 'Tokyo City Cup',                 trackId: 'santa_anita', weekNumber: 44, dayLabel: 'Sunday',
    purse:   200000, grade: 'G3', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'dirt', distance: 10,  difficulty: 33 },

  // ══ DEL MAR — FALL MEET (Weeks 45–49) ════════════════════════════════════════

  // ── Week 45: Thu Nov 7 / Fri Nov 8 / Sat Nov 9 / Sun Nov 10 ────────────────
  { name: 'Let It Ride Stakes',             trackId: 'del_mar',     weekNumber: 45, dayLabel: 'Thursday',
    purse:   150000, grade: null, ageDivision: '3yo',  sexRestriction: 'open',    surface: 'turf', distance: 5,   difficulty: 32 },
  { name: 'Desi Arnaz Stakes',              trackId: 'del_mar',     weekNumber: 45, dayLabel: 'Friday',
    purse:   150000, grade: null, ageDivision: '2yo',  sexRestriction: 'fillies', surface: 'dirt', distance: 7,   difficulty: 25 },
  { name: 'Bob Hope Stakes',                trackId: 'del_mar',     weekNumber: 45, dayLabel: 'Friday',
    purse:   200000, grade: 'G3', ageDivision: '2yo',  sexRestriction: 'open',    surface: 'dirt', distance: 7,   difficulty: 28 },
  { name: 'Thoroughbred Aftercare Alliance Stakes', trackId: 'del_mar', weekNumber: 45, dayLabel: 'Saturday',
    purse:   200000, grade: null, ageDivision: '2yo',  sexRestriction: 'open',    surface: 'turf', distance: 8,   difficulty: 28 },
  { name: 'Senator Ken Maddy Stakes',       trackId: 'del_mar',     weekNumber: 45, dayLabel: 'Saturday',
    purse:   200000, grade: null, ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'turf', distance: 5,   difficulty: 30 },
  { name: 'Goldikova Stakes',               trackId: 'del_mar',     weekNumber: 45, dayLabel: 'Sunday',
    purse:   300000, grade: 'G3', ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'turf', distance: 8,   difficulty: 31 },

  // ── Week 47: Sat Nov 23 ──────────────────────────────────────────────────────
  { name: 'Red Carpet Stakes',              trackId: 'del_mar',     weekNumber: 47, dayLabel: 'Saturday',
    purse:   300000, grade: 'G3', ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'turf', distance: 10,  difficulty: 31 },

  // ── Week 48: Fri Nov 29 / Sat Nov 30 / Sun Dec 1 ────────────────────────────
  { name: 'Del Mar Sprint',                 trackId: 'del_mar',     weekNumber: 48, dayLabel: 'Friday',
    purse:   400000, grade: 'G3', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'dirt', distance: 6,   difficulty: 34 },
  { name: 'Native Diver Stakes',            trackId: 'del_mar',     weekNumber: 48, dayLabel: 'Friday',
    purse:   250000, grade: 'G3', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'dirt', distance: 9,   difficulty: 34 },
  { name: 'Hollywood Turf Cup',             trackId: 'del_mar',     weekNumber: 48, dayLabel: 'Friday',
    purse:   500000, grade: 'G2', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'turf', distance: 10,  difficulty: 36 },
  { name: 'Hollywood Derby',                trackId: 'del_mar',     weekNumber: 48, dayLabel: 'Saturday',
    purse:   750000, grade: 'G1', ageDivision: '3yo',  sexRestriction: 'open',    surface: 'turf', distance: 9,   difficulty: 37 },
  { name: 'Seabiscuit Handicap',            trackId: 'del_mar',     weekNumber: 48, dayLabel: 'Saturday',
    purse:   500000, grade: 'G2', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'turf', distance: 8,   difficulty: 36 },
  { name: 'Jimmy Durante Stakes',           trackId: 'del_mar',     weekNumber: 48, dayLabel: 'Saturday',
    purse:   200000, grade: 'G3', ageDivision: '2yo',  sexRestriction: 'fillies', surface: 'turf', distance: 8,   difficulty: 27 },
  { name: 'Matriarch Stakes',               trackId: 'del_mar',     weekNumber: 48, dayLabel: 'Sunday',
    purse:   750000, grade: 'G1', ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'turf', distance: 8,   difficulty: 35 },
  { name: 'Bayakoa Stakes',                 trackId: 'del_mar',     weekNumber: 48, dayLabel: 'Sunday',
    purse:   200000, grade: 'G3', ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'dirt', distance: 8,   difficulty: 31 },
  { name: 'Cecil B Deille Stakes',          trackId: 'del_mar',     weekNumber: 48, dayLabel: 'Sunday',
    purse:   200000, grade: 'G3', ageDivision: '2yo',  sexRestriction: 'open',    surface: 'turf', distance: 8,   difficulty: 30 },
  { name: 'Stormy Liberal Stakes',          trackId: 'del_mar',     weekNumber: 48, dayLabel: 'Sunday',
    purse:   250000, grade: null, ageDivision: '3yo+', sexRestriction: 'open',    surface: 'turf', distance: 5,   difficulty: 34 },

  // ── Week 49: Sat Dec 7 / Sun Dec 8 ──────────────────────────────────────────
  { name: 'CashCall Futurity',              trackId: 'del_mar',     weekNumber: 49, dayLabel: 'Saturday',
    purse:   500000, grade: 'G1', ageDivision: '2yo',  sexRestriction: 'open',    surface: 'dirt', distance: 8.5, difficulty: 31 },
  { name: 'Starlet Stakes',                 trackId: 'del_mar',     weekNumber: 49, dayLabel: 'Sunday',
    purse:   300000, grade: 'G2', ageDivision: '2yo',  sexRestriction: 'fillies', surface: 'dirt', distance: 8.5, difficulty: 28 },

  // ══ SANTA ANITA PARK — WEEK 52 (Dec 26–28) ═══════════════════════════════════

  // ── Week 52: Thu Dec 26 ──────────────────────────────────────────────────────
  { name: 'Malibu Stakes',                  trackId: 'santa_anita', weekNumber: 52, dayLabel: 'Thursday',
    purse:  1000000, grade: 'G1', ageDivision: '3yo',  sexRestriction: 'open',    surface: 'dirt', distance: 7,   difficulty: 37 },
  { name: 'La Brea Stakes',                 trackId: 'santa_anita', weekNumber: 52, dayLabel: 'Thursday',
    purse:  1000000, grade: 'G1', ageDivision: '3yo',  sexRestriction: 'fillies', surface: 'dirt', distance: 7,   difficulty: 34 },
  { name: 'American Oaks',                  trackId: 'santa_anita', weekNumber: 52, dayLabel: 'Thursday',
    purse:  1000000, grade: 'G1', ageDivision: '3yo',  sexRestriction: 'fillies', surface: 'turf', distance: 10,  difficulty: 35 },
  { name: 'Laffit Pincay Jr Stakes',        trackId: 'santa_anita', weekNumber: 52, dayLabel: 'Thursday',
    purse:   500000, grade: 'G2', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'dirt', distance: 8.5, difficulty: 36 },
  { name: 'Mathis Mile',                    trackId: 'santa_anita', weekNumber: 52, dayLabel: 'Thursday',
    purse:   500000, grade: 'G2', ageDivision: '3yo',  sexRestriction: 'open',    surface: 'turf', distance: 8,   difficulty: 36 },
  { name: 'San Gabriel Stakes',             trackId: 'santa_anita', weekNumber: 52, dayLabel: 'Thursday',
    purse:   200000, grade: 'G3', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'turf', distance: 9,   difficulty: 34 },

  // ── Week 52: Fri Dec 27 ──────────────────────────────────────────────────────
  { name: 'Joe Hernandez Stakes',           trackId: 'santa_anita', weekNumber: 52, dayLabel: 'Friday',
    purse:   500000, grade: 'G2', ageDivision: '3yo+', sexRestriction: 'open',    surface: 'turf', distance: 6,   difficulty: 37 },

  // ── Week 52: Sat Dec 28 ──────────────────────────────────────────────────────
  { name: 'Robert J Frankel Stakes',        trackId: 'santa_anita', weekNumber: 52, dayLabel: 'Saturday',
    purse:   400000, grade: 'G3', ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'turf', distance: 9,   difficulty: 32 },
  { name: 'Blue Norther Stakes',            trackId: 'santa_anita', weekNumber: 52, dayLabel: 'Saturday',
    purse:   150000, grade: 'L',  ageDivision: '2yo',  sexRestriction: 'fillies', surface: 'turf', distance: 8,   difficulty: 27 },
  { name: 'Eddie Logan Stakes',             trackId: 'santa_anita', weekNumber: 52, dayLabel: 'Saturday',
    purse:   150000, grade: null, ageDivision: '2yo',  sexRestriction: 'open',    surface: 'turf', distance: 8,   difficulty: 30 },
];
// §BUILD_END:STAKES_SCHEDULE

// ── Save-file signing key ─────────────────────────────────────────────────────
// Used to generate an HMAC-SHA256 signature over every save file.
// Because this key lives in client-side JS it won't stop a determined player,
// but it prevents casual JSON editing without opening DevTools.
const SAVE_HMAC_KEY = 'SimTB_2026_b3t4!xK9#mPv7nQ4_LrFw8';

// ── Stallion roster ───────────────────────────────────────────────────────────
// Source: Stallions.csv.  Speed and surface are hidden from the player.
// §BUILD_START:STALLIONS
const STALLIONS = [
  { name: 'Into Mischief',     studFee: 250000, speed: 45, surface: 'dirt' },
  { name: 'Not This Time',     studFee: 250000, speed: 45, surface: 'both' },
  { name: 'Gun Runner',        studFee: 250000, speed: 45, surface: 'dirt' },
  { name: 'Curlin',            studFee: 225000, speed: 45, surface: 'dirt' },
  { name: 'Justify',           studFee: 200000, speed: 44, surface: 'turf' },
  { name: 'Tapit',             studFee: 185000, speed: 40, surface: 'dirt' },
  { name: 'Nyquist',           studFee: 175000, speed: 44, surface: 'dirt' },
  { name: 'Good Magic',        studFee: 125000, speed: 43, surface: 'dirt' },
  { name: 'Flightline',        studFee: 125000, speed: 43, surface: 'dirt' },
  { name: 'Constitution',      studFee: 110000, speed: 43, surface: 'dirt' },
  { name: 'Vekoma',            studFee: 100000, speed: 42, surface: 'dirt' },
  { name: 'Quality Road',      studFee: 100000, speed: 43, surface: 'both' },
  { name: 'Twirling Candy',    studFee:  75000, speed: 42, surface: 'both' },
  { name: 'Practical Joke',    studFee:  75000, speed: 42, surface: 'dirt' },
  { name: 'Omaha Beach',       studFee:  75000, speed: 42, surface: 'turf' },
  { name: 'McKinzie',          studFee:  75000, speed: 41, surface: 'dirt' },
  { name: 'Candy Ride',        studFee:  60000, speed: 41, surface: 'both' },
  { name: 'Yaupon',            studFee:  60000, speed: 40, surface: 'dirt' },
  { name: 'Life is Good',      studFee:  60000, speed: 41, surface: 'dirt' },
  { name: "Cody's Wish",       studFee:  60000, speed: 41, surface: 'dirt' },
  { name: "Liam's Map",        studFee:  50000, speed: 41, surface: 'dirt' },
  { name: 'Munnings',          studFee:  45000, speed: 40, surface: 'both' },
  { name: 'Street Sense',      studFee:  40000, speed: 40, surface: 'both' },
  { name: 'Tiz the Law',       studFee:  40000, speed: 39, surface: 'turf' },
  { name: 'City of Light',     studFee:  35000, speed: 41, surface: 'both' },
  { name: 'National Treasure', studFee:  35000, speed: 40, surface: 'dirt' },
  { name: "Maclean's Music",   studFee:  30000, speed: 38, surface: 'both' },
  { name: 'Arabian Knight',    studFee:  30000, speed: 39, surface: 'both' },
  { name: 'Muth',              studFee:  30000, speed: 39, surface: 'both' },
  { name: 'Prince of Monaco',  studFee:  30000, speed: 39, surface: 'both' },
  { name: "Bolt d'Oro",        studFee:  25000, speed: 39, surface: 'dirt' },
  { name: 'Domestic Product',  studFee:  25000, speed: 39, surface: 'turf' },
  { name: 'Golden Pal',        studFee:  25000, speed: 38, surface: 'turf' },
  { name: 'Cogburn',           studFee:  25000, speed: 39, surface: 'turf' },
  { name: 'Charlatan',         studFee:  25000, speed: 39, surface: 'dirt' },
  { name: 'Taiba',             studFee:  25000, speed: 38, surface: 'dirt' },
  { name: "Jackie's Warrior",  studFee:  25000, speed: 40, surface: 'dirt' },
  { name: 'Gunite',            studFee:  25000, speed: 39, surface: 'dirt' },
  { name: 'Hard Spun',         studFee:  20000, speed: 38, surface: 'both' },
  { name: 'Maximus Mischief',  studFee:  20000, speed: 38, surface: 'both' },
  { name: 'Kingsbarns',        studFee:  17500, speed: 38, surface: 'both' },
  { name: 'Newgate',           studFee:  17500, speed: 38, surface: 'both' },
  { name: 'Midshipman',        studFee:  15000, speed: 38, surface: 'both' },
  { name: 'Frosted',           studFee:  12500, speed: 37, surface: 'both' },
  { name: 'Charge It',         studFee:  12500, speed: 37, surface: 'both' },
  { name: 'Bucchero',          studFee:  12500, speed: 37, surface: 'dirt' },
  { name: 'Goldencents',       studFee:  10000, speed: 38, surface: 'both' },
  { name: 'Mitole',            studFee:  10000, speed: 36, surface: 'dirt' },
  { name: 'Kantharos',         studFee:  10000, speed: 37, surface: 'both' },
  { name: 'Connect',           studFee:  10000, speed: 37, surface: 'both' },
  { name: 'Vino Rosso',        studFee:   7500, speed: 37, surface: 'both' },
  { name: 'Audible',           studFee:   7500, speed: 37, surface: 'both' },
  { name: 'Mo Town',           studFee:   7500, speed: 37, surface: 'both' },
];
// §BUILD_END:STALLIONS

// ── Breeders' Cup Schedule ────────────────────────────────────────────────────
// Always held at Keeneland, Week 44.
// Nov 1 = Friday of Wk 44 (dayOffset +3); Nov 2 = Saturday of Wk 44 (dayOffset +4).
// §BUILD_START:BREEDERS_CUP
const BREEDERS_CUP_SCHEDULE = [
  // ── Day 1: Friday, November 1 ────────────────────────────────────────────
  { name: "Breeders' Cup Juvenile Turf Sprint",   trackId: 'keeneland', trackName: 'Keeneland',
    weekNumber: 44, dayLabel: 'Friday',   purse:  1000000, grade: 'G1',
    ageDivision: '2yo',  sexRestriction: 'open',    surface: 'turf', distance:  5.5, difficulty: 31 },
  { name: "Breeders' Cup Juvenile Fillies",        trackId: 'keeneland', trackName: 'Keeneland',
    weekNumber: 44, dayLabel: 'Friday',   purse:  2000000, grade: 'G1',
    ageDivision: '2yo',  sexRestriction: 'fillies', surface: 'dirt', distance:  8.5, difficulty: 29 },
  { name: "Breeders' Cup Juvenile Fillies Turf",   trackId: 'keeneland', trackName: 'Keeneland',
    weekNumber: 44, dayLabel: 'Friday',   purse:  1000000, grade: 'G1',
    ageDivision: '2yo',  sexRestriction: 'fillies', surface: 'turf', distance:  8,   difficulty: 29 },
  { name: "Breeders' Cup Juvenile",                trackId: 'keeneland', trackName: 'Keeneland',
    weekNumber: 44, dayLabel: 'Friday',   purse:  2000000, grade: 'G1',
    ageDivision: '2yo',  sexRestriction: 'open',    surface: 'dirt', distance:  8.5, difficulty: 32 },
  { name: "Breeders' Cup Juvenile Turf",           trackId: 'keeneland', trackName: 'Keeneland',
    weekNumber: 44, dayLabel: 'Friday',   purse:  1000000, grade: 'G1',
    ageDivision: '2yo',  sexRestriction: 'open',    surface: 'turf', distance:  8,   difficulty: 32 },
  // ── Day 2: Saturday, November 2 ──────────────────────────────────────────
  { name: "Breeders' Cup Dirt Mile",               trackId: 'keeneland', trackName: 'Keeneland',
    weekNumber: 44, dayLabel: 'Saturday', purse:  1000000, grade: 'G1',
    ageDivision: '3yo+', sexRestriction: 'open',    surface: 'dirt', distance:  8,   difficulty: 39 },
  { name: "Breeders' Cup Turf Sprint",             trackId: 'keeneland', trackName: 'Keeneland',
    weekNumber: 44, dayLabel: 'Saturday', purse:  1000000, grade: 'G1',
    ageDivision: '3yo+', sexRestriction: 'open',    surface: 'turf', distance:  5.5, difficulty: 40 },
  { name: "Breeders' Cup Sprint",                  trackId: 'keeneland', trackName: 'Keeneland',
    weekNumber: 44, dayLabel: 'Saturday', purse:  2000000, grade: 'G1',
    ageDivision: '3yo+', sexRestriction: 'open',    surface: 'dirt', distance:  6,   difficulty: 40 },
  { name: "Breeders' Cup Filly and Mare Turf",     trackId: 'keeneland', trackName: 'Keeneland',
    weekNumber: 44, dayLabel: 'Saturday', purse:  2000000, grade: 'G1',
    ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'turf', distance:  9.5, difficulty: 38 },
  { name: "Breeders' Cup Filly and Mare Sprint",   trackId: 'keeneland', trackName: 'Keeneland',
    weekNumber: 44, dayLabel: 'Saturday', purse:  1000000, grade: 'G1',
    ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'dirt', distance:  7,   difficulty: 37 },
  { name: "Breeders' Cup Mile",                    trackId: 'keeneland', trackName: 'Keeneland',
    weekNumber: 44, dayLabel: 'Saturday', purse:  2000000, grade: 'G1',
    ageDivision: '3yo+', sexRestriction: 'open',    surface: 'turf', distance:  8,   difficulty: 40 },
  { name: "Breeders' Cup Distaff",                 trackId: 'keeneland', trackName: 'Keeneland',
    weekNumber: 44, dayLabel: 'Saturday', purse:  2000000, grade: 'G1',
    ageDivision: '3yo+', sexRestriction: 'fillies', surface: 'dirt', distance:  9,   difficulty: 38 },
  { name: "Breeders' Cup Turf",                    trackId: 'keeneland', trackName: 'Keeneland',
    weekNumber: 44, dayLabel: 'Saturday', purse:  5000000, grade: 'G1',
    ageDivision: '3yo+', sexRestriction: 'open',    surface: 'turf', distance: 10,   difficulty: 41 },
  { name: "Breeders' Cup Classic",                 trackId: 'keeneland', trackName: 'Keeneland',
    weekNumber: 44, dayLabel: 'Saturday', purse:  7000000, grade: 'G1',
    ageDivision: '3yo+', sexRestriction: 'open',    surface: 'dirt', distance: 10,   difficulty: 41 },
];
// §BUILD_END:BREEDERS_CUP

// ── Triple Crown Schedule ─────────────────────────────────────────────────────
// Kentucky Derby:  Wk 18, Sat May 4   (Churchill Downs) — field capped at 20
// Preakness:       Wk 20, Sat May 18  (Pimlico)
// Belmont Stakes:  Wk 23, Sat Jun 8   (Belmont Park)
// KY Derby qualification: top-3 finish in San Felipe Stakes OR Santa Anita Derby
// §BUILD_START:TRIPLE_CROWN
const TRIPLE_CROWN_SCHEDULE = [
  { name: 'Kentucky Derby',   trackId: 'churchill_downs', trackName: 'Churchill Downs',
    weekNumber: 18, dayLabel: 'Saturday', purse: 5000000, grade: 'G1',
    ageDivision: '3yo', sexRestriction: 'open', surface: 'dirt', distance: 10,   difficulty: 36,
    fixedFieldSize: 20, requiresQualification: 'kentucky_derby' },
  { name: 'Preakness Stakes', trackId: 'pimlico',         trackName: 'Pimlico',
    weekNumber: 20, dayLabel: 'Saturday', purse: 2000000, grade: 'G1',
    ageDivision: '3yo', sexRestriction: 'open', surface: 'dirt', distance:  9.5, difficulty: 35 },
  { name: 'Belmont Stakes',   trackId: 'belmont',          trackName: 'Belmont Park',
    weekNumber: 23, dayLabel: 'Saturday', purse: 2000000, grade: 'G1',
    ageDivision: '3yo', sexRestriction: 'open', surface: 'dirt', distance: 12,   difficulty: 36 },
];
// §BUILD_END:TRIPLE_CROWN

let _idCounter = 1;
function uid() { return 'id_' + (_idCounter++) + '_' + Math.random().toString(36).slice(2, 6); }
