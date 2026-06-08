// ─── Stakes race history label ────────────────────────────────────────────────
// Abbreviates a stakes race name for display in the race history table.
// Graded/listed: "AmerOaks-G1"   Ungraded: "Cinema-200k"
function stakeShortLabel(name, grade, purse) {
  // Remove internal vowels from a word, keeping the first character
  const consonantFrame = w => w[0] + w.slice(1).replace(/[aeiou]/gi, '');

  const words = name
    .replace(/\bStakes\b/gi, '')   // strip "Stakes"
    .replace(/[^a-zA-Z\s]/g, '')  // strip apostrophes, periods, etc.
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 1);   // skip bare initials like "E", "B"

  let abbrev;
  if (words.length === 0) {
    abbrev = name.slice(0, 14);
  } else if (words.length === 1) {
    // Single word: keep whole, capped at 14
    abbrev = words[0].slice(0, 14);
  } else {
    const full = words.join('');
    if (full.length <= 14) {
      // Fits as-is
      abbrev = full;
    } else {
      // Pass 1: abbreviate every word except the last
      //   ≤5 chars → first letter only
      //   ≥6 chars → consonant frame
      const abbrNonLast = w => w.length <= 5 ? w[0] : consonantFrame(w);
      const pass1 = words.slice(0, -1).map(abbrNonLast).join('') + words[words.length - 1];
      if (pass1.length <= 14) {
        abbrev = pass1;
      } else {
        // Pass 2: consonant-frame every word, cap at 14
        abbrev = words.map(consonantFrame).join('').slice(0, 14);
      }
    }
  }

  const suffix = grade
    ? grade
    : (purse >= 1000000
        ? (purse / 1000000) + 'M'
        : Math.round(purse / 1000) + 'k');
  return abbrev + '-' + suffix;
}

// ─── UI Controller ────────────────────────────────────────────────────────────

class UI {
  constructor(game) {
    this.game                = game;
    this.activeScreen        = 'dashboard';
    this._conditionBookTab   = 'socal'; // 'socal' | 'bc' | 'tc'
    this._stakesBookTab      = 'socal';
    this._pendingEntry       = null;
    this._pendingBreedMareId = null;
    this._raceCanvas         = null;
    this._previewingNextBook = false;
  }

  init() {
    this._bindNav();
    this._bindHeader();
    this._bindDashboard();
    this._bindAuction();
    this._bindConditionBook();
    this._bindStakesBook();
    this._bindCircuitTabs();
    this._bindBreeding();
    this._bindModals();
    this.showScreen('dashboard');
    this.updateHeader();
    this._processNamingQueue(); // handle any foals ready to name from a loaded save
  }

