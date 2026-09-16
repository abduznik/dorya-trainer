// Unified input: keyboard + gamepad. The mouse only drives the UI and camera.
// Nothing here is time-based; main.js calls sample() exactly once per 60 Hz
// simulation frame, so "pressed" means "went down since the previous frame",
// which is how Tekken itself sees inputs.

export const ACTIONS = ['up', 'down', 'left', 'right', 'b1', 'b2', 'b3', 'b4', 'reset'];
export const BUTTONS = ['b1', 'b2', 'b3', 'b4'];
export const PRESS_ACTIONS = [...BUTTONS, 'reset']; // edge-triggered actions

export const DEFAULT_BINDINGS = {
  keys: {
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    b1: ['KeyJ', 'KeyU'], b2: ['KeyK', 'KeyI'], b3: ['KeyL', 'KeyO'], b4: ['Semicolon', 'KeyP'],
    reset: ['KeyR'],
  },
  // Standard gamepad mapping: 12-15 = d-pad, 0=A/Cross 1=B/Circle 2=X/Square 3=Y/Triangle
  pad: { up: [12], down: [13], left: [14], right: [15], b1: [2], b2: [3], b3: [0], b4: [1], reset: [8] },
};

export const DIR_ARROWS = { 1: '↙', 2: '↓', 3: '↘', 4: '←', 5: '★', 6: '→', 7: '↖', 8: '↑', 9: '↗' };

function clone(o) { return JSON.parse(JSON.stringify(o)); }

// 8-way from an analog vector (x right, y up). 45° sectors like a real stick gate.
function dirFromVector(x, y, dead) {
  const mag = Math.hypot(x, y);
  if (mag < dead) return 5;
  const a = Math.atan2(y, x);
  const sector = Math.round(a / (Math.PI / 4)) & 7;
  return [6, 9, 8, 7, 4, 1, 2, 3][sector];
}

function dirFromDigital(up, down, left, right) {
  const x = (right ? 1 : 0) - (left ? 1 : 0);
  const y = (up ? 1 : 0) - (down ? 1 : 0);
  return 5 + x + y * 3;
}

export class InputManager {
  constructor(bindings = clone(DEFAULT_BINDINGS)) {
    this.bindings = bindings;
    this.keysDown = new Set();
    this.pending = new Set();        // button actions pressed since last sample
    this.prevPad = [];
    this.padIndex = null;
    this.padName = '';
    this.capture = null;             // { kind: 'keys'|'pad', resolve }
    this.lastSource = 'keyboard';
    this.device = 'auto';            // 'auto' | 'keyboard' | 'pad'
    this.stickDeadzone = 0.6;        // analog stick magnitude before a direction registers

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.keysDown.delete(e.code));
    window.addEventListener('blur', () => this.keysDown.clear());

