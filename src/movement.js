// Tekken-style ground movement on an endless 2D line, stepped at 60 Hz.
// Units are metres per frame. Player faces right, so f = +x.
//
//   hold f / b          walk
//   f, f                dash
//   b, b                backdash
//   hold d              crouch
//   f, n, d, d/f        crouch dash (CD)  – started by the EWGF detector
//   CD, f, n, d, d/f    wavedash (tap f to cancel the CD into the next one)

const WALK_F = 0.019, WALK_B = 0.015;
const DASH_FRAMES = 12, BACKDASH_FRAMES = 12, CD_FRAMES = 24;
const RUN_SPEED = 0.046;         // m per frame (~2.8 m/s)
const TAP_WINDOW = 12;          // frames between two taps for f,f / b,b
const WAVE_LINK_WINDOW = 40;    // frames between CDs to keep the wavedash count alive

export class Movement {
  constructor() {
    this.frame = 0;
    this.lastDir = 5;
    this.fTap = -99; this.bTap = -99;
    this.dashT = 0; this.backT = 0; this.cdT = 0;
    this.running = false;
    this.lastCdStart = -999;
    this.waveCount = 0;
    this.state = 'stand';
    this.dx = 0;
  }

  reset() { this.dashT = 0; this.backT = 0; this.cdT = 0; this.running = false; this.waveCount = 0; this.lastCdStart = -999; this.fTap = -99; this.bTap = -99; this.state = 'stand'; this.dx = 0; }

  startDash() { this.dashT = DASH_FRAMES; this.backT = 0; }
  startBackdash() { this.backT = BACKDASH_FRAMES; this.dashT = 0; }
  startCrouchDash() {
    this.cdT = CD_FRAMES; this.dashT = 0; this.backT = 0;
    this.waveCount = (this.frame - this.lastCdStart <= WAVE_LINK_WINDOW) ? this.waveCount + 1 : 1;
    this.lastCdStart = this.frame;
  }

  // dir: numpad direction, enteredDf: detector just completed f,n,d,d/f, attacking: attack anim busy
  tick(dir, enteredDf, attacking) {
    this.frame++;
    let dx = 0;

    // double-tap detection
    if (dir === 6 && this.lastDir !== 6) {
      if (this.dashT > 0 && !attacking) this.running = true;            // f, f, f: straight into a run
      else if (this.frame - this.fTap <= TAP_WINDOW && !attacking) this.startDash();
      this.fTap = this.frame;
    }
    // f, f then keep holding f: the dash becomes a run (Tekken f, F)
    if (this.dashT === 1 && dir === 6 && !attacking) this.running = true;
    if (this.running && (dir !== 6 && dir !== 9 && dir !== 3)) this.running = false;
    if (enteredDf || attacking) this.running = false;
    if (dir === 4 && this.lastDir !== 4) {
      if (this.frame - this.bTap <= TAP_WINDOW && !attacking) this.startBackdash();
      this.bTap = this.frame;
    }
    if (enteredDf && !attacking) this.startCrouchDash();

    // pressing f during a crouch dash cancels it (that is the wavedash)
    if (this.cdT > 0 && dir === 6) this.cdT = 0;
    // Korean backdash: d/b cancels the backdash recovery so b,b can be input again
    if (this.backT > 0 && this.backT < BACKDASH_FRAMES - 3 && dir === 1) { this.backT = 0; this.bTap = -99; }

    if (attacking) {
      this.state = 'attack';
      this.cdT = 0; this.dashT = 0; this.backT = 0;
    } else if (this.cdT > 0) {
      const k = this.cdT / CD_FRAMES;          // 1 → 0
      dx = 0.022 + 0.075 * k * k;   // ~1.1 m over the dash, fast start then glide
      this.cdT--;
      this.state = 'cd';
    } else if (this.running) {
      dx = RUN_SPEED; this.dashT = 0;
      this.state = 'run';
    } else if (this.dashT > 0) {
      dx = 0.028 + 0.045 * (this.dashT / DASH_FRAMES);
      this.dashT--;
      this.state = 'dash';
    } else if (this.backT > 0) {
      dx = -(0.02 + 0.05 * (this.backT / BACKDASH_FRAMES));
      this.backT--;
      this.state = 'backdash';
    } else if ([1, 2, 3].includes(dir)) {
      this.state = 'crouch';
    } else if (dir === 6 || dir === 9) {
      dx = WALK_F; this.state = 'walk';
    } else if (dir === 4 || dir === 7) {
      dx = -WALK_B; this.state = 'walk';
    } else {
      this.state = 'stand';
    }

    if (this.frame - this.lastCdStart > WAVE_LINK_WINDOW && this.cdT === 0) this.waveCount = 0;

    this.dx = dx;
    this.lastDir = dir;
    return dx;
  }
}
