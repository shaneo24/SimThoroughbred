# SimThoroughbred — Horse Racing Manager

## What this is
A browser-based horse racing stable management game. Pure HTML/CSS/JavaScript — no framework, no build step. Open `index.html` in a browser or serve with `python -m http.server 3333`.

## File structure
```
index.html          — Main HTML shell
style.css           — Full dark-theme stylesheet
js/
  data.js           — All static data: race types, track config, name lists, helper functions
  horse.js          — Horse class (stats, race scoring, training, injury, auction display)
  game.js           — GameState class (money, calendar, stable, condition book, save/load)
  race.js           — simulateRace(), generateConditionBook()
  canvas.js         — RaceCanvas animation class (HTML Canvas, ~9 sec animated race)
  ui.js             — UI class (all rendering + event handling)
  main.js           — Entry point, initializes game + ui
```

## Game loop
1. Player starts with $100,000
2. Buy horses at Auction (8 horses available, refresh anytime)
3. View Condition Book (bi-weekly race schedule for Santa Anita Park)
4. Enter a qualifying horse in a race (pays entry fee)
5. Advance weeks on Dashboard (costs $1,500/horse/week training)
6. On race week, click "Race Day!" → watch canvas animation → collect winnings
7. Horse fatigues after racing, recovers over ~3 weeks; random injury chance (8%) per race

## Save / Load
- **Auto-save:** localStorage on every action
- **Manual save:** downloads a `.json` file
- **Load:** file picker restores full game state

## Race types (Santa Anita Park)
All defined in `js/data.js` under `RACE_TYPES`:

| Key | Name | Purse | Eligibility | Claiming Price |
|-----|------|-------|-------------|----------------|
| MAIDEN | Maiden | $80,000 | Never won | — |
| MAIDEN_CLAIMING_50 | Maiden Claiming $50k | $50,000 | Never won | $50,000 |
| MAIDEN_CLAIMING_20 | Maiden Claiming $20k | $30,000 | Never won | $20,000 |
| ALLOWANCE_N2L | Allowance N2L | $85,000 | ≤1 win | — |
| CLAIMING_50 | Claiming $50k | $60,000 | Open | $50,000 |
| CLAIMING_50_N2L | Claiming $50k N2L | $55,000 | ≤1 win | $50,000 |
| CLAIMING_30 | Claiming $30k | $45,000 | Open | $30,000 |
| CLAIMING_25_N2L | Claiming $25k N2L | $33,000 | ≤1 win | $25,000 |
| CLAIMING_20 | Claiming $20k | $38,000 | Open | $20,000 |
| CLAIMING_10 | Claiming $10k | $32,000 | Open | $10,000 |
| STAKES | Stakes | $150,000 | Open | — |

**Payout split:** 60% / 20% / 10% / 7% / 3% (1st through 5th)

## Track: Santa Anita Park
- **Dirt:** 4.5f, 5f, 5.5f, 6f, 6.5f, 7f, 8f, 8.5f, 9f, 10f
- **Turf:** 6.5f, 8f, 8.5f, 9f, 10f, 11f
- Race days: Saturday & Sunday each weekend
- Condition book: 2-week period, 6 races per day

## Horse stats
- **Speed** (1–100): raw top speed; matters more in sprints (≤6.5f)
- **Stamina** (1–100): endurance; matters more in routes (>6.5f)
- **Potential** (1–100): hidden ceiling — horse trains toward this over time
- **Confidence** (1–100): affects consistency (±15% race score multiplier)
- **Fatigue** (0–100): increases after racing, recovers 12–18 pts/week
- **Injured:** boolean; takes 4–12 weeks to heal

## Race simulation algorithm (`js/race.js → simulateRace`)
```
sprintWeight = distance <= 6.5 ? 0.65 : 0.40
base = speed * sprintWeight + stamina * (1 - sprintWeight)
score = base * (1 - fatigue/200) * (0.85 + confidence/100 * 0.30) + gaussian(0, 7)
```
Sort descending by score → finishing order.

## Known future work
- Stakes races: user will provide full schedule for Santa Anita (names, purses, dates)
- Selling horses
- Breeding
- Retirement
- Multiple racetracks
- Advanced training options
- Multiplayer (would require a backend — Supabase was discussed as an option)

## Tone / approach
- User (Shane) is a horse racing domain expert — use correct terminology
- He is Python-focused; explain JS concepts in plain English if needed
- Keep the dark gold/navy visual theme consistent
- Don't add features without being asked — this is a phased build