  _bindCircuitTabs() {
    document.querySelectorAll('.circuit-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab    = btn.dataset.tab;
        const target = btn.dataset.target;
        document.querySelectorAll(`.circuit-tab[data-target="${target}"]`)
          .forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (target === 'condition-book') {
          this._conditionBookTab = tab;
          this.renderConditionBook();
        } else {
          this._stakesBookTab = tab;
          this.renderStakesBook();
        }
      });
    });
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  showScreen(name) {
    this.activeScreen = name;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    const screen = document.getElementById('screen-' + name);
    if (screen) screen.classList.add('active');
    const btn = document.querySelector(`.nav-btn[data-screen="${name}"]`);
    if (btn) btn.classList.add('active');

    switch (name) {
      case 'dashboard':     this.renderDashboard(); break;
      case 'stable':        this.renderStable(); break;
      case 'auction':       this.renderAuction(); break;
      case 'condition-book':this.renderConditionBook(); break;
      case 'stakes-book':   this.renderStakesBook(); break;
      case 'breeding':      this.renderBreeding(); break;
    }
  }

  _bindNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this.showScreen(btn.dataset.screen));
    });
  }

  // ── Header ─────────────────────────────────────────────────────────────────

  updateHeader() {
    document.getElementById('header-money').textContent  = formatMoney(this.game.money);
    document.getElementById('header-date').textContent   = formatDateYr(this.game.currentWeek);
    document.getElementById('header-horses').textContent = this.game.horses.length;
    this._updateBreedingNavVisibility();
    this.game.saveToLocal();
  }

  newGame() {
    const input = document.getElementById('stable-name-input');
    input.value = '';
    this._showModal('new-game-modal');
    setTimeout(() => input.focus(), 100);
  }

  _confirmNewGame() {
    const input = document.getElementById('stable-name-input');
    const name  = input.value.trim() || 'My Stable';
    this._hideModal('new-game-modal');
    const fresh = new GameState();
    fresh.stableName = name;
    fresh.notify(`Welcome to ${name}! You have $100,000 to build your stable. Visit the Auction to buy your first horse.`, 'info');
    Object.assign(this.game, fresh);
    this._previewingNextBook = false;
    this.game.saveToLocal();
    this.updateHeader();
    this.showScreen('dashboard');
    this.flashMsg('New game started!');
  }

  _bindHeader() {
    document.getElementById('btn-new-game').addEventListener('click', () => this.newGame());
    document.getElementById('btn-help').addEventListener('click', () => this._showModal('help-modal'));
    document.getElementById('btn-close-help').addEventListener('click', () => this._hideModal('help-modal'));
    document.querySelectorAll('.guide-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.guide-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.guideTab;
        document.getElementById('guide-tab-guide').classList.toggle('d-none', tab !== 'guide');
        document.getElementById('guide-tab-changelog').classList.toggle('d-none', tab !== 'changelog');
      });
    });
    document.getElementById('btn-confirm-new-game').addEventListener('click', () => this._confirmNewGame());
    document.getElementById('btn-cancel-new-game').addEventListener('click', () => this._hideModal('new-game-modal'));
    document.getElementById('stable-name-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._confirmNewGame();
    });

    document.getElementById('btn-save').addEventListener('click', async () => {
      await this.game.saveToFile();
      this.flashMsg('Game saved!');
    });

    const loadInput = document.getElementById('load-file-input');
    document.getElementById('btn-load').addEventListener('click', () => loadInput.click());
    loadInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async ev => {
        try {
          const loaded = await GameState.loadFromBlob(ev.target.result);
          Object.assign(this.game, loaded);
          this.updateHeader();
          this.showScreen('dashboard');
          this.flashMsg('Game loaded!');
          this._processNamingQueue();
        } catch(err) {
          alert('Failed to load save file: ' + err.message);
        }
      };
      reader.readAsText(file);
      loadInput.value = '';
    });
  }

  flashMsg(text) {
    const el = document.getElementById('flash-msg');
    el.textContent = text;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 2500);
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  renderDashboard() {
    const banner = document.getElementById('stable-name-banner');
    if (banner) {
      const name = this.game.stableName;
      banner.textContent = name || '';
      banner.style.display = name ? '' : 'none';
    }
    this._renderStableSummary();
    this._renderUpcoming();
    this._renderNotifications();
  }

  _renderStableSummary() {
    const el = document.getElementById('stable-summary-content');
    if (this.game.horses.length === 0) {
      el.innerHTML = '<p class="muted">No horses yet. Visit the Auction to buy your first horse.</p>';
      return;
    }
    el.innerHTML = this.game.horses.map(h => {
      const st = h.statusLabel;
      return `<div class="summary-row">
        <span class="horse-name">${h.name}</span>
        <span class="horse-meta">${h.age}yo ${h.sex} | ${h.wins}W-${h.starts - h.wins}L</span>
        <span class="status-badge ${st.cls}">${st.text}</span>
      </div>`;
    }).join('');
  }

  _renderUpcoming() {
    const el      = document.getElementById('upcoming-content');
    const entries = this.game.getUpcomingEntries();
    if (entries.length === 0) {
      el.innerHTML = '<p class="muted">No upcoming entries. Check the Condition Book.</p>';
      return;
    }
    el.innerHTML = entries.map(({ race, horse }) => {
      const canRun = race.weekNumber <= this.game.currentWeek;
      return `<div class="upcoming-race">
        <div class="upcoming-info">
          <strong>${horse ? horse.name : 'Unknown'}</strong>
          <span class="race-label">${race.name} · ${race.distance}f ${race.surface} · ${race.division} · ${formatWeekLabel(race.weekNumber)}</span>
        </div>
        ${canRun
          ? `<button class="btn btn-primary btn-sm" onclick="ui.openRaceModal('${race.id}')">Race Day!</button>`
          : `<span class="muted">${formatWeekLabel(race.weekNumber)}</span>`}
      </div>`;
    }).join('');
  }

  _renderNotifications() {
    const el = document.getElementById('news-content');
    if (this.game.notifications.length === 0) {
      el.innerHTML = '<p class="muted">No news yet.</p>';
      return;
    }
    el.innerHTML = this.game.notifications.slice(0, 8).map(n => {
      const typeClass = { success:'note-success', warning:'note-warning', cost:'note-cost', info:'note-info' }[n.type] || 'note-info';
      return `<div class="notification ${typeClass}">
        <span class="note-week">${formatWeekLabel(n.week)}</span>
        <span>${n.text}</span>
      </div>`;
    }).join('');
  }

  _bindDashboard() {
    document.getElementById('btn-advance-week').addEventListener('click', () => {
      // Reset condition book preview whenever the week advances
      this._previewingNextBook = false;
        const result = this.game.advanceWeek();
      this.updateHeader();
      this.renderDashboard();
      const totalFees = result.trainTotal + result.vetTotal;
      const msg = totalFees > 0
        ? `${formatWeekLabel(result.week)} — Fees: ${formatMoney(totalFees)}`
        : `Advanced to ${formatWeekLabel(result.week)}`;
      this.flashMsg(msg);
      this._processNamingQueue();
    });
  }

  // ── Stable ─────────────────────────────────────────────────────────────────

  renderStable() {
    const el = document.getElementById('stable-content');
    if (this.game.horses.length === 0) {
      el.innerHTML = '<p class="muted">No horses in your stable. Visit the Auction to buy your first horse.</p>';
      return;
    }
    el.innerHTML = this.game.horses.map(h => this._horseCard(h)).join('');
  }

  _horseCard(h) {
    const st       = h.statusLabel;
    const lastRace = h.raceHistory[0];
    const places   = ['','1st','2nd','3rd','4th','5th','6th','7th','8th'];
    let lastStr = 'No races yet';
    if (lastRace) {
      let dateStr = '?';
      if (lastRace.week) {
        dateStr = formatDateYr(lastRace.week, 4); // Saturday of that week
      }
      lastStr = `Last: ${places[lastRace.position] || lastRace.position + 'th'} — ${dateStr}`;
    }

    const tierClass = { 'Low': 'tier-low', 'Fair': 'tier-good', 'Elite': 'tier-elite' }[h.speedTier];
    const streakBadge = h.wonLastRace
      ? '<span class="streak-badge">🔥 Streak</span>' : '';

    // Fatigue bar width (0–100)
    const fatPct = h.fatigue;
    // Confidence and consistency: fill bar out of 10
    const confPct = h.confidence * 10;
    const consPct = h.consistency * 10;

    return `<div class="horse-card" id="card-${h.id}">
      <div class="horse-card-header" style="border-left: 5px solid ${h.clothColor}">
        <div>
          <h3 class="horse-card-name">${h.name}</h3>
          <div class="horse-card-meta">${h.age}yo ${h.sex}${h.sire ? ` · by ${h.sire}, out of ${h.dam}` : ''} · ${h.coat.name}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <span class="status-badge ${st.cls}">${st.text}</span>
          ${streakBadge}
        </div>
      </div>
      <div class="stat-grid">
        <div class="stat-item">
          <span class="stat-label">Speed</span>
          <span class="speed-tier-badge ${tierClass}">${h.speedTier}</span>
          <span class="stat-val muted" style="font-size:11px">${h.speed} / ${h.startSpeed + h.potential}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Confidence</span>
          <div class="stat-bar"><div class="stat-fill conf-fill" style="width:${confPct}%"></div></div>
          <span class="stat-val">${h.confidence}/10</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Consistency</span>
          <div class="stat-bar"><div class="stat-fill cons-fill" style="width:${consPct}%"></div></div>
          <span class="stat-val">${h.consistency}/10</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Fatigue</span>
          <div class="stat-bar"><div class="stat-fill fatigue-fill" style="width:${fatPct}%"></div></div>
          <span class="stat-val">${h.fatigue}</span>
        </div>
      </div>
      <div class="horse-card-footer">
        <div class="horse-record">
          <span>${h.wins}W ${h.starts - h.wins}L · ${formatMoney(h.earnings)} earned</span>
          <span class="muted">${lastStr}</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <div class="horse-card-actions">
            ${h.injured
              ? `<span class="muted">Out ${h.injuryWeeksLeft}wk</span>`
              : `<button class="btn btn-primary btn-sm" onclick="ui.showScreen('condition-book')">Enter Race</button>`}
            <button class="btn btn-secondary btn-sm" onclick="ui.showHorseDetail('${h.id}')">Details</button>
          </div>
          ${(h.starts >= 5 || h.sex === 'filly' || h.sex === 'mare') ? `
            <div class="horse-card-actions">
              ${h.starts >= 5
                ? `<button class="btn btn-secondary btn-sm" onclick="ui.sellHorse('${h.id}')">Sell (${formatMoney(this.game.getSellPrice(h))})</button>`
                : ''}
              ${(h.sex === 'filly' || h.sex === 'mare')
                ? `<button class="btn btn-secondary btn-sm" onclick="ui.retireMare('${h.id}')">Retire to Farm</button>`
                : ''}
            </div>` : ''}
        </div>
      </div>
    </div>`;
  }

  // Cosmetic only — jockey choice has no effect on race results.
  changeJockey(horseId, jockey) {
    const h = this.game.horses.find(x => x.id === horseId);
    if (!h) return;
    h.jockey = jockey;
    this.game.saveToLocal();
  }

  showHorseDetail(horseId) {
    const h = this.game.horses.find(x => x.id === horseId);
    if (!h) return;
    document.getElementById('horse-modal-name').textContent = h.name;

    const tierClass = { 'Low': 'tier-low', 'Fair': 'tier-good', 'Elite': 'tier-elite' }[h.speedTier];
    const places    = ['','1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th'];

    document.getElementById('horse-modal-content').innerHTML = `
      <table class="detail-table">
        <tr><td>Age</td><td>${h.age}yo</td></tr>
        <tr><td>Sex</td><td>${h.sex}</td></tr>
        <tr><td>Coat</td><td>${h.coat.name}</td></tr>
        ${h.sire ? `<tr><td>Sire</td><td>${h.sire}</td></tr>` : ''}
        ${h.dam  ? `<tr><td>Dam</td><td>${h.dam}</td></tr>`   : ''}
        <tr><td>Speed</td><td><span class="speed-tier-badge ${tierClass}">${h.speedTier}</span></td></tr>
        <tr><td>Confidence</td><td>${h.confidence}/10</td></tr>
        <tr><td>Consistency</td><td>${h.consistency}/10</td></tr>
        <tr><td>Fatigue</td><td>${h.fatigue}/100</td></tr>
        <tr><td>Record</td><td>${h.wins}W – ${h.starts - h.wins}L</td></tr>
        <tr><td>Earnings</td><td>${formatMoney(h.earnings)}</td></tr>
        <tr><td>Jockey</td><td>
          <select class="filter-select" style="font-size:12px;padding:2px 6px"
            onchange="ui.changeJockey('${h.id}', this.value)">
            ${JOCKEY_NAMES.map(j => `<option${j === h.jockey ? ' selected' : ''}>${j}</option>`).join('')}
          </select>
        </td></tr>
      </table>

      <h4 style="margin-top:18px;margin-bottom:8px">Jockey Notes</h4>
      ${h.jockeyNotes.length === 0
        ? '<p class="muted">No observations yet — race your horse to learn more.</p>'
        : `<div class="jockey-notes">${h.jockeyNotes.map(n => `
            <div class="jockey-note ${n.type === 'surface' ? 'note-surface' : 'note-distance'}">
              <span class="note-icon">${n.type === 'surface' ? '🏇' : '📏'}</span>
              <span>${n.text}</span>
              <span class="note-week-tag">${formatWeekLabel(n.week)}</span>
            </div>`).join('')}</div>`}

      <h4 style="margin-top:18px;margin-bottom:8px">Race History</h4>
      ${h.raceHistory.length === 0
        ? '<p class="muted">No races yet.</p>'
        : `<table class="detail-table">${h.raceHistory.map(r => {
              let dateStr = '?';
              if (r.week) {
                dateStr = formatDateYr(r.week, 4); // Saturday of that week
              }
              return `
            <tr>
              <td>${dateStr}</td>
              <td>${r.stakesName ? stakeShortLabel(r.stakesName, r.stakesGrade, r.stakesPurse) : (RACE_TYPES[r.raceType]?.shortName || r.raceType)}</td>
              <td>${r.distance ? `${r.distance}f` : '—'} ${r.surface ? `<span class="surface-${r.surface}">${r.surface}</span>` : ''}</td>
              <td>${r.position === 1 ? '🏆 1st' : (places[r.position] || r.position + 'th')}</td>
              <td>${formatMoney(r.earned)}</td>
            </tr>`;
            }).join('')}</table>`}
    `;
    this._showModal('horse-modal');
  }

  // ── Auction ────────────────────────────────────────────────────────────────

  renderAuction() {
    const horses = this.game.getAuctionHorses();
    const el     = document.getElementById('auction-content');
    el.innerHTML = horses.map(h => this._auctionCard(h)).join('');
  }

  _auctionCard(h) {
    const canAfford    = this.game.money >= h.auctionPrice;
    const dispPot      = h._displayPotTier ?? h.potentialTier;
    const potClass     = { 'Low': 'tier-low', 'Fair': 'tier-good', 'Elite': 'tier-elite' }[dispPot];
    return `<div class="auction-card">
      <div class="auction-card-top" style="border-top: 4px solid ${h.coat.hex}">
        <h3>${h.name}</h3>
        <div class="horse-meta-row">${h.age}yo ${h.sex} · ${h.coat.name}</div>
      </div>
      <div class="auction-stats">
        <div class="auction-stat-row">
          <span class="stat-label">Potential</span>
          <span class="speed-tier-badge ${potClass}">${dispPot}?</span>
        </div>
        <div class="auction-stat-row">
          <span class="stat-label">Confidence</span>
          <span class="stat-chip">${h.confidence}/10</span>
        </div>
        <div class="auction-stat-row">
          <span class="stat-label">Consistency</span>
          <span class="stat-chip">${h.consistency}/10</span>
        </div>
      </div>
      <div class="auction-price">${formatMoney(h.auctionPrice)}</div>
      <button class="btn ${canAfford ? 'btn-primary' : 'btn-disabled'} full-width"
        ${canAfford ? `onclick="ui.buyHorse('${h.id}')"` : 'disabled'}>
        ${canAfford ? 'Purchase' : 'Insufficient Funds'}
      </button>
    </div>`;
  }

  buyHorse(horseId) {
    const horse = this.game.getAuctionHorses().find(h => h.id === horseId);
    if (!horse) return;
    if (!confirm(`Purchase ${horse.name} for ${formatMoney(horse.auctionPrice)}?`)) return;
    const result = this.game.buyHorse(horse);
    if (result.ok) {
      this.updateHeader();
      this.renderAuction();
      // Offer to rename immediately after purchase
      const newName = prompt(`Name your horse (press OK to keep "${horse.name}"):`, horse.name);
      if (newName && newName.trim() && newName.trim() !== horse.name) {
        horse.name = newName.trim();
        this.game.notify(`Horse renamed to "${horse.name}".`, 'info');
        this.game.saveToLocal();
      }
      this.flashMsg(`${horse.name} added to your stable!`);
    } else {
      alert(result.msg);
    }
  }

