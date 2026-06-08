#!/usr/bin/env node
// ─── build.js ─────────────────────────────────────────────────────────────────
// Reads CSV files and regenerates marked sections of js/data.js.
// Usage:  node build.js
//
// Sections managed (markers in data.js):
//   §BUILD_START:STAKES_SCHEDULE   ← SoCalStakes.csv
//   §BUILD_START:STALLIONS         ← Stallions.csv
//   §BUILD_START:BREEDERS_CUP      ← BreedersCupStakes.csv
//   §BUILD_START:TRIPLE_CROWN      ← TripleCrownStakes.csv
'use strict';

const fs   = require('fs');
const path = require('path');

// ── Money / number helpers ────────────────────────────────────────────────────

function parseMoney(str) {
  return parseInt(String(str || 0).replace(/[$,\s"]/g, '')) || 0;
}

function num(str) {
  return parseFloat(String(str || 0).replace('f', '')) || 0;
}

// ── Date → week + day-label ───────────────────────────────────────────────────
// Game calendar: Jan 1 = Tuesday (matches real 2019 calendar).
// Week 1 covers Jan 1–7;  week N = days (N-1)*7+1 through N*7.

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_MAP  = {
  Jan:1, Feb:2, Mar:3, Apr:4, May:5,  Jun:6,
  Jul:7, Aug:8, Sep:9, Oct:10,Nov:11, Dec:12
};
const DAY_NAMES = ['Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday','Monday'];

function dayOfYear(month, day) {
  let n = 0;
  for (let m = 0; m < month - 1; m++) n += MONTH_DAYS[m];
  return n + day;
}

// "4-Mar" | "1-Nov" → { weekNumber, dayLabel }
function parseDate(raw) {
  const [d, mon] = String(raw).trim().split('-');
  const month = MONTH_MAP[mon];
  if (!month) throw new Error(`Unknown month "${mon}" in date "${raw}"`);
  const doy = dayOfYear(month, parseInt(d));
  return {
    weekNumber: Math.ceil(doy / 7),
    dayLabel:   DAY_NAMES[(doy - 1) % 7],
  };
}

// ── Division string → ageDivision + sexRestriction ────────────────────────────
// "3yo F"    → { ageDivision:'3yo',  sexRestriction:'fillies' }
// "3yo+ F&M" → { ageDivision:'3yo+', sexRestriction:'fillies' }
// "2yo"      → { ageDivision:'2yo',  sexRestriction:'open'    }

function parseDivision(raw) {
  let s = String(raw).trim();
  let sex = 'open';
  if (/F&M|F\/M/i.test(s)) {
    sex = 'fillies';
    s = s.replace(/\s*(F&M|F\/M)/gi, '').trim();
  } else if (/ F$/i.test(s)) {
    sex = 'fillies';
    s = s.replace(/ F$/i, '').trim();
  }
  return { ageDivision: s, sexRestriction: sex };
}

// ── Track name → id / display name ───────────────────────────────────────────

const TRACK_ID_MAP = {
  'santa anita park': 'santa_anita',
  'santa anita':      'santa_anita',
  'del mar':          'del_mar',
  'keeneland':        'keeneland',
  'churchill downs':  'churchill_downs',
  'pimlico':          'pimlico',
  'belmont park':     'belmont',
  'belmont':          'belmont',
};
const TRACK_NAME_MAP = {
  santa_anita:     'Santa Anita Park',
  del_mar:         'Del Mar',
  keeneland:       'Keeneland',
  churchill_downs: 'Churchill Downs',
  pimlico:         'Pimlico',
  belmont:         'Belmont Park',
};

function toTrackId(name) {
  return TRACK_ID_MAP[String(name).trim().toLowerCase()]
    || String(name).trim().toLowerCase().replace(/\s+/g, '_');
}

// ── CSV parser ────────────────────────────────────────────────────────────────

function splitCSVLine(line) {
  const out = []; let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"')           inQ = !inQ;
    else if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ''; }
    else                      cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseCSV(filename) {
  const filepath = path.join(__dirname, filename);
  if (!fs.existsSync(filepath)) throw new Error(`File not found: ${filename}`);

  const lines = fs.readFileSync(filepath, 'utf8')
    .split('\n')
    .map(l => l.trim());

  // Find header row: first line whose first cell is "Date" or "Name"
  const headerIdx = lines.findIndex(l => /^"?(Date|Name)\b/i.test(l));
  if (headerIdx === -1) throw new Error(`Cannot find header row in ${filename}`);

  const headers = splitCSVLine(lines[headerIdx]);
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const vals = splitCSVLine(lines[i]);
    if (vals.every(v => !v)) continue; // skip blank rows
    const row = {};
    headers.forEach((h, idx) => { row[h.trim()] = (vals[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

// ── Code-generation helpers ───────────────────────────────────────────────────

function q(s)  { return JSON.stringify(String(s)); }           // quoted JS string
function gr(s) { return s ? `'${s}'` : 'null'; }              // grade or null

// ── Section generators ────────────────────────────────────────────────────────

function genStallions() {
  const rows = parseCSV('Stallions.csv').filter(r => r['Name']);
  const lines = rows.map(r =>
    `  { name: ${q(r['Name'])}, studFee: ${parseMoney(r['Stud Fee'])}, ` +
    `speed: ${num(r['Speed'])}, surface: '${r['Surface'].toLowerCase()}' }`
  );
  return `const STALLIONS = [\n${lines.join(',\n')},\n];`;
}

function stakesEntry(r) {
  const { weekNumber, dayLabel }        = parseDate(r['Date']);
  const { ageDivision, sexRestriction } = parseDivision(r['Division']);
  const tid = toTrackId(r['Track']);
  return (
    `  { name: ${q(r['Stake'])}, trackId: '${tid}', weekNumber: ${weekNumber}, dayLabel: '${dayLabel}',\n` +
    `    purse: ${parseMoney(r['Purse'])}, grade: ${gr(r['Grade'])}, ` +
    `ageDivision: '${ageDivision}', sexRestriction: '${sexRestriction}', ` +
    `surface: '${r['Surface'].toLowerCase()}', distance: ${num(r['Distance'])}, ` +
    `difficulty: ${num(r['Difficulty'])} }`
  );
}

function genStakesSchedule() {
  const rows = parseCSV('SoCalStakes.csv').filter(r => r['Date'] && r['Stake']);
  return `const STAKES_SCHEDULE = [\n${rows.map(stakesEntry).join(',\n')},\n];`;
}

function specialStakesEntry(r, extra = '') {
  const { weekNumber, dayLabel }        = parseDate(r['Date']);
  const { ageDivision, sexRestriction } = parseDivision(r['Division']);
  const tid   = toTrackId(r['Track']);
  const tname = TRACK_NAME_MAP[tid] || String(r['Track']).trim();
  return (
    `  { name: ${q(r['Stake'])}, trackId: '${tid}', trackName: ${q(tname)},\n` +
    `    weekNumber: ${weekNumber}, dayLabel: '${dayLabel}', ` +
    `purse: ${parseMoney(r['Purse'])}, grade: ${gr(r['Grade'])},\n` +
    `    ageDivision: '${ageDivision}', sexRestriction: '${sexRestriction}', ` +
    `surface: '${r['Surface'].toLowerCase()}', distance: ${num(r['Distance'])}, ` +
    `difficulty: ${num(r['Difficulty'])}${extra} }`
  );
}

function genBreedersCup() {
  const rows = parseCSV('BreedersCupStakes.csv').filter(r => r['Date'] && r['Stake']);
  return `const BREEDERS_CUP_SCHEDULE = [\n${rows.map(r => specialStakesEntry(r)).join(',\n')},\n];`;
}

function genTripleCrown() {
  const rows = parseCSV('TripleCrownStakes.csv').filter(r => r['Date'] && r['Stake']);
  const lines = rows.map(r => {
    const extra = r['Stake'] === 'Kentucky Derby'
      ? `,\n    fixedFieldSize: 20, requiresQualification: 'kentucky_derby'`
      : '';
    return specialStakesEntry(r, extra);
  });
  return `const TRIPLE_CROWN_SCHEDULE = [\n${lines.join(',\n')},\n];`;
}

// ── Section replacement ───────────────────────────────────────────────────────

const MARK_S = '// §BUILD_START:';
const MARK_E = '// §BUILD_END:';

function replaceSection(src, name, content) {
  const si = src.indexOf(MARK_S + name);
  const eiTag = MARK_E + name;
  const ei = src.indexOf(eiTag);
  if (si === -1 || ei === -1)
    throw new Error(
      `Markers not found in data.js:\n  ${MARK_S}${name}\n  ${MARK_E}${name}`
    );
  return (
    src.slice(0, si) +
    MARK_S + name + '\n' +
    content + '\n' +
    eiTag +
    src.slice(ei + eiTag.length)
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const DATAJS = path.join(__dirname, 'js', 'data.js');
let src = fs.readFileSync(DATAJS, 'utf8');

const SECTIONS = [
  ['STALLIONS',       genStallions,      'Stallions.csv'],
  ['STAKES_SCHEDULE', genStakesSchedule, 'SoCalStakes.csv'],
  ['BREEDERS_CUP',    genBreedersCup,    'BreedersCupStakes.csv'],
  ['TRIPLE_CROWN',    genTripleCrown,    'TripleCrownStakes.csv'],
];

console.log('SimThoroughbred build.js\n');
let ok = 0;
for (const [name, gen, csvFile] of SECTIONS) {
  try {
    const generated = gen();
    src = replaceSection(src, name, generated);
    console.log(`  ✓  ${name}  ←  ${csvFile}`);
    ok++;
  } catch (err) {
    console.error(`  ✗  ${name}: ${err.message}`);
  }
}

fs.writeFileSync(DATAJS, src, 'utf8');
console.log(`\n${ok}/${SECTIONS.length} sections updated → js/data.js`);
