// ─── Race Canvas Animation ────────────────────────────────────────────────────

class RaceCanvas {
  constructor(canvasEl, animData, surface) {
    this.canvas    = canvasEl;
    this.ctx       = canvasEl.getContext('2d');
    this.animData  = animData;   // [{ horse, isPlayer, position, finishFrame, clothColor }]
    this.surface   = surface;
    this.frame     = 0;
    this.phase     = 'countdown'; // countdown | running | done
    this.countdownTimer = 120;    // frames of countdown (2 sec at 60fps)
    this.raf       = null;
    this.onDone    = null;

    this.TRACK_W   = canvasEl.width;
    this.TRACK_H   = canvasEl.height;
    this.START_X   = 50;
    this.FINISH_X  = this.TRACK_W - 60;
    this.TOTAL_FRAMES = 540;      // ~9 seconds at 60fps

    // Assign lane positions
    const n = animData.length;
    const laneH = (this.TRACK_H - 60) / n;
    this.animData.forEach((e, i) => {
      e.laneY = 30 + i * laneH + laneH * 0.3;
    });

    // Finish frame per horse
    const base = this.TOTAL_FRAMES;
    this.animData.forEach(e => {
      e.finishFrame = base + (e.position - 1) * 16;
    });

    this.totalFrames = Math.max(...this.animData.map(e => e.finishFrame)) + 60;

    // Assign running styles and build pace profiles
    this.animData.forEach(e => this._buildPaceProfile(e));
  }

  // ── Pace profile ─────────────────────────────────────────────────────────────
  // Each horse gets a sinusoidal speed variation layered on top of its base pace.
  // pos(t) = t + amp * sin(2π * t) — always 0 at start and finish, never zero velocity.
  // Positive amp = faster first half, fades late. Negative = slow starter, finishes well.
  _buildPaceProfile(entry) {
    // Random amplitude between -0.03 and +0.03 (keeps velocity always positive)
    entry.paceAmp = (Math.random() - 0.5) * 0.06;
  }

  // Continuous x position — horse never stops, just gradually changes speed
  _paceX(entry, frame) {
    const t        = Math.min(1, frame / entry.finishFrame);
    const distFrac = t + entry.paceAmp * Math.sin(Math.PI * 2 * t);
    return this.START_X + Math.max(0, distFrac) * (this.FINISH_X - this.START_X - 30);
  }

  start(onDone) {
    this.onDone = onDone;
    this.phase  = 'countdown';
    this.frame  = 0;
    this._loop();
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  _loop() {
    this._draw();
    if (this.phase !== 'done') {
      this.raf = requestAnimationFrame(() => this._loop());
    } else {
      if (this.onDone) this.onDone();
    }
  }

  _draw() {
    const ctx = this.ctx;
    const W = this.TRACK_W, H = this.TRACK_H;

    // ── Background / Track ────────────────────────────────────────────────
    ctx.fillStyle = this.surface === 'turf' ? '#1a4a24' : '#3d2b0a';
    ctx.fillRect(0, 0, W, H);

    // Track surface stripe
    ctx.fillStyle = this.surface === 'turf' ? '#2a6135' : '#5c3e10';
    ctx.fillRect(0, 20, W, H - 40);

    // Rail lines
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 22); ctx.lineTo(W, 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, H - 22); ctx.lineTo(W, H - 22); ctx.stroke();

    // Starting gate
    if (this.phase === 'countdown') {
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(this.START_X, 20); ctx.lineTo(this.START_X, H - 20); ctx.stroke();
    }

    // Finish line
    const fStripes = 8;
    const stripeH = (H - 40) / fStripes;
    for (let i = 0; i < fStripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#fff' : '#000';
      ctx.fillRect(this.FINISH_X - 2, 22 + i * stripeH, 6, stripeH);
    }

    // Furlong markers
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '10px monospace';
    const trackLen = this.FINISH_X - this.START_X;
    for (let f = 1; f <= 6; f++) {
      const mx = this.START_X + (f / 7) * trackLen;
      ctx.fillRect(mx, 22, 1, H - 44);
      ctx.fillText(f + 'f', mx - 4, H - 6);
    }

    // ── Countdown Phase ───────────────────────────────────────────────────
    if (this.phase === 'countdown') {
      this.countdownTimer--;
      const sec = Math.ceil(this.countdownTimer / 60);

      // Draw horses at gate
      this.animData.forEach(e => {
        this._drawHorse(ctx, this.START_X - 30, e.laneY, e, false);
      });

      // Countdown text
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(W / 2 - 90, H / 2 - 36, 180, 60);
      ctx.fillStyle = '#c9a84c';
      ctx.font = 'bold 26px Cinzel, Georgia, serif';
      ctx.textAlign = 'center';
      const label = sec > 0 ? `Get Ready: ${sec}` : "THEY'RE OFF!";
      ctx.fillText(label, W / 2, H / 2 + 8);
      ctx.textAlign = 'left';

      if (this.countdownTimer <= 0) {
        this.phase = 'running';
        this.frame = 0;
      }
      return;
    }

    // ── Running Phase ─────────────────────────────────────────────────────
    this.frame++;

    let allDone = true;
    this.animData.forEach(e => {
      const x      = this._paceX(e, this.frame);
      const bounce = Math.sin(this.frame * 0.35 + e.laneY) * 1.8;
      this._drawHorse(ctx, x, e.laneY + bounce, e, true);
      if (this.frame < e.finishFrame) allDone = false;
    });

    // Leader label — sort by current x position (furthest along wins the label)
    const sorted = [...this.animData].sort((a, b) =>
      this._paceX(b, this.frame) - this._paceX(a, this.frame)
    );
    const leader = sorted[0];
    ctx.fillStyle = '#c9a84c';
    ctx.font = 'bold 11px Lato, sans-serif';
    ctx.fillText('LEADER: ' + leader.horse.name, 6, 16);

    if (allDone || this.frame >= this.totalFrames) {
      this.phase = 'done';
      this._drawFinish();
    }
  }