_bindAuction() {
    // Auction auto-refreshes weekly — no manual refresh button
  }

  // ── Breeding Farm ──────────────────────────────────────────────────────────

  _updateBreedingNavVisibility() {
    const hasBreeding =
      this.game.retiredMares.length > 0 ||
      this.game.foals.length > 0 ||
      this.game.foalsReadyToName.length > 0;
    const btn = document.querySelector('.nav-btn[data-screen="breeding"]');
    if (btn) btn.style.display = hasBreeding ? '' : 'none';
  }

  sellHorse(horseId) {
    const horse = this.game.horses.find(h => h.id === horseId);
    if (!horse) return;
    const price = this.game.getSellPrice(horse);
    if (!price) { alert(`${horse.name} needs at least 5 career starts before being sold.`); return; }
    if (!confirm(`Sell ${horse.name} for ${formatMoney(price)}?\n\nThis cannot be undone.`)) return;
    const result = this.game.sellHorse(horseId);
    if (result.ok) {
      this.updateHeader();
      this.renderStable();
      this.renderDashboard();
      this.flashMsg(`${horse.name} sold for ${formatMoney(result.price)}!`);
    }
  }

  pensionMare(mareId) {
    const mare = this.game.retiredMares.find(m => m.id === mareId);
    if (!mare) return;
    const pregnantNote = mare.breedingStatus === 'pregnant'
      ? `\n\nNote: ${mare.name} is currently in foal — the pregnancy will be cancelled.` : '';
    if (!confirm(`Pension ${mare.name} from the breeding barn?${pregnantNote}\n\nShe will no longer be able to breed.`)) return;
    const result = this.game.pensionMare(mareId);
    if (result.ok) {
      this.updateHeader();
      this.renderBreeding();
      this.flashMsg(`${mare.name} has been pensioned.`);
    } else {
      alert(result.msg);
    }
  }

  retireMare(horseId) {
    const horse = this.game.horses.find(h => h.id === horseId);
    if (!horse) return;
    if (!confirm(`Retire ${horse.name} to the breeding farm?\n\nThis is permanent — she cannot return to racing.`)) return;
    const result = this.game.retireMare(horseId);
    if (result.ok) {
      this.updateHeader();
      this.renderStable();
      this.flashMsg(`${horse.name} retired to the breeding farm!`);
    } else {
      alert(result.msg);
    }
  }

  renderBreeding() {
    this._updateBreedingNavVisibility();
    const el = document.getElementById('breeding-content');
    if (!el) return;

    const active    = this.game.retiredMares.filter(m => !m.pensionedFromBreeding);
    const pensioned = this.game.retiredMares.filter(m =>  m.pensionedFromBreeding);

    let html = '';
    if (active.length === 0 && pensioned.length === 0) {
      html = '<p class="muted">No mares at the breeding farm. Use "Retire to Farm" on a filly or mare in your stable.</p>';
    } else {
      html = active.map(m => this._mareBreedingCard(m)).join('');
      if (pensioned.length > 0) {
        html += `<div class="pensioned-section">
          <h3>Pensioned Mares</h3>
          ${pensioned.map(m => `
            <div class="pensioned-mare">
              <span class="horse-name">${m.name}</span>
              <span>${m.age}yo — Pensioned from breeding</span>
            </div>`).join('')}
        </div>`;
      }
    }
    el.innerHTML = html;
  }

  _mareBreedingCard(mare) {
    const tierClass = { 'Low': 'tier-low', 'Fair': 'tier-good', 'Elite': 'tier-elite' }[mare.speedTier];
    const wis = weekInSeason(this.game.currentWeek);
    const inWindow = wis >= 3 && wis <= 24;

    let statusHtml;
    if (mare.breedingStatus === 'pregnant') {
      const weeksLeft = mare.expectedFoalWeek - this.game.currentWeek;
      statusHtml = `<span class="breed-status breed-pregnant">In foal to ${mare.sireAtCover} · ~${weeksLeft} wk${weeksLeft !== 1 ? 's' : ''}</span>`;
    } else if (mare.breedingStatus === 'failed_conception') {
      statusHtml = `<span class="breed-status breed-failed">Unable to conceive this year</span>`;
    } else if (!inWindow) {
      const msg = wis < 3 ? 'Breeding window opens mid-January' : 'Breeding window closed — opens next January';
      statusHtml = `<span class="breed-status breed-open">${msg}</span>`;
    } else {
      statusHtml = `<span class="breed-status breed-open">Available</span>
        <button class="btn btn-primary btn-sm" onclick="ui.openBreedModal('${mare.id}')">Breed</button>`;
    }

    const mareFoals = this.game.foals.filter(f => f.damId === mare.id);
    const foalHtml = mareFoals.length === 0 ? '' : `
      <div class="mare-foals">
        ${mareFoals.map(f => `
          <div class="foal-row">
            <span class="horse-name">${f.name}</span>
            <span class="muted">by ${f.sire} · ${f.sex} · Age ${f.age}</span>
          </div>`).join('')}
      </div>`;

    return `<div class="mare-card">
      <div class="mare-card-header">
        <div class="mare-card-info">
          <span class="horse-name">${mare.name}</span>
          <span class="muted">${mare.age}yo ${mare.sex}</span>
          <span class="speed-tier-badge ${tierClass} sm">${mare.speedTier}</span>
          <button class="btn btn-secondary btn-sm" onclick="ui.pensionMare('${mare.id}')">Pension</button>
        </div>
        <div class="mare-card-status">${statusHtml}</div>
      </div>
      ${foalHtml}
    </div>`;
  }

  openBreedModal(mareId) {
    this._pendingBreedMareId = mareId;
    const mare = this.game.retiredMares.find(m => m.id === mareId);
    if (!mare) return;
    document.getElementById('breed-modal-mare-name').textContent = mare.name;
    document.getElementById('breed-stallion-list').innerHTML = STALLIONS.map(s => `
      <label class="horse-select-row">
        <input type="radio" name="breed-stallion" value="${s.name}">
        <span class="horse-name">${s.name}</span>
        <span class="muted">${formatMoney(s.studFee)}</span>
      </label>`).join('');
    this._showModal('breed-modal');
  }

  _bindBreeding() {
    document.getElementById('btn-confirm-breed')?.addEventListener('click', () => {
      const sel = document.querySelector('input[name="breed-stallion"]:checked');
      if (!sel) { alert('Please select a stallion.'); return; }
      const result = this.game.breedMare(this._pendingBreedMareId, sel.value);
      if (result.ok) {
        this._hideModal('breed-modal');
        this.updateHeader();
        this.renderBreeding();
        this.flashMsg(result.conceived ? 'Covered successfully!' : 'Unable to conceive this season.');
      } else {
        alert(result.msg);
      }
    });
    document.getElementById('btn-cancel-breed')?.addEventListener('click', () =>
      this._hideModal('breed-modal'));
  }

  _processNamingQueue() {
    while (this.game.foalsReadyToName.length > 0) {
      const foal    = this.game.foalsReadyToName[0];
      const newName = prompt(
        `${foal.name} has turned 2 and is ready to enter your stable!\n` +
        `${foal.sex === 'colt' ? 'Colt' : 'Filly'} by ${foal.sire} out of ${foal.dam}\n\n` +
        `Enter a name (leave blank to keep "${foal.name}"):`,
        foal.name
      );
      if (newName && newName.trim()) foal.name = newName.trim();
      this.game.horses.push(foal);
      this.game.foalsReadyToName.shift();
      this.game.notify(`${foal.name} has entered your stable!`, 'success');
    }
    if (this.game.foalsReadyToName.length === 0) {
      this._updateBreedingNavVisibility();
      this.game.saveToLocal();
      if (this.activeScreen === 'stable')   this.renderStable();
      if (this.activeScreen === 'breeding') this.renderBreeding();
    }
  }

  // ── Condition Book ─────────────────────────────────────────────────────────

  renderConditionBook() {
    // Sync active tab button
    document.querySelectorAll('.circuit-tab[data-target="condition-book"]')
      .forEach(b => b.classList.toggle('active', b.dataset.tab === this._conditionBookTab));

    if (this._conditionBookTab === 'bc') { this._renderBCBook(); return; }
    if (this._conditionBookTab === 'tc') { this._renderTCBook(); return; }

    // ── SoCal Circuit ──────────────────────────────────────────────────────
    // Restore SoCal nav buttons
    document.getElementById('btn-next-condition-book').style.display = '';

    const book      = this._previewingNextBook ? this.game.nextBookPreview : this.game.getConditionBook();
    const isPreview = this._previewingNextBook;

    // Set the screen title to whichever track is active this book period
    const activeDay = book.raceDays.find(d => !d.dark && d.trackName);
    const trackTitle = activeDay ? activeDay.trackName : 'Southern California Circuit';
    document.querySelector('#screen-condition-book .screen-title').textContent =
      trackTitle + ' Condition Book';

    const w1 = formatDateYr(book.startWeek);
    const w2 = formatDateYr(book.endWeek + 1);
    document.getElementById('condition-book-dates').innerHTML =
      `<strong>Southern California Circuit</strong> · ${w1} – ${w2} (${formatWeekLabel(book.startWeek)}–${formatWeekLabel(book.endWeek)})`
      + (isPreview ? ' <em style="color:var(--gold);font-size:11px">(preview — entries not available)</em>' : '');

    // Toggle nav buttons
    document.getElementById('btn-prev-condition-book').style.display = isPreview ? '' : 'none';
    document.getElementById('btn-next-condition-book').style.display = isPreview ? 'none' : '';

    const TRACK_HERO_IMAGES = {
      'santa_anita': 'https://www.santaanita.com/_next/image/?url=https%3A%2F%2Fimages.ctfassets.net%2Frkhnw24d6im5%2F2PDfXXHYDvkhNlZbzBkzum%2F806412877e45878ea8b9fdb291ed1ba5%2FOpening_day_2024-25_ZAM.jpeg&w=3840&q=60',
      'del_mar':     'https://www.dmtc.com/image-resizer/c3x2/data/assets/Calendar%20Images/2023/23-0720-DelMar-Openingday-00132-small.jpg'
    };
    const heroImgUrl = activeDay ? TRACK_HERO_IMAGES[activeDay.trackId] : null;
    const heroHtml   = heroImgUrl
      ? `<div class="track-hero"><img src="${heroImgUrl}" alt="${activeDay.trackName}" onerror="this.parentElement.style.display='none'"></div>`
      : '';

    const el = document.getElementById('condition-book-content');
    el.innerHTML = heroHtml + this._circuitSchedulePanel() +
      book.raceDays.map(day => this._raceDaySection(day, isPreview)).join('');
  }

  _circuitSchedulePanel() {
    const w = weekInSeason(this.game.currentWeek);
    const rows = CIRCUIT_SCHEDULE.map(s => {
      const isActive = w >= s.start && w <= s.end;
      const trackLabel = s.track ? s.label : '<em style="color:var(--text-2)">Dark — No Racing</em>';
      return `<tr class="${isActive ? 'schedule-active' : ''}">
        <td>${s.start === s.end ? `Wk ${s.start}` : `Wks ${s.start}–${s.end}`}</td>
        <td>${trackLabel}</td>
      </tr>`;
    }).join('');
    return `<details class="circuit-schedule-panel">
      <summary>Southern California Circuit — Full Schedule</summary>
      <table class="schedule-table">${rows}</table>
    </details>`;
  }

  _raceDaySection(day, isPreview = false) {
    // weekToDate() returns the Tuesday of that week; Thu=+2, Fri=+3, Sat=+4, Sun=+5
    const dayOffset = day.dayLabel === 'Thursday' ? 2 : day.dayLabel === 'Friday' ? 3 : day.dayLabel === 'Saturday' ? 4 : 5;
    const dateStr   = `${day.dayLabel}, ${formatDateYr(day.weekNumber, dayOffset)} (${formatWeekLabel(day.weekNumber)})`;
    const isPast    = !isPreview && day.weekNumber < this.game.currentWeek;

    // Dark week — no racing
    if (day.dark) {
      return `<div class="race-day dark-day">
        <div class="race-day-header">
          <span class="race-day-title">${dateStr}</span>
          <span class="dark-label">No Racing</span>
        </div>
      </div>`;
    }

    return `<div class="race-day ${isPast ? 'past' : ''}${isPreview ? ' preview' : ''}">
      <div class="race-day-header">
        <span class="race-day-title">${dateStr}</span>
        <span class="track-name-label">${day.trackName || 'Santa Anita Park'}</span>
        ${isPast ? '<span class="past-label">Past</span>' : ''}
        ${isPreview ? '<span class="preview-label">Preview</span>' : ''}
      </div>
      <table class="race-table">
        <thead>
          <tr>
            <th>#</th><th>Race</th><th>Dist</th><th>Surf</th>
            <th>Division</th><th>Purse</th><th>Claiming</th><th>Entry</th>
          </tr>
        </thead>
        <tbody>
          ${day.races.map(r => this._raceRow(r, isPast, isPreview)).join('')}
        </tbody>
      </table>
    </div>`;
  }

  _raceRow(race, isPast, isPreview = false) {
    const entered  = !!race.playerEntry;
    const ran      = race.playerEntry?.ran;
    const horse    = entered ? this.game.horses.find(h => h.id === race.playerEntry.horseId) : null;
    const claimStr = race.claimingPrice
      ? formatMoney(race.claimingPrice)
      : race.optionalClaimingPrice
        ? `Opt. ${formatMoney(race.optionalClaimingPrice)}`
        : '—';

    let actionCell;
    if (isPreview) {
      actionCell = '<span class="muted">—</span>';
    } else if (ran) {
      actionCell = '<span class="past-label">Ran</span>';
    } else if (entered) {
      const claimNote = race.playerEntry?.effectiveClaimingPrice
        ? ` (clm ${formatMoney(race.playerEntry.effectiveClaimingPrice)})` : '';
      actionCell = `<span class="entered-label">✓ ${horse?.name ?? ''}${claimNote}</span>`;
    } else if (isPast) {
      actionCell = '<span class="muted">—</span>';
    } else {
      actionCell = `<button class="btn btn-sm btn-outline" onclick="ui.openEntryModal('${race.id}')">Enter</button>`;
    }

    const gradeBadge = race.grade
      ? `<span class="grade-badge grade-${race.grade.toLowerCase()}">${race.grade}</span> `
      : '';

    return `<tr class="${entered && !isPreview ? 'entered-row' : ''}${race.isStakes ? ' stakes-row' : ''}">
      <td>${race.number}</td>
      <td><span class="race-name">${gradeBadge}${race.name}</span></td>
      <td>${race.distance}f</td>
      <td class="surface-${race.surface}">${race.surface}</td>
      <td>${race.division}</td>
      <td class="purse">${formatMoney(race.purse)}</td>
      <td class="claiming">${claimStr}</td>
      <td>${actionCell}</td>
    </tr>`;
  }

  _bindConditionBook() {
    // "Preview Next →" — generates next book preview without touching game state.
    // Only generates once per current book; cached in _nextBookPreview until the
    // live book advances (detected by comparing startWeek).
    document.getElementById('btn-next-condition-book').addEventListener('click', () => {
      const currentBook   = this.game.getConditionBook();
      const nextStartWeek = currentBook.endWeek + 1;
      // Generate only if we don't have a cached preview for this upcoming period
      if (!this.game.nextBookPreview || this.game.nextBookPreview.startWeek !== nextStartWeek) {
        this.game.nextBookPreview = generateConditionBook(nextStartWeek, {});
        this.game.saveToLocal();  // persist so hard-refresh doesn't regenerate it
      }
      this._previewingNextBook = true;
      this.renderConditionBook();
    });

    // "← Current Book" — return to the live condition book
    document.getElementById('btn-prev-condition-book').addEventListener('click', () => {
      this._previewingNextBook = false;
        this.renderConditionBook();
    });
  }

  // ── Breeders' Cup Condition Book tab ───────────────────────────────────────

  _renderBCBook() {
    document.querySelector('#screen-condition-book .screen-title').textContent = "Breeders' Cup";
    document.getElementById('condition-book-dates').innerHTML = 'Keeneland · Week 44 (Nov 1–2) · All G1';
    document.getElementById('btn-prev-condition-book').style.display = 'none';
    document.getElementById('btn-next-condition-book').style.display = 'none';

    const races = this.game.getSpecialRaces('bc');
    const wk    = races[0].weekNumber;
    const yr    = Math.ceil(this.game.currentWeek / GAME_CONFIG.WEEKS_PER_YEAR);

    const d1 = weekToDate(wk); d1.setDate(d1.getDate() + 3); // Friday +3
    const d2 = weekToDate(wk); d2.setDate(d2.getDate() + 4); // Saturday +4

    const heroHtml = `<div class="track-hero track-hero--bc"></div>`;

    const el = document.getElementById('condition-book-content');
    el.innerHTML = heroHtml +
      this._specialRaceDaySection(`Friday, ${formatDate(d1)}, Yr ${yr} — Keeneland`, wk, races.filter(r => r.dayLabel === 'Friday'))  +
      this._specialRaceDaySection(`Saturday, ${formatDate(d2)}, Yr ${yr} — Keeneland`, wk, races.filter(r => r.dayLabel === 'Saturday'));
  }

  // ── Triple Crown Condition Book tab ────────────────────────────────────────

  _renderTCBook() {
    document.querySelector('#screen-condition-book .screen-title').textContent = 'Triple Crown';
    document.getElementById('condition-book-dates').innerHTML = 'Kentucky Derby · Preakness · Belmont';
    document.getElementById('btn-prev-condition-book').style.display = 'none';
    document.getElementById('btn-next-condition-book').style.display = 'none';

    const races = this.game.getSpecialRaces('tc');
    const yr    = Math.ceil(this.game.currentWeek / GAME_CONFIG.WEEKS_PER_YEAR);

    const heroHtml = `<div class="track-hero"><img src="https://www.secretariat.com/wp-content/uploads/2024/05/Secretartiat-Belmont-Stakes-Color-Stretch.jpg" alt="Triple Crown" onerror="this.parentElement.style.display='none'"></div>`;

    const el = document.getElementById('condition-book-content');

    // Kentucky Derby qualification note
    const derbyRace    = races.find(r => r.requiresQualification === 'kentucky_derby');
    const qualifiers   = derbyRace ? this.game.horses.filter(h => h.isKentuckyDerbyEligible && h.age === 3) : [];
    const qualNote     = derbyRace
      ? `<div class="race-day" style="margin-bottom:10px;padding:10px 14px;border-left:3px solid var(--gold);background:var(--panel)">
           <strong style="color:var(--gold)">Kentucky Derby Qualification</strong>
           <div style="margin-top:4px;font-size:12px;color:var(--text-2)">
             Qualify by finishing <strong>top 3</strong> in the <em>San Felipe Stakes</em> or <em>Santa Anita Derby</em>.
           </div>
           ${qualifiers.length
             ? `<div style="margin-top:6px;font-size:12px;color:var(--green)">✓ Qualified: ${qualifiers.map(h => h.name).join(', ')}</div>`
             : `<div style="margin-top:6px;font-size:12px;color:var(--text-2)">No horses in your stable have qualified yet.</div>`}
         </div>` : '';

    el.innerHTML = heroHtml + qualNote + races.map(r => {
      const d = weekToDate(r.weekNumber); d.setDate(d.getDate() + 4); // all TC races are Saturday (+4)
      const hdr = `Saturday, ${formatDate(d)}, Yr ${yr} — ${r.trackName}`;
      return this._specialRaceDaySection(hdr, r.weekNumber, [r]);
    }).join('');
  }

  // ── Shared: render a race day card for BC/TC ────────────────────────────────

  _specialRaceDaySection(headerLabel, weekNum, races) {
    const isPast    = weekNum < this.game.currentWeek;
    const inWindow  = weekNum >= this.game.currentWeek && weekNum <= this.game.currentWeek + 2;

    const rows = races.map((race, i) => {
      const entered   = !!race.playerEntry;
      const ran       = race.playerEntry?.ran;
      const horse     = entered ? this.game.horses.find(h => h.id === race.playerEntry.horseId) : null;
      const gradeBadge = race.grade
        ? `<span class="grade-badge grade-${race.grade.toLowerCase()}">${race.grade}</span> ` : '';

      let actionCell;
      if (ran) {
        actionCell = '<span class="past-label">Ran</span>';
      } else if (entered) {
        actionCell = `<span class="entered-label">✓ ${horse?.name ?? ''}</span>`;
      } else if (isPast) {
        actionCell = '<span class="muted">Past</span>';
      } else if (inWindow) {
        actionCell = `<button class="btn btn-sm btn-outline" onclick="ui.openEntryModal('${race.id}')">Enter</button>`;
      } else {
        actionCell = `<span class="muted">Opens ${formatWeekLabel(race.weekNumber - 2)}</span>`;
      }

      return `<tr class="${entered && !ran ? 'entered-row' : ''} stakes-row">
        <td>${i + 1}</td>
        <td><span class="race-name">${gradeBadge}${race.name}</span></td>
        <td>${race.distance}f</td>
        <td class="surface-${race.surface}">${race.surface}</td>
        <td>${race.division}</td>
        <td class="purse">${formatMoney(race.purse)}</td>
        <td>—</td>
        <td>${actionCell}</td>
      </tr>`;
    }).join('');

    const inWindowBadge = inWindow && !isPast
      ? '<span class="schedule-active-badge">Entry Open</span>' : '';

    return `<div class="race-day${isPast ? ' past' : ''}">
      <div class="race-day-header">
        <span class="race-day-title">${headerLabel}</span>
        ${inWindowBadge}
        ${isPast ? '<span class="past-label">Past</span>' : ''}
      </div>
      <table class="race-table">
        <thead><tr>
          <th>#</th><th>Race</th><th>Dist</th><th>Surf</th>
          <th>Division</th><th>Purse</th><th>Claiming</th><th>Entry</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  _bindStakesBook() {
    // Re-render the stakes book whenever any filter changes
    ['stakes-filter-grade','stakes-filter-track','stakes-filter-surface','stakes-filter-div']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => this.renderStakesBook());
      });
  }

  // ── Stakes Book ────────────────────────────────────────────────────────────

  // Returns the live race object from the current condition book that matches
  // this STAKES_SCHEDULE entry, or null if it's not in the current book period.
  _findStakeRaceInBook(stake) {
    const book = this.game.conditionBook;
    if (!book) return null;
    for (const day of book.raceDays) {
      for (const race of day.races) {
        if (race.isStakes &&
            race.trackId  === stake.trackId  &&
            weekInSeason(race.weekNumber) === stake.weekNumber &&
            race.dayLabel === stake.dayLabel  &&
            race.name     === stake.name) {
          return race;
        }
      }
    }
    return null;
  }

  renderStakesBook() {
    const el = document.getElementById('stakes-book-content');
    if (!el) return;

    // Sync active tab button
    document.querySelectorAll('.circuit-tab[data-target="stakes-book"]')
      .forEach(b => b.classList.toggle('active', b.dataset.tab === this._stakesBookTab));

    if (this._stakesBookTab === 'bc') { this._renderBCStakesBook(); return; }
    if (this._stakesBookTab === 'tc') { this._renderTCStakesBook(); return; }

    // ── SoCal: restore filters ─────────────────────────────────────────────
    const filtersEl = document.querySelector('.stakes-book-filters');
    if (filtersEl) filtersEl.style.display = '';

    // Read filter values
    const gradeFilter   = (document.getElementById('stakes-filter-grade')?.value   || '');
    const trackFilter   = (document.getElementById('stakes-filter-track')?.value   || '');
    const surfaceFilter = (document.getElementById('stakes-filter-surface')?.value || '');
    const divFilter     = (document.getElementById('stakes-filter-div')?.value     || '');

    const currentWis = weekInSeason(this.game.currentWeek);

    // Apply filters
    let stakes = STAKES_SCHEDULE.slice();
    if (gradeFilter === 'ungraded') {
      stakes = stakes.filter(s => !s.grade);
    } else if (gradeFilter) {
      stakes = stakes.filter(s => s.grade === gradeFilter);
    }
    if (trackFilter)   stakes = stakes.filter(s => s.trackId === trackFilter);
    if (surfaceFilter) stakes = stakes.filter(s => s.surface === surfaceFilter);
    if (divFilter)     stakes = stakes.filter(s => s.ageDivision === divFilter);

    if (stakes.length === 0) {
      el.innerHTML = '<p class="muted" style="padding:20px 0">No stakes match the selected filters.</p>';
      return;
    }

    // Build rows
    const dayOffset = d => d === 'Thursday' ? 2 : d === 'Friday' ? 3 : d === 'Saturday' ? 4 : 5;

    const rows = stakes.map(s => {
      // Compute display date for current game year
      const gameYear = Math.ceil(this.game.currentWeek / GAME_CONFIG.WEEKS_PER_YEAR);
      const absWeek  = (gameYear - 1) * GAME_CONFIG.WEEKS_PER_YEAR + s.weekNumber;
      const d        = weekToDate(absWeek);
      d.setDate(d.getDate() + dayOffset(s.dayLabel));
      const dateStr  = `${s.dayLabel.slice(0,3)}, ${formatDate(d)}`;

      const trackLabel = s.trackId === 'santa_anita' ? 'Santa Anita' : 'Del Mar';
      const division   = formatDivision(s.ageDivision, s.sexRestriction);
      const gradeBadge = s.grade
        ? `<span class="grade-badge grade-${s.grade.toLowerCase()}">${s.grade}</span>`
        : '<span class="grade-badge grade-none">—</span>';

      // Status
      const liveRace = this._findStakeRaceInBook(s);
      let statusCell;
      if (liveRace) {
        if (liveRace.playerEntry?.ran) {
          statusCell = '<span class="past-label">Ran</span>';
        } else if (liveRace.playerEntry) {
          const h = this.game.horses.find(h => h.id === liveRace.playerEntry.horseId);
          statusCell = `<span class="entered-label">✓ ${h?.name ?? ''}</span>`;
        } else {
          statusCell = `<button class="btn btn-sm btn-outline" onclick="ui.openEntryModal('${liveRace.id}')">Enter</button>`;
        }
      } else if (s.weekNumber < currentWis && !(s.weekNumber === 52 && currentWis <= 4)) {
        // Past in the current season (week 52 is "future" from week 1–4's perspective)
        statusCell = '<span class="muted">Past</span>';
      } else {
        statusCell = '<span class="muted">Upcoming</span>';
      }

      return `<tr>
        <td class="stakes-date-cell">${dateStr}</td>
        <td>${gradeBadge}</td>
        <td class="race-name">${s.name}</td>
        <td style="color:var(--text-2);font-size:11px">${trackLabel}</td>
        <td>${division}</td>
        <td>${s.distance}f <span class="surface-${s.surface}">${s.surface}</span></td>
        <td class="purse">${formatMoney(s.purse)}</td>
        <td>${statusCell}</td>
      </tr>`;
    }).join('');

    el.innerHTML = `
      <table class="race-table stakes-book-table">
        <thead><tr>
          <th>Date</th><th>Grade</th><th>Race</th><th>Track</th>
          <th>Division</th><th>Dist/Surf</th><th>Purse</th><th>Entry</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ── Breeders' Cup Stakes Book tab ──────────────────────────────────────────

  _renderBCStakesBook() {
    const filtersEl = document.querySelector('.stakes-book-filters');
    if (filtersEl) filtersEl.style.display = 'none';

    const el    = document.getElementById('stakes-book-content');
    const races = this.game.getSpecialRaces('bc');
    const yr    = Math.ceil(this.game.currentWeek / GAME_CONFIG.WEEKS_PER_YEAR);

    const rows = races.map(r => {
      const isPast   = r.weekNumber < this.game.currentWeek;
      const inWindow = r.weekNumber >= this.game.currentWeek && r.weekNumber <= this.game.currentWeek + 2;
      const dayOff   = r.dayLabel === 'Friday' ? 3 : 4;
      const d = weekToDate(r.weekNumber); d.setDate(d.getDate() + dayOff);
      const dateStr  = `${r.dayLabel.slice(0,3)}, ${formatDate(d)}, Yr ${yr}`;
      const gradeBadge = `<span class="grade-badge grade-g1">G1</span>`;
      const division = formatDivision(r.ageDivision, r.sexRestriction);

      let statusCell;
      if (r.playerEntry?.ran) {
        statusCell = '<span class="past-label">Ran</span>';
      } else if (r.playerEntry) {
        const h = this.game.horses.find(h => h.id === r.playerEntry.horseId);
        statusCell = `<span class="entered-label">✓ ${h?.name ?? ''}</span>`;
      } else if (isPast) {
        statusCell = '<span class="muted">Past</span>';
      } else if (inWindow) {
        statusCell = `<button class="btn btn-sm btn-outline" onclick="ui.openEntryModal('${r.id}')">Enter</button>`;
      } else {
        statusCell = `<span class="muted">Opens ${formatWeekLabel(r.weekNumber - 2)}</span>`;
      }

      return `<tr>
        <td class="stakes-date-cell">${dateStr}</td>
        <td>${gradeBadge}</td>
        <td class="race-name">${r.name}</td>
        <td style="color:var(--text-2);font-size:11px">Keeneland</td>
        <td>${division}</td>
        <td>${r.distance}f <span class="surface-${r.surface}">${r.surface}</span></td>
        <td class="purse">${formatMoney(r.purse)}</td>
        <td>${statusCell}</td>
      </tr>`;
    }).join('');

    el.innerHTML = `
      <table class="race-table stakes-book-table">
        <thead><tr>
          <th>Date</th><th>Grade</th><th>Race</th><th>Track</th>
          <th>Division</th><th>Dist/Surf</th><th>Purse</th><th>Entry</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ── Triple Crown Stakes Book tab ────────────────────────────────────────────

  _renderTCStakesBook() {
    const filtersEl = document.querySelector('.stakes-book-filters');
    if (filtersEl) filtersEl.style.display = 'none';

    const el    = document.getElementById('stakes-book-content');
    const races = this.game.getSpecialRaces('tc');
    const yr    = Math.ceil(this.game.currentWeek / GAME_CONFIG.WEEKS_PER_YEAR);

    const rows = races.map(r => {
      const isPast   = r.weekNumber < this.game.currentWeek;
      const inWindow = r.weekNumber >= this.game.currentWeek && r.weekNumber <= this.game.currentWeek + 2;
      const d = weekToDate(r.weekNumber); d.setDate(d.getDate() + 4); // all Saturday
      const dateStr  = `Sat, ${formatDate(d)}, Yr ${yr}`;
      const gradeBadge = '<span class="grade-badge grade-g1">G1</span>';
      const division = formatDivision(r.ageDivision, r.sexRestriction);
      const isKyDerby = r.requiresQualification === 'kentucky_derby';
      const hasQualifier = isKyDerby && this.game.horses.some(h =>
        h.isKentuckyDerbyEligible && h.age === 3 && !h.injured);

      let statusCell;
      if (r.playerEntry?.ran) {
        statusCell = '<span class="past-label">Ran</span>';
      } else if (r.playerEntry) {
        const h = this.game.horses.find(h => h.id === r.playerEntry.horseId);
        statusCell = `<span class="entered-label">✓ ${h?.name ?? ''}</span>`;
      } else if (isPast) {
        statusCell = '<span class="muted">Past</span>';
      } else if (inWindow) {
        if (isKyDerby && !hasQualifier) {
          statusCell = '<span class="muted" title="Finish top 3 in San Felipe Stakes or Santa Anita Derby">No Qualifier</span>';
        } else {
          statusCell = `<button class="btn btn-sm btn-outline" onclick="ui.openEntryModal('${r.id}')">Enter</button>`;
        }
      } else {
        statusCell = `<span class="muted">Opens ${formatWeekLabel(r.weekNumber - 2)}</span>`;
      }

      const qualNote = isKyDerby
        ? `<br><span style="font-size:10px;color:var(--text-2)">Requires top-3 in San Felipe or SA Derby</span>` : '';

      return `<tr>
        <td class="stakes-date-cell">${dateStr}</td>
        <td>${gradeBadge}</td>
        <td class="race-name">${r.name}${qualNote}</td>
        <td style="color:var(--text-2);font-size:11px">${r.trackName}</td>
        <td>${division}</td>
        <td>${r.distance}f <span class="surface-${r.surface}">${r.surface}</span></td>
        <td class="purse">${formatMoney(r.purse)}</td>
        <td>${statusCell}</td>
      </tr>`;
    }).join('');

    el.innerHTML = `
      <table class="race-table stakes-book-table">
        <thead><tr>
          <th>Date</th><th>Grade</th><th>Race</th><th>Track</th>
          <th>Division</th><th>Dist/Surf</th><th>Purse</th><th>Entry</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ── Entry Modal ────────────────────────────────────────────────────────────

  openEntryModal(raceId) {
    // Search condition book first, then BC/TC special races
    let race = null;
    const book = this.game.conditionBook;
    if (book) {
      for (const d of book.raceDays)
        for (const r of d.races)
          if (r.id === raceId) { race = r; break; }
    }
    if (!race) {
      const special = this.game._findSpecialRace(raceId);
      if (special) race = special.race;
    }
    if (!race) return;

    const isSpecialCircuit = !!race._circuit; // BC or TC race

    const isStakes = !!race.isStakes;
    const isAOC    = !isStakes && !!race.optionalClaimingPrice;

    let eligSection, ineligibleRows, pendingEntry;

    if (isStakes) {
      // ── Stakes race (condition book, BC, or TC) ───────────────────────────
      // For BC/TC: no fatigue/weeksSinceRace check — race is in the future.
      // For KY Derby: additionally require isKentuckyDerbyEligible.
      const isKyDerby = race.requiresQualification === 'kentucky_derby';

      const eligible = this.game.horses.filter(h => {
        if (!h.qualifiesAgeAndSex(race.ageDivision, race.sexRestriction)) return false;
        if (h.injured) return false;
        if (isKyDerby && !h.isKentuckyDerbyEligible) return false;
        if (isSpecialCircuit) return true; // BC/TC: skip canRace (race is in the future)
        return h.canRace;
      });

      const gradeBadgeHtml = race.grade
        ? `<span class="grade-badge grade-${race.grade.toLowerCase()}">${race.grade}</span> `
        : '';

      eligSection = eligible.length === 0
        ? '<p class="muted warning-text">None of your horses can enter this race.</p>'
        : eligible.map(h => {
            const tierClass = { 'Low': 'tier-low', 'Fair': 'tier-good', 'Elite': 'tier-elite' }[h.speedTier];
            return `<label class="horse-select-row">
              <input type="radio" name="entry-horse" value="${h.id}">
              <span class="horse-name">${h.name}</span>
              <span class="horse-meta">
                ${h.age}yo · <span class="speed-tier-badge ${tierClass} sm">${h.speedTier}</span> · ${h.wins}W
              </span>
            </label>`;
          }).join('');

      ineligibleRows = this.game.horses.filter(h => !eligible.includes(h)).map(h => {
        let reason = '';
        if (h.injured) reason = 'Injured';
        else if (!h.qualifiesAgeAndSex(race.ageDivision, race.sexRestriction))
          reason = race.sexRestriction === 'fillies' ? 'Fillies only' : 'Age/sex ineligible';
        else if (isKyDerby && !h.isKentuckyDerbyEligible)
          reason = 'No qualifying finish';
        else if (!isSpecialCircuit && !h.canRace) reason = 'Fatigued';
        else reason = 'Not eligible';
        return `<div class="ineligible-row"><span>${h.name}</span><span class="muted">${reason}</span></div>`;
      });

      const kyDerbyNote = isKyDerby
        ? `<div style="margin:6px 0;font-size:12px;color:var(--gold)">⚠ Qualification required — top 3 in San Felipe Stakes or Santa Anita Derby</div>`
        : '';
      const trackNote = isSpecialCircuit
        ? `<div style="font-size:12px;color:var(--text-2)">${race.trackName}</div>` : '';

      document.getElementById('enter-race-content').innerHTML = `
        <div class="race-detail-box stakes-detail-box">
          <div><strong>${gradeBadgeHtml}${race.name}</strong></div>
          ${trackNote}
          <div class="race-meta-line">${race.distance}f ${race.surface} · ${race.division} · Purse ${formatMoney(race.purse)}</div>
          ${kyDerbyNote}
          <div class="entry-fee-line">Entry fee: ${formatMoney(race.entryFee)}</div>
        </div>
        <h4>Select Horse</h4>
        <div class="horse-select-list">${eligSection}</div>
        ${ineligibleRows.length ? `<details><summary class="muted">Ineligible horses (${ineligibleRows.length})</summary>${ineligibleRows.join('')}</details>` : ''}
      `;

      pendingEntry = { raceId, isAOC: false, isStakes: true };

    } else if (isAOC) {
      // ── AOC race ─────────────────────────────────────────────────────────────
      // N1X-eligible horses: may run protected or opt into claiming price.
      // Non-N1X horses that meet age/sex: must run for the claiming price.
      const claimPrice    = race.optionalClaimingPrice;
      const n1xHorses     = this.game.horses.filter(h =>
        h.isProtectedForAOC(race.raceTypeId) && h.qualifiesAgeAndSex(race.ageDivision, race.sexRestriction) && h.canRace);
      const claimingHorses = this.game.horses.filter(h =>
        !h.isProtectedForAOC(race.raceTypeId) && h.qualifiesAgeAndSex(race.ageDivision, race.sexRestriction) && h.canRace);
      const allEnterable  = [...n1xHorses, ...claimingHorses];
      const forcedClaimIds = new Set(claimingHorses.map(h => h.id));

      const renderRow = h => {
        const tierClass = { 'Low': 'tier-low', 'Fair': 'tier-good', 'Elite': 'tier-elite' }[h.speedTier];
        const isForced  = forcedClaimIds.has(h.id);
        return `<label class="horse-select-row aoc-row">
          <input type="radio" name="entry-horse" value="${h.id}"${isForced ? ' data-claiming-forced="true"' : ''}>
          <span class="horse-name">${h.name}</span>
          <span class="horse-meta">
            ${h.age}yo · <span class="speed-tier-badge ${tierClass} sm">${h.speedTier}</span> · ${h.wins}W
            · <em>${isForced ? 'must run for claim' : 'eligible'}</em>
          </span>
          ${isForced
            ? `<span class="claiming-req-note">Must run for ${formatMoney(claimPrice)} claiming</span>`
            : `<label class="claiming-opt-label"><input type="checkbox" id="claiming-check-${h.id}"> Run for ${formatMoney(claimPrice)} claiming</label>`}
        </label>`;
      };

      eligSection = allEnterable.length === 0
        ? '<p class="muted warning-text">None of your horses can enter this race.</p>'
        : allEnterable.map(renderRow).join('');

      ineligibleRows = this.game.horses.filter(h => !allEnterable.includes(h)).map(h => {
        let reason = '';
        if (h.injured) reason = 'Injured';
        else if (!h.canRace) reason = 'Fatigued';
        else if (!h.qualifiesAgeAndSex(race.ageDivision, race.sexRestriction))
          reason = race.sexRestriction === 'fillies' ? 'Fillies only' : 'Age/sex ineligible';
        else reason = 'Not eligible';
        return `<div class="ineligible-row"><span>${h.name}</span><span class="muted">${reason}</span></div>`;
      });

      document.getElementById('enter-race-content').innerHTML = `
        <div class="race-detail-box">
          <div><strong>${race.name}</strong></div>
          <div class="race-meta-line">${race.distance}f ${race.surface} · ${race.division} · Purse ${formatMoney(race.purse)}</div>
          <div class="claiming-warning">📋 Optional Claiming ${formatMoney(claimPrice)}</div>
          <div class="entry-fee-line">Entry fee: ${formatMoney(race.entryFee)}</div>
        </div>
        <h4>Select Horse</h4>
        <div class="horse-select-list">${eligSection}</div>
        ${ineligibleRows.length ? `<details><summary class="muted">Ineligible horses (${ineligibleRows.length})</summary>${ineligibleRows.join('')}</details>` : ''}
      `;

      pendingEntry = { raceId, isAOC: true, forcedClaimIds };

    } else {
      // ── Standard race ─────────────────────────────────────────────────────────
      const eligible = this.game.horses.filter(h =>
        h.qualifiesFor(race.raceTypeId, race.ageDivision, race.sexRestriction) && h.canRace);

      eligSection = eligible.length === 0
        ? '<p class="muted warning-text">None of your horses currently qualify for this race.</p>'
        : eligible.map(h => {
            const tierClass = { 'Low': 'tier-low', 'Fair': 'tier-good', 'Elite': 'tier-elite' }[h.speedTier];
            return `<label class="horse-select-row">
              <input type="radio" name="entry-horse" value="${h.id}">
              <span class="horse-name">${h.name}</span>
              <span class="horse-meta">
                ${h.age}yo · <span class="speed-tier-badge ${tierClass} sm">${h.speedTier}</span> · ${h.wins}W
              </span>
            </label>`;
          }).join('');

      ineligibleRows = this.game.horses.filter(h => !eligible.includes(h)).map(h => {
        let reason = '';
        if (h.injured) reason = 'Injured';
        else if (!h.canRace) reason = 'Fatigued';
        else if (race.sexRestriction === 'fillies' && h.sex !== 'filly' && h.sex !== 'mare')
          reason = 'Fillies only';
        else if (!h.qualifiesFor(race.raceTypeId, race.ageDivision, race.sexRestriction))
          reason = 'Age/class ineligible';
        return `<div class="ineligible-row"><span>${h.name}</span><span class="muted">${reason}</span></div>`;
      });

      document.getElementById('enter-race-content').innerHTML = `
        <div class="race-detail-box">
          <div><strong>${race.name}</strong></div>
          <div class="race-meta-line">${race.distance}f ${race.surface} · ${race.division} · Purse ${formatMoney(race.purse)}</div>
          ${race.claimingPrice ? `<div class="claiming-warning">⚠ Claiming at ${formatMoney(race.claimingPrice)} — your horse may be purchased</div>` : ''}
          <div class="entry-fee-line">Entry fee: ${formatMoney(race.entryFee)}</div>
        </div>
        <h4>Select Horse</h4>
        <div class="horse-select-list">${eligSection}</div>
        ${ineligibleRows.length ? `<details><summary class="muted">Ineligible horses (${ineligibleRows.length})</summary>${ineligibleRows.join('')}</details>` : ''}
      `;

      pendingEntry = { raceId, isAOC: false };
    }

    this._pendingEntry = pendingEntry;
    this._showModal('enter-race-modal');
  }

  _bindModals() {
    document.getElementById('btn-confirm-entry').addEventListener('click', () => {
      const sel = document.querySelector('input[name="entry-horse"]:checked');
      if (!sel) { alert('Please select a horse.'); return; }

      // For AOC races, determine whether this horse is running for the claiming price
      let claimingElection = false;
      if (this._pendingEntry.isAOC) {
        if (sel.dataset.claimingForced === 'true') {
          claimingElection = true;   // non-N1X horse — claiming mandatory
        } else {
          const cb = document.getElementById(`claiming-check-${sel.value}`);
          claimingElection = cb ? cb.checked : false;
        }
      }

      const result = this.game.enterRace(sel.value, this._pendingEntry.raceId, claimingElection);
      if (result.ok) {
        this._hideModal('enter-race-modal');
        this.updateHeader();
        this.renderConditionBook();
        this.renderDashboard();
        if (this.activeScreen === 'stakes-book') this.renderStakesBook();
        this.flashMsg('Entry confirmed!');
      } else {
        alert(result.msg);
      }
    });

    document.getElementById('btn-cancel-entry').addEventListener('click', () =>
      this._hideModal('enter-race-modal'));

    document.getElementById('btn-close-horse-modal').addEventListener('click', () =>
      this._hideModal('horse-modal'));

    document.getElementById('btn-close-race').addEventListener('click', () => {
      if (this._raceCanvas) { this._raceCanvas.stop(); this._raceCanvas = null; }
      this._hideModal('race-modal');
      this.updateHeader();
      this.renderDashboard();
      if (this.activeScreen === 'stable')          this.renderStable();
      if (this.activeScreen === 'condition-book')  this.renderConditionBook();
      if (this.activeScreen === 'stakes-book')     this.renderStakesBook();
    });

    document.querySelectorAll('.modal').forEach(m => {
      m.addEventListener('click', e => {
        if (e.target === m) {
          if (m.id === 'race-modal') return;
          this._hideModal(m.id);
        }
      });
    });
  }

  // ── Race Modal ─────────────────────────────────────────────────────────────

  openRaceModal(raceId) {
    // Search condition book then BC/TC special races
    let race = null;
    const book = this.game.conditionBook;
    if (book) {
      for (const d of book.raceDays)
        for (const r of d.races)
          if (r.id === raceId) { race = r; break; }
    }
    if (!race) {
      const special = this.game._findSpecialRace(raceId);
      if (special) race = special.race;
    }
    if (!race || !race.playerEntry) return;

    // Block re-entry if race already ran
    if (race.playerEntry.ran) return;

    const horse = this.game.horses.find(h => h.id === race.playerEntry.horseId);
    if (!horse) return;

    // Stop any previous animation and clear the canvas
    if (this._raceCanvas) { this._raceCanvas.stop(); this._raceCanvas = null; }
    const canvas = document.getElementById('race-canvas');
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

    // Pre-compute results once, then shuffle into gate/lane order.
    // The same shuffled array drives both the post-position list and the canvas lanes.
    const precomputedResults = simulateRace(horse, race);
    const fieldOrder = shuffleArray([...precomputedResults]);

    document.getElementById('race-title').innerHTML   = `<h2>${race.name}</h2>`;
    document.getElementById('race-info').innerHTML    =
      `<span>${race.distance}f · ${race.surface} · ${race.division} · Purse ${formatMoney(race.purse)}</span>
       ${race.claimingPrice ? `<span class="claiming-tag">Claiming ${formatMoney(race.claimingPrice)}</span>` : ''}`;

    document.getElementById('race-status').textContent = '';
    const raceResultsEl = document.getElementById('race-results');
    raceResultsEl.classList.add('hidden');
    raceResultsEl.innerHTML = '';
    document.getElementById('btn-close-race').classList.add('hidden');
    document.getElementById('btn-start-race').classList.remove('hidden');

    document.getElementById('race-field').innerHTML = this._buildPreviewField(fieldOrder);

    const startBtn = document.getElementById('btn-start-race');
    startBtn.onclick = () => {
      startBtn.onclick = null;          // kill immediately — no double-clicks, no re-runs
      startBtn.classList.add('hidden');
      this._runRaceAnimation(race, fieldOrder);
    };

    this._showModal('race-modal');
  }

  _buildPreviewField(results) {
    // results already in gate/lane order — post position i+1 = canvas lane i+1
    const draw = results;
    return `<h4>Post Positions</h4>
      <table class="field-table">
        <thead><tr><th>PP</th><th>Horse</th><th>Jockey</th><th></th></tr></thead>
        <tbody>${draw.map((e, i) => `
          <tr class="${e.isPlayer ? 'player-row' : ''}">
            <td>${i + 1}</td>
            <td><span class="cloth-dot" style="background:${e.horse.clothColor}"></span>${e.horse.name}</td>
            <td>${e.horse.jockey}</td>
            <td>${e.isPlayer ? '<span class="you-badge">YOU</span>' : ''}</td>
          </tr>`).join('')}

        </tbody>
      </table>`;
  }

  _runRaceAnimation(race, precomputedResults) {
    document.getElementById('btn-start-race').classList.add('hidden');
    document.getElementById('race-status').textContent = 'Running…';

    // Size the canvas to fit every horse — each lane needs ~32px, plus 60px padding
    const canvas = document.getElementById('race-canvas');
    canvas.height = Math.max(200, precomputedResults.length * 32 + 60);

    const anim   = new RaceCanvas(canvas, precomputedResults, race.surface);
    this._raceCanvas = anim;

    anim.start(() => {
      const summary = this.game.runRace(race.id, precomputedResults);
      if (!summary) return;
      this.game.saveToLocal();   // persist ran:true immediately
      this._showRaceResults(summary);
    });
  }

  _showRaceResults(summary) {
    const el     = document.getElementById('race-results');
    const pos    = summary.playerPosition;
    const earned = summary.playerEarned;
    const places = ['','1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th','11th','12th','13th'];
    const posLabel = places[pos] || pos + 'th';
    const isWin  = pos === 1;

    const finishers = [...summary.results].sort((a, b) => a.position - b.position);

    // Show jockey notes if any were generated
    const horse      = this.game.horses.find(h => h.id === summary.race.playerEntry?.horseId);
    const freshNotes = horse?.jockeyNotes.filter(n => n.week === summary.week) ?? [];
    const notesHtml  = freshNotes.length
      ? `<div class="result-notes">${freshNotes.map(n => `<div class="jockey-note ${n.type === 'surface' ? 'note-surface' : 'note-distance'}">
           <span class="note-icon">${n.type === 'surface' ? '🏇' : '📏'}</span> ${n.text}
         </div>`).join('')}</div>`
      : '';

    el.innerHTML = `
      <div class="result-banner ${isWin ? 'result-win' : 'result-place'}">
        <div class="result-pos">${isWin ? '🏆 WINNER!' : posLabel + ' Place'}</div>
        ${earned > 0 ? `<div class="result-earned">+${formatMoney(earned)}</div>` : ''}
        ${summary.horseClaimed ? `<div class="claimed-notice">⚠ Your horse was claimed for ${formatMoney(summary.race.playerEntry?.effectiveClaimingPrice || summary.race.claimingPrice)}!</div>` : ''}
      </div>
      ${notesHtml}
      <table class="results-table">
        <thead><tr><th>Pos</th><th>Horse</th><th>Payout</th></tr></thead>
        <tbody>${finishers.map(r => `
          <tr class="${r.isPlayer ? 'player-row' : ''}">
            <td>${places[r.position] || r.position + 'th'}</td>
            <td>${r.horse.name}${r.isPlayer ? ' <span class="you-badge">YOU</span>' : ''}</td>
            <td>${r.position <= GAME_CONFIG.PAYOUT.length
              ? formatMoney(Math.round(summary.race.purse * GAME_CONFIG.PAYOUT[r.position - 1]))
              : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    `;
    el.classList.remove('hidden');
    document.getElementById('race-status').textContent = '';
    document.getElementById('btn-close-race').classList.remove('hidden');
  }

  // ── Modal helpers ──────────────────────────────────────────────────────────

  _showModal(id) {
    document.getElementById(id).classList.remove('hidden');
    document.body.classList.add('modal-open');
  }

  _hideModal(id) {
    document.getElementById(id).classList.add('hidden');
    if (!document.querySelector('.modal:not(.hidden)')) {
      document.body.classList.remove('modal-open');
    }
  }
}
