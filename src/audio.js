// Tiny WebAudio synth. No assets required; drop a `public/sfx/dorya.mp3` in
// the project and it is played on every electric.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.gain = null;
    this.volume = 0.6;
    this.voice = null; // decoded AudioBuffer for dorya.mp3, if present
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = this.volume;
    this.gain.connect(this.ctx.destination);
    this.loadVoice();
  }

  setVolume(v) { this.volume = v; if (this.gain) this.gain.gain.value = v; }

  async loadVoice() {
    try {
      const url = `${import.meta.env.BASE_URL}sfx/dorya.mp3`;
      const res = await fetch(url);
      if (!res.ok) return;
      const type = res.headers.get('content-type') || '';
      if (type.includes('text/html')) return; // dev server SPA fallback
      const buf = await res.arrayBuffer();
      this.voice = await this.ctx.decodeAudioData(buf);
    } catch { /* optional asset */ }
  }

  noise(duration) {
    const n = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    return src;
  }

  env(node, t0, a, peak, d) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    node.connect(g); g.connect(this.gain);
    return g;
  }

  // crackling electric zap + deep thump
  electric() {
    this.ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const nz = this.noise(0.45);
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    nz.connect(hp); this.env(hp, t, 0.005, 0.9, 0.4); nz.start(t);

    const osc = this.ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1800, t); osc.frequency.exponentialRampToValueAtTime(200, t + 0.25);
    this.env(osc, t, 0.005, 0.35, 0.3); osc.start(t); osc.stop(t + 0.4);

    const thump = this.ctx.createOscillator(); thump.type = 'sine';
    thump.frequency.setValueAtTime(140, t); thump.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    this.env(thump, t, 0.005, 1.0, 0.35); thump.start(t); thump.stop(t + 0.45);

    if (this.voice) {
      const s = this.ctx.createBufferSource(); s.buffer = this.voice; s.connect(this.gain); s.start(t);
    }
  }

  // regular WGF: solid thud, no crackle
  thud() {
    this.ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.2);
    this.env(o, t, 0.005, 0.8, 0.25); o.start(t); o.stop(t + 0.35);
    const nz = this.noise(0.12); const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    nz.connect(lp); this.env(lp, t, 0.002, 0.4, 0.1); nz.start(t);
  }

  buzz() {
    this.ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = 110;
    this.env(o, t, 0.005, 0.25, 0.2); o.start(t); o.stop(t + 0.25);
  }

  whiff() {
    this.ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const nz = this.noise(0.15); const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200;
    nz.connect(bp); this.env(bp, t, 0.01, 0.25, 0.12); nz.start(t);
  }
}