  _drawHorse(ctx, x, y, entry, showName) {
    const isPlayer = entry.isPlayer;
    const color    = entry.horse.clothColor || '#e74c3c';
    const coat     = entry.horse.coat?.hex || '#7B3F00';

    // Body
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.ellipse(x + 18, y + 6, 20, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Neck + head
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.moveTo(x + 32, y + 2);
    ctx.lineTo(x + 38, y - 4);
    ctx.lineTo(x + 44, y - 2);
    ctx.lineTo(x + 40, y + 4);
    ctx.closePath();
    ctx.fill();

    // Ear
    ctx.beginPath();
    ctx.moveTo(x + 40, y - 2);
    ctx.lineTo(x + 43, y - 7);
    ctx.lineTo(x + 45, y - 2);
    ctx.closePath();
    ctx.fillStyle = coat;
    ctx.fill();

    // Legs (animated gallop)
    const legPhase = x * 0.4; // use x as proxy for animation phase
    ctx.strokeStyle = coat;
    ctx.lineWidth = 2;
    const legOffsets = [
      Math.sin(legPhase) * 4,
      Math.sin(legPhase + 1.5) * 4,
      Math.sin(legPhase + 3.0) * 4,
      Math.sin(legPhase + 4.5) * 4
    ];
    [7, 14, 20, 27].forEach((lx, i) => {
      ctx.beginPath();
      ctx.moveTo(x + lx, y + 12);
      ctx.lineTo(x + lx + legOffsets[i], y + 20);
      ctx.stroke();
    });

    // Tail
    ctx.strokeStyle = coat;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 2, y + 4);
    ctx.quadraticCurveTo(x - 10, y - 2, x - 8, y + 8);
    ctx.stroke();

    // Jockey silhouette (saddle cloth color)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x + 22, y - 2, 7, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Jockey cap
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + 25, y - 7, 4, 0, Math.PI * 2);
    ctx.fill();

    // Player highlight ring
    if (isPlayer) {
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x + 22, y + 4, 26, 12, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Name tag above horse
    if (showName) {
      ctx.font = isPlayer ? 'bold 9px Lato, sans-serif' : '8px Lato, sans-serif';
      ctx.fillStyle = isPlayer ? '#FFD700' : 'rgba(255,255,255,0.75)';
      ctx.fillText(entry.horse.name.split(' ')[0], x + 4, y - 12);
    }
  }

  _drawFinish() {
    const ctx = this.ctx;
    const W = this.TRACK_W, H = this.TRACK_H;

    // Dim overlay
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';

    // Winner banner
    const winner = this.animData.find(e => e.position === 1);
    const label = winner.isPlayer ? '🏆 YOUR HORSE WINS!' : winner.horse.name + ' WINS!';
    const col   = winner.isPlayer ? '#FFD700' : '#fff';

    ctx.fillStyle = col;
    ctx.font = 'bold 22px Cinzel, Georgia, serif';
    ctx.fillText(label, W / 2, H / 2 - 10);

    // Player result
    const pEntry = this.animData.find(e => e.isPlayer);
    if (pEntry && pEntry.position > 1) {
      const places = ['','1st','2nd','3rd','4th','5th','6th','7th','8th',
                       '9th','10th','11th','12th','13th','14th'];
      ctx.fillStyle = '#ccc';
      ctx.font = '14px Lato, sans-serif';
      ctx.fillText('Your horse finished ' + (places[pEntry.position] || pEntry.position + 'th'),
                   W / 2, H / 2 + 16);
    }

    ctx.textAlign = 'left';
  }
}