    window.addEventListener('gamepadconnected', (e) => {
      if (this.padIndex === null) { this.padIndex = e.gamepad.index; this.padName = e.gamepad.id; }
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      if (e.gamepad.index === this.padIndex) { this.padIndex = null; this.padName = ''; this.prevPad = []; }
    });
  }

  actionsFor(kind, code) {
    const map = this.bindings[kind];
    return Object.keys(map).filter((a) => map[a].includes(code));
  }

  captureNext(kind) {
    return new Promise((resolve) => { this.capture = { kind, resolve }; });
  }

  cancelCapture() {
    if (this.capture) { this.capture.resolve(null); this.capture = null; }
  }

  rebind(kind, action, code) {
    const map = this.bindings[kind];
    for (const a of Object.keys(map)) map[a] = map[a].filter((c) => c !== code);
    map[action] = [code];
  }

  onKeyDown(e) {
    if (this.capture && this.capture.kind === 'keys') {
      e.preventDefault();
      const cap = this.capture; this.capture = null;
      cap.resolve(e.code === 'Escape' ? null : e.code);
      return;
    }
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    const actions = this.actionsFor('keys', e.code);
    if (actions.length) e.preventDefault();
    if (e.repeat) return;
    if (!actions.length) return; // only bound keys count as keyboard activity
    this.keysDown.add(e.code);
    for (const a of actions) if (PRESS_ACTIONS.includes(a)) this.pending.add(a);
    if (actions.length) this.lastSource = 'keyboard';
  }

  getGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (this.padIndex !== null && pads[this.padIndex]) return pads[this.padIndex];
    for (const p of pads) if (p && p.connected) { this.padIndex = p.index; this.padName = p.id; return p; }
    return null;
  }

  sample() {
    const held = { b1: false, b2: false, b3: false, b4: false };
    const pressed = { b1: false, b2: false, b3: false, b4: false, reset: false };
    for (const a of this.pending) pressed[a] = true;
    this.pending.clear();

    const k = (a) => this.bindings.keys[a].some((c) => this.keysDown.has(c));
    let dir = dirFromDigital(k('up'), k('down'), k('left'), k('right'));
    for (const b of BUTTONS) if (k(b)) held[b] = true;
    if (dir !== 5) this.lastSource = 'keyboard';

    // Device policy. 'auto': the keyboard wins whenever any bound key is held or was just
    // pressed, and the pad is only read when the keyboard is completely idle, so a drifting
    // stick can never override a keyboard motion (or its neutral step). 'keyboard' / 'pad'
    // force one device.
    const keyboardActive = this.keysDown.size > 0 || Object.values(pressed).some(Boolean);
    const readPad = this.device === 'pad' || (this.device !== 'keyboard' && !keyboardActive);
    if (this.device === 'pad') {
      dir = 5;
      for (const b of BUTTONS) held[b] = false;
      for (const a of Object.keys(pressed)) pressed[a] = false;
    }

    const gp = this.getGamepad();
    if (gp) {
      const cur = gp.buttons.map((b) => b.pressed || b.value > 0.5);
      // rising edges are always tracked so nothing is double-counted when the pad becomes active
      const rising = cur.map((v, i) => v && !this.prevPad[i]);
      this.prevPad = cur;
      if (this.capture && this.capture.kind === 'pad') {
        const i = rising.findIndex(Boolean);
        if (i >= 0) { const cap = this.capture; this.capture = null; cap.resolve(i); }
      } else if (readPad) {
        const p = (a) => this.bindings.pad[a].some((i) => cur[i]);
        let pdir = dirFromDigital(p('up'), p('down'), p('left'), p('right'));
        if (pdir === 5 && gp.axes.length >= 2) pdir = dirFromVector(gp.axes[0], -gp.axes[1], this.stickDeadzone);
        if (pdir !== 5) { dir = pdir; this.lastSource = 'controller'; }
        for (let i = 0; i < rising.length; i++) {
          if (!rising[i]) continue;
          for (const a of this.actionsFor('pad', i)) if (PRESS_ACTIONS.includes(a)) pressed[a] = true;
          this.lastSource = 'controller';
        }
        for (const b of BUTTONS) if (p(b)) held[b] = true;
      }
    }

    return { dir, held, pressed };
  }
}

export function keyLabel(code) {
  if (!code) return '—';
  return code.replace(/^Key/, '').replace(/^Arrow/, '').replace(/^Digit/, '')
    .replace('Semicolon', ';').replace('Quote', "'").replace('Comma', ',').replace('Period', '.');
}

export function padLabel(i) {
  if (i === undefined || i === null) return '—';
  const names = { 0: 'A / ✕', 1: 'B / ○', 2: 'X / □', 3: 'Y / △', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
    8: 'Back', 9: 'Start', 10: 'L3', 11: 'R3', 12: 'D-Up', 13: 'D-Down', 14: 'D-Left', 15: 'D-Right' };
  return names[i] || `Btn ${i}`;
}
