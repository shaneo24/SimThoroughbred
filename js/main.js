// ─── Theme (global scope — called by onclick in HTML) ─────────────────────────

const THEMES = {
  dark: {
    '--bg':            '#0a0a0a',
    '--surface':       '#111111',
    '--panel':         '#1a1a1a',
    '--panel-2':       '#222222',
    '--border':        '#2e2e2e',
    '--gold':          '#d4a843',
    '--gold-lt':       '#e8c56a',
    '--text':          '#f0f0f0',
    '--text-2':        '#888888',
    '--green':         '#4caf50',
    '--red':           '#e05252',
    '--orange':        '#ff9800',
    '--shadow':        '0 4px 20px rgba(0,0,0,0.7)',
    '--header-bg':     '#050505',
    '--overlay-xs':    'rgba(255,255,255,0.02)',
    '--overlay-sm':    'rgba(255,255,255,0.03)',
    '--overlay-md':    'rgba(255,255,255,0.07)',
    '--overlay-bar':   'rgba(255,255,255,0.08)',
    '--row-border':    'rgba(255,255,255,0.04)',
    '--btn-dis-bg':    '#1e1e1e',
    '--btn-dis-color': '#555555'
  },
  light: {
    '--bg':            '#f4f0e6',
    '--surface':       '#ffffff',
    '--panel':         '#f0ebe0',
    '--panel-2':       '#e8e2d4',
    '--border':        '#c8bfa0',
    '--gold':          '#3a3a3a',
    '--gold-lt':       '#555555',
    '--text':          '#1a1208',
    '--text-2':        '#6b5d3f',
    '--green':         '#2e7d32',
    '--red':           '#c62828',
    '--orange':        '#bf5000',
    '--shadow':        '0 4px 20px rgba(0,0,0,0.15)',
    '--header-bg':     '#e8e2d4',
    '--overlay-xs':    'rgba(0,0,0,0.02)',
    '--overlay-sm':    'rgba(0,0,0,0.03)',
    '--overlay-md':    'rgba(0,0,0,0.05)',
    '--overlay-bar':   'rgba(0,0,0,0.08)',
    '--row-border':    'rgba(0,0,0,0.07)',
    '--btn-dis-bg':    '#d4cfc4',
    '--btn-dis-color': '#9e9890'
  }
};

// Apply a theme by name ('dark' | 'light').
// Sets every CSS variable as an inline style (highest possible specificity),
// moves the toggle thumb, and updates the icon — no CSS class dependency needed.
function applyTheme(name) {
  const isLight = name === 'light';
  const vars    = THEMES[isLight ? 'light' : 'dark'];
  const root    = document.documentElement;

  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
  root.classList.toggle('light-mode', isLight);

  const thumb = document.querySelector('.toggle-thumb');
  if (thumb) thumb.style.transform = isLight ? 'translateX(18px)' : 'translateX(0)';

  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = isLight ? '☀️' : '🌙';
}

// Called directly via onclick="toggleTheme()" on the button in HTML.
function toggleTheme() {
  const next = document.documentElement.classList.contains('light-mode') ? 'dark' : 'light';
  applyTheme(next);
  try { localStorage.setItem('simthoroughbred_theme', next); } catch (e) {}
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

let game, ui;

window.addEventListener('DOMContentLoaded', async () => {
  // Restore saved theme preference
  const savedTheme = localStorage.getItem('simthoroughbred_theme') === 'light' ? 'light' : 'dark';
  applyTheme(savedTheme);

  // Game init — loadFromLocal is async (HMAC verification)
  const saved = await GameState.loadFromLocal();
  game = saved || new GameState();

  ui = new UI(game);
  ui.init();

  if (saved) {
    ui.flashMsg('Auto-save restored from last session.');
  } else {
    game.notify('Welcome to SimThoroughbred! You have $100,000 to build your stable. Visit the Auction to buy your first horse.', 'info');
    ui.renderDashboard();
  }
});
