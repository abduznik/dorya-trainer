import { DIR_ARROWS, ACTIONS, BUTTONS, DEFAULT_BINDINGS, keyLabel, padLabel } from './input.js';
import { FAIL_REASONS, DEFAULT_OPTS } from './ewgf.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'dorya.settings.v3';

const ACTION_LABELS = {
  up: 'Up (u)', down: 'Down (d)', left: 'Back (b)', right: 'Forward (f)',
  b1: '1 · left punch', b2: '2 · right punch', b3: '3 · left kick', b4: '4 · right kick',
  reset: 'Reset position',
};

// ---- persistence ------------------------------------------------------------
export function loadSettings() {
  const def = {
    bindings: JSON.parse(JSON.stringify(DEFAULT_BINDINGS)),
    opts: { ...DEFAULT_OPTS },
    volume: 0.6, best: 0, side: 'left',
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return def;
    const s = JSON.parse(raw);
    return {
      ...def, ...s,
      bindings: { keys: { ...def.bindings.keys, ...(s.bindings?.keys || {}) },
                  pad: { ...def.bindings.pad, ...(s.bindings?.pad || {}) } },
      opts: { ...def.opts, ...(s.opts || {}) },
    };
  } catch { return def; }
}
export function saveSettings(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

// ---- HUD ---------------------------------------------------------------------
export class Hud {
  constructor() {
    this.hist = [];
    this.flashTimer = null;
    this.progress = -1;
    this.chips = [...document.querySelectorAll('#motion .chip')];
    this.srcEl = $('src'); this.padEl = $('padname');
    this.lastSrc = ''; this.lastPad = null;
  }

  updateStats(stats, lateWindow) {
    $('st-attempts').textContent = stats.attempts;
    $('st-ewgf').textContent = stats.ewgf;
    $('st-pewgf').textContent = stats.pewgf;
    $('st-wgf').textContent = stats.wgf;
    $('st-fail').textContent = stats.fail;
    $('st-rate').textContent = stats.attempts ? `${Math.round(stats.rate * 100)}%` : '–';
    $('st-streak').textContent = stats.streak;
    $('st-best').textContent = stats.best;

    const bins = new Map();
    for (let i = 0; i <= lateWindow; i++) bins.set(i, 0);
    bins.set('x', 0);
    for (const o of stats.offsets) { const k = bins.has(o) ? o : 'x'; bins.set(k, bins.get(k) + 1); }
    const max = Math.max(1, ...bins.values());
    const h = $('histo');
    h.innerHTML = '';
    for (const [k, v] of bins) {
      const bar = document.createElement('div');
      bar.className = 'bar' + (k === 0 ? ' zero' : k === 'x' ? ' fail' : '');
      const i = document.createElement('i'); i.style.height = `${(v / max) * 34}px`;
      const lab = document.createElement('span'); lab.textContent = k === 'x' ? 'X' : k === 0 ? '0' : `+${k}`;
      bar.append(i, lab);
      bar.title = `${v}`;
      h.appendChild(bar);
    }
  }

  flash(result) {
    const main = $('flash-main'), sub = $('flash-sub');
    main.classList.remove('show', 'ewgf', 'wgf', 'fail');
    void main.offsetWidth;
    const timing = `n: ${result.nFrames}f · d: ${result.dFrames}f`;
    if (result.type === 'PEWGF') {
      main.textContent = 'DORYA!!'; main.classList.add('ewgf');
      sub.textContent = `PERFECT ELECTRIC – f, n, d/f+2 just frame · n: ${result.nFrames}f`;
    } else if (result.type === 'EWGF') {
      main.textContent = 'DORYA!!'; main.classList.add('ewgf');
      sub.textContent = `ELECTRIC – just frame · ${timing}`;
    } else if (result.type === 'WGF') {
      main.textContent = 'WIND GOD FIST'; main.classList.add('wgf');
      sub.textContent = `2 was ${result.offset} frame${result.offset > 1 ? 's' : ''} late · ${timing}`;
    } else {
      const r = FAIL_REASONS[result.reason];
      main.textContent = r.title; main.classList.add('fail');
      sub.textContent = r.text + (result.reason === 'early' ? ` (${-result.offset}f before d/f could register)` : '')
        + (result.reason === 'late' ? ` (+${result.offset}f)` : '');
    }
    main.classList.add('show');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => { main.classList.remove('show'); sub.textContent = ''; }, 1400);
  }

  pushInput(s) {
    const pressed = BUTTONS.filter((b) => s.pressed[b]);
    const last = this.hist[this.hist.length - 1];
    if (pressed.length === 0 && last && last.dir === s.dir && last.buttons.length === 0) {
      if (last.frames < 99) { last.frames++; this.updateLastRow(); }
      return;
    }
    this.hist.push({ dir: s.dir, buttons: pressed, frames: 1, cls: '' });
    if (this.hist.length > 14) this.hist.shift();
    this.renderHist();
  }

  markLast(type) {
    for (let i = this.hist.length - 1; i >= 0; i--) {
      if (this.hist[i].buttons.includes('b2')) { this.hist[i].cls = `hit-${type === 'PEWGF' ? 'ewgf' : type.toLowerCase()}`; break; }
    }
    this.renderHist();
  }

  renderHist() {
    const list = $('hist-list');
    list.innerHTML = '';
    for (const e of this.hist) {
      const row = document.createElement('div');
      row.className = `hrow ${e.cls}`;
      const fr = document.createElement('span'); fr.className = 'fr'; fr.textContent = e.frames;
      const dir = document.createElement('span'); dir.className = 'dir' + (e.dir === 5 ? ' n' : ''); dir.textContent = DIR_ARROWS[e.dir];
      row.append(fr, dir);
      for (const b of e.buttons) {
        const bt = document.createElement('span'); bt.className = `bt ${b}`; bt.textContent = b[1]; row.appendChild(bt);
      }
      list.appendChild(row);
    }
  }
  updateLastRow() {
    const rows = $('hist-list').children;
    const last = rows[rows.length - 1];
    if (last) last.firstChild.textContent = this.hist[this.hist.length - 1].frames;
  }

  setProgress(n) {
    if (n === this.progress) return;
    this.progress = n;
    this.chips.forEach((c, i) => c.classList.toggle('on', i < n));
  }

  // "2 = K" style reminder under the motion chips
  updateHint(input) {
    const k = (a) => input.bindings.keys[a].map(keyLabel).join(' / ');
    const p = (a) => padLabel(input.bindings.pad[a][0]);
    $('keyhint').innerHTML =
      `<b>2</b> = <kbd>${k('b2')}</kbd> · pad <kbd>${p('b2')}</kbd> &nbsp;&nbsp; ` +
      `<b>f</b> <kbd>${k('right')}</kbd> <b>d</b> <kbd>${k('down')}</kbd> <b>d/f</b> <kbd>${k('down')} + ${k('right')}</kbd>`;
  }

  setSource(src, padName) {
    if (src !== this.lastSrc) { this.lastSrc = src; this.srcEl.textContent = src; }
    if (padName !== this.lastPad) {
      this.lastPad = padName;
      this.padEl.textContent = padName ? padName.replace(/\(.*$/, '').trim().slice(0, 28) : 'no controller';
    }
  }
}

// ---- panels / settings ------------------------------------------------------
export function setupPanels({ input, detector, sfx, settings, hud }) {
  const help = $('help'), panel = $('settings');
  const closeAll = () => { help.hidden = true; panel.hidden = true; input.cancelCapture(); if (document.activeElement) document.activeElement.blur(); };
  // buttons and form controls must not keep keyboard focus, or gameplay keys would retrigger them
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('.btn'); if (b) b.blur(); });
  $('btn-help').onclick = () => { const was = help.hidden; closeAll(); help.hidden = !was; };
  $('btn-settings').onclick = () => { const was = panel.hidden; closeAll(); panel.hidden = !was; };
  document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeAll));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !input.capture) closeAll(); });

  const persist = () => {
    settings.bindings = input.bindings;
    settings.opts = { ...detector.opts };
    settings.volume = sfx.volume;
    settings.side = $('opt-side').value;
    saveSettings(settings);
  };

  const num = (id, key, target) => {
    const el = $(id);
    el.value = target[key];
    el.onchange = () => {
      const v = parseInt(el.value, 10);
      if (!Number.isNaN(v)) { target[key] = v; persist(); if (hud.onOptsChanged) hud.onOptsChanged(); }
      el.blur();
    };
  };
  num('opt-neutral', 'neutralWindow', detector.opts);
  num('opt-down', 'downWindow', detector.opts);
  num('opt-late', 'lateWindow', detector.opts);

  const side = $('opt-side');
  side.value = settings.side || 'left';
  side.onchange = () => { settings.side = side.value; persist(); side.blur(); if (hud.onSideChanged) hud.onSideChanged(); };

  const vol = $('opt-volume');
  vol.value = sfx.volume;
  vol.oninput = () => { sfx.setVolume(parseFloat(vol.value)); persist(); };

  const tbody = document.querySelector('#bind-table tbody');
  function renderBindings() {
    tbody.innerHTML = '';
    for (const a of ACTIONS) {
      const tr = document.createElement('tr');
      const name = document.createElement('td'); name.textContent = ACTION_LABELS[a]; tr.appendChild(name);
      const cell = (kind, label) => {
        const td = document.createElement('td');
        td.className = 'bind';
        td.textContent = label;
        td.onclick = async () => {
          input.cancelCapture();
          tbody.querySelectorAll('.listening').forEach((x) => x.classList.remove('listening'));
          td.classList.add('listening'); td.textContent = 'press…';
          const code = await input.captureNext(kind);
          if (code !== null && code !== undefined) input.rebind(kind, a, code);
          persist(); renderBindings();
        };
        return td;
      };
      tr.appendChild(cell('keys', input.bindings.keys[a].map(keyLabel).join(', ')));
      tr.appendChild(cell('pad', input.bindings.pad[a].map(padLabel).join(', ')));
      tbody.appendChild(tr);
    }
    hud.updateHint(input);
  }
  renderBindings();

  $('btn-defaults').onclick = () => {
    input.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    Object.assign(detector.opts, DEFAULT_OPTS);
    sfx.setVolume(0.6);
    $('opt-neutral').value = detector.opts.neutralWindow; $('opt-down').value = detector.opts.downWindow;
    $('opt-late').value = detector.opts.lateWindow; vol.value = 0.6;
    persist(); renderBindings();
    if (hud.onOptsChanged) hud.onOptsChanged();
  };

  return { persist };
}
