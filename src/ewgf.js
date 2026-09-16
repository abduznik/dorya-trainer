// Electric Wind God Fist detector.
// Motion: f (6), n (5), d (2), d/f (3) + 2.  The punch is "electric" only when
// button 2 lands on the very first frame the direction becomes d/f.
//
// tick() is called once per 60 Hz frame with the current direction (numpad
// notation, player facing right) and whether button 2 went down this frame.

export const DEFAULT_OPTS = {
  neutralWindow: 12, // max frames allowed in neutral between f and d
  downWindow: 12,    // max frames allowed in d before d/f
  lateWindow: 12,    // 2 pressed this many frames after d/f (during the crouch dash) still gives a normal WGF
  maxDfHold: 40,     // after this we stop tracking the attempt entirely
};

export const FAIL_REASONS = {
  early:   { title: 'TOO EARLY', text: 'Pressed 2 while still in d (before d/f)' },
  neutral: { title: 'NO CROUCH', text: 'Pressed 2 during neutral, never went to d' },
  skip:    { title: 'd/f+2', text: 'f, n, d/f without d only works as a Perfect Electric (2 on the exact d/f frame). Late = plain d/f+2' },
  late:    { title: 'TOO LATE', text: 'Pressed 2 too long after d/f (that is just d/f+2)' },
};

export class EwgfDetector {
  constructor(opts = {}) {
    this.opts = { ...DEFAULT_OPTS, ...opts };
    this.reset();
  }

  reset() { this.state = 'idle'; this.t = 0; this.nFrames = 0; this.dFrames = 0; this.enteredDf = false; }
  set(s) { this.state = s; this.t = 0; if (s === 'df') this.enteredDf = true; }

  // 0..4 steps completed (for the HUD chips)
  progress() {
    return { idle: 0, f: 1, n: 2, skip: 2, d: 3, df: 4 }[this.state];
  }

  tick(dir, pressed2) {
    const o = this.opts;
    this.enteredDf = false;

    // 1) direction transitions
    switch (this.state) {
      case 'idle':
        if (dir === 6) this.set('f');
        break;
      case 'f':
        if (dir === 5) this.set('n');
        else if (dir !== 6) this.set('idle');
        break;
      case 'n':
        if (dir === 2) { this.nFrames = this.t; this.set('d'); }
        else if (dir === 6) this.set('f');
        else if (dir === 3) { this.nFrames = this.t; this.set('skip'); }
        else if (dir !== 5 || this.t >= o.neutralWindow) this.set('idle');
        break;
      case 'd':
        if (dir === 3) { this.dFrames = this.t; this.set('df'); }
        else if (dir !== 2 || this.t >= o.downWindow) this.set('idle');
        break;
      case 'df':
      case 'skip':
        if (dir !== 3 || this.t > o.maxDfHold) this.set('idle');
        break;
    }
    if (this.state === 'idle' && dir === 6) this.set('f');

    // 2) button 2
    let result = null;
    if (pressed2) {
      switch (this.state) {
        case 'df': {
          const offset = this.t;
          if (offset === 0) result = { type: 'EWGF', offset };
          else if (offset <= o.lateWindow) result = { type: 'WGF', offset };
          else result = { type: 'FAIL', reason: 'late', offset };
          break;
        }
        // f, n, d/f+2 with 2 on the d/f frame is the Perfect Electric (mist-step version);
        // anything later on that path is just d/f+2
        case 'skip': result = this.t === 0 ? { type: 'PEWGF', offset: 0 } : { type: 'FAIL', reason: 'skip', offset: this.t }; break;
        case 'd': result = { type: 'FAIL', reason: 'early', offset: -(this.t + 1) }; break;
        case 'n': result = { type: 'FAIL', reason: 'neutral', offset: null }; break;
      }
      if (result) {
        result.nFrames = this.nFrames;
        result.dFrames = this.state === 'd' ? this.t + 1 : this.dFrames;
        this.set('idle');
      }
    }

    this.t++;
    return result;
  }
}

// ---- session statistics -------------------------------------------------
export class Stats {
  constructor() { this.reset(); this.best = 0; }
  reset() {
    this.attempts = 0; this.ewgf = 0; this.pewgf = 0; this.wgf = 0; this.fail = 0;
    this.streak = 0; this.offsets = [];
  }
  add(r) {
    this.attempts++;
    if (r.type === 'EWGF' || r.type === 'PEWGF') {
      this.ewgf++; if (r.type === 'PEWGF') this.pewgf++;
      this.streak++; this.best = Math.max(this.best, this.streak);
    }
    else if (r.type === 'WGF') { this.wgf++; this.streak = 0; }
    else { this.fail++; this.streak = 0; }
    this.offsets.push(r.type === 'FAIL' ? 'x' : r.offset);
    if (this.offsets.length > 200) this.offsets.shift();
  }
  get rate() { return this.attempts ? this.ewgf / this.attempts : 0; }
}
