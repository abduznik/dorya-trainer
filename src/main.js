import * as THREE from 'three';
import { InputManager } from './input.js';
import { EwgfDetector, Stats } from './ewgf.js';
import { Movement } from './movement.js';
import { Sfx } from './audio.js';
import { createScene } from './scene.js';
import { Electric } from './fx.js';
import { Physics } from './physics.js';
import { ActiveRagdoll } from './ragdoll.js';
import { Hud, loadSettings, saveSettings, setupPanels } from './ui.js';

// ---- setup -------------------------------------------------------------------
const canvas = document.getElementById('game');
const settings = loadSettings();
settings.drills ||= {};

const input = new InputManager(settings.bindings);
const detector = new EwgfDetector(settings.opts);
const movement = new Movement();
const stats = new Stats();
stats.best = settings.best || 0;

const sfx = new Sfx();
sfx.setVolume(settings.volume);
const unlockAudio = () => { sfx.ensure(); };
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

const hud = new Hud();
const $ = (id) => document.getElementById(id);
const view = createScene(canvas);
const physics = new Physics();

const player = new ActiveRagdoll(physics, view.scene, { x: 0, facing: 1, tone: 0xe6e6ea, group: 2, mask: 1 | 4, hair: 'kazuya' });
const dummy = new ActiveRagdoll(physics, view.scene, { x: 2.3, facing: -1, tone: 0x74747c, group: 4, mask: 1 | 2, hair: 'heihachi' });
const fx = new Electric(view.scene);

hud.onOptsChanged = () => hud.updateStats(stats, detector.opts.lateWindow);
setupPanels({ input, detector, sfx, settings, hud });
hud.updateStats(stats, detector.opts.lateWindow);

$('btn-reset').onclick = () => { stats.reset(); hud.updateStats(stats, detector.opts.lateWindow); };

// ---- modes / drills ------------------------------------------------------------------
const DRILLS = {
  electric10: { title: 'TEN ELECTRICS', desc: 'Land 10 electrics in a row. A regular WGF or a failed motion resets the count.', goal: 10 },
  wave5: { title: 'WAVEDASH ELECTRIC', desc: 'Link 3 crouch dashes then land the electric. Do it 5 times.', goal: 5 },
  kbd: { title: 'KOREAN BACKDASH', desc: 'b, b, d/b, b, b … Eight linked backdashes without a gap.', goal: 8 },
};
let mode = 'menu';
let electricPending = false;

// put both fighters back on their marks, honouring the "player side" setting
function resetPositions() {
  const f = settings.side === 'right' ? -1 : 1;
  player.resetTo(0, f);
  dummy.resetTo(2.3 * f, -f);
  detector.reset();
  movement.reset();
  electricPending = false;
}
hud.onSideChanged = resetPositions;
let drill = null; // { id, def, count, t, done }
let announceTimer = null;

function announce(text, ms = 1400) {
  const el = $('announce');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function showMenu(show) {
  $('menu').hidden = !show;
  if (show) mode = 'menu';
}

function startMode(id) {
  showMenu(false);
  $('help').hidden = true; $('settings').hidden = true;
  resetPositions();
  if (id === 'free') {
    mode = 'free'; drill = null;
    $('drill').hidden = true; $('stats').hidden = false;
    announce('FREE TRAINING');
  } else {
    const key = id.split(':')[1];
    mode = 'drill';
    drill = { id: key, def: DRILLS[key], count: 0, t: 0, done: false, lastKbd: -999, kbdChain: 0 };
    $('drill').hidden = false; $('stats').hidden = true;
    $('drill-title').textContent = drill.def.title;
    $('drill-desc').textContent = drill.def.desc;
    $('drill-best').textContent = settings.drills[key] ? `${settings.drills[key].toFixed(1)}s` : '–';
    updateDrillHud();
    announce(drill.def.title);
  }
}

function updateDrillHud() {
  if (!drill) return;
  $('drill-progress').textContent = `${drill.count} / ${drill.def.goal}`;
  $('drill-time').textContent = `${drill.t.toFixed(1)}s`;
}

function drillEvent(ev) {
  if (!drill || drill.done) return;
  const d = drill;
  if (d.id === 'electric10') {
    if (ev === 'EWGF') d.count++; else if (ev === 'WGF' || ev === 'FAIL') d.count = 0;
  } else if (d.id === 'wave5') {
    if (ev === 'EWGF' && movement.waveCount >= 3) d.count++;
  } else if (d.id === 'kbd') {
    if (ev === 'backdash') {
      d.kbdChain = movement.frame - d.lastKbd <= 22 ? d.kbdChain + 1 : 1;
      d.lastKbd = movement.frame;
      d.count = Math.max(d.count, d.kbdChain);
    }
  }
  updateDrillHud();
  if (d.count >= d.def.goal) {
    d.done = true;
    const best = settings.drills[d.id];
    if (!best || d.t < best) { settings.drills[d.id] = d.t; saveSettings(settings); $('drill-best').textContent = `${d.t.toFixed(1)}s`; }
    announce(`DRILL COMPLETE  ${d.t.toFixed(1)}s`, 3000);
    sfx.electric();
    setTimeout(() => showMenu(true), 3200);
  }
}

$('btn-resetpos').onclick = () => { resetPositions(); announce('RESET', 500); };
document.querySelectorAll('#menu [data-mode]').forEach((b) => (b.onclick = () => startMode(b.dataset.mode)));
$('btn-menu').onclick = () => showMenu(!$('menu').hidden ? false : true);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !input.capture && $('help').hidden && $('settings').hidden) showMenu($('menu').hidden);
});

// ---- events ----------------------------------------------------------------------
const tmp = new THREE.Vector3();
let lastBackdash = false;

let electricKind = 'EWGF'; // which electric variant the current attack is
const paletteFor = () => electricKind === 'PEWGF' ? Electric.PALETTES.gold : Electric.PALETTES.electric;

player.on('wgfStart', (name) => {
  setTimeout(() => {
    player.fistPosition('rFore', tmp);
    if (name === 'ewgf') {
      fx.burst(tmp, electricKind === 'PEWGF' ? 1.6 : 1.2, paletteFor());
      sfx.electric();
      view.shake(electricKind === 'PEWGF' ? 0.08 : 0.05);
    } else {
      fx.burst(tmp, 0.7, Electric.PALETTES.spark); // regular WGF still throws sparks off the fist
    }
  }, 90);
});

// mirror numpad directions so 6 is always "toward the dummy"
const MIRROR = { 1: 3, 2: 2, 3: 1, 4: 6, 5: 5, 6: 4, 7: 9, 8: 8, 9: 7 };

// ---- 60 Hz simulation ------------------------------------------------------------
const STATE_LABELS = { stand: '', walk: 'WALK', dash: 'DASH', backdash: 'BACKDASH', crouch: 'CROUCH', cd: 'CROUCH DASH', attack: '' };
let lastLabel = null;

function simTick() {
  const s = input.sample();
  const active = mode !== 'menu';

  // facing: always toward the dummy, with hysteresis
  const gap = dummy.x - player.x;
  if (Math.abs(gap) > 0.25) player.facing = Math.sign(gap);
  if (Math.abs(gap) > 0.25) dummy.facing = -player.facing;
  const dir = active ? (player.facing < 0 ? MIRROR[s.dir] : s.dir) : 5;
  const pressed = active ? s.pressed : { b1: false, b2: false, b3: false, b4: false };

  if (active && s.pressed.reset) { resetPositions(); announce('RESET', 500); }

  const result = detector.tick(dir, pressed.b2);
  if (active) { hud.pushInput({ dir, pressed }); hud.setProgress(detector.progress()); }

  if (result) {
    stats.add(result);
    if (stats.best > (settings.best || 0)) { settings.best = stats.best; saveSettings(settings); }
    hud.flash(result);
    hud.markLast(result.type);
    hud.updateStats(stats, detector.opts.lateWindow);
    drillEvent(result.type === 'PEWGF' ? 'EWGF' : result.type);
    if (result.type === 'FAIL') { sfx.buzz(); player.startAttack('jabR'); electricPending = false; }
    else { electricPending = result.type === 'EWGF' || result.type === 'PEWGF'; electricKind = result.type; player.startAttack(electricPending ? 'ewgf' : 'wgf'); }
  } else if (!player.busy) {
    if (pressed.b1) player.startAttack('jabL');
    else if (pressed.b2) player.startAttack('jabR');
    else if (pressed.b3) player.startAttack('kickL');
    else if (pressed.b4) player.startAttack('kickR');
  }

  const dx = movement.tick(dir, detector.enteredDf, player.busy);
  const ms = movement.state;
  if (ms === 'backdash' && !lastBackdash) drillEvent('backdash');
  lastBackdash = ms === 'backdash';

  player.control({
    vTarget: dx * 60 * player.facing,
    crouch: (ms === 'crouch' || ms === 'cd' || [1, 2, 3].includes(dir)) ? 1 : 0,
    lean: ms === 'cd' ? 1.6 : ms === 'dash' ? 1 : ms === 'backdash' ? -1 : [6, 9].includes(dir) ? 0.4 : [4, 7].includes(dir) ? -0.3 : 0,
    facing: player.facing,
    moving: dx * 60,
    blocking: !player.busy && (dir === 4 || dir === 1),
    state: ms,
  });
  dummy.control({ facing: dummy.facing });
  player.tick();
  dummy.tick();

  // hit detection for the player's current attack
  const a = player.attack;
  if (a && !a.hitDone && a.f >= a.def.active[0] && a.f <= a.def.active[1]) {
    player.fistPosition(a.def.limb, tmp);
    // hit volume: a sphere around the fist, stretched forward for the wind god fist so
    // it has Tekken-like reach without the character lunging across the stage
    const r = 0.62, ahead = a.def.heavy ? 0.9 : 0;
    let hit = false;
    for (const part of ['chest', 'head', 'hips']) {
      const p = dummy.bodies[part].position;
      let dx = (p.x - tmp.x) * player.facing;           // positive = in front of the fist
      if (dx > 0) dx = Math.max(0, dx - ahead);         // free reach in front
      if (Math.hypot(dx, tmp.y - p.y, tmp.z - p.z) < r) { hit = true; break; }
    }
    if (hit) {
      a.hitDone = true;
      const kind = dummy.takeHit(a.def, player.facing, false, a.name);
      if (a.def.electric) {
        fx.burst(tmp.set(dummy.bodies.chest.position.x, dummy.bodies.chest.position.y + 0.1, 0), electricKind === 'PEWGF' ? 2.2 : 1.7, paletteFor());
        view.shake(electricKind === 'PEWGF' ? 0.18 : 0.14);
      } else if (a.def.heavy) {
        fx.burst(tmp.set(dummy.bodies.chest.position.x, dummy.bodies.chest.position.y + 0.1, 0), 1.0, Electric.PALETTES.spark);
        sfx.thud(); view.shake(0.07);
      }
      else { sfx.thud(); view.shake(0.03); }
      if (kind === 'juggle') view.shake(0.05);
    }
  }

  // label
  let label = STATE_LABELS[ms];
  if (ms === 'cd' && movement.waveCount > 1) label = `WAVEDASH ×${movement.waveCount}`;
  if (label !== lastLabel) { lastLabel = label; $('mstate').textContent = label; $('mstate').classList.toggle('cd', ms === 'cd'); }

  // physics: two substeps with muscle forces applied each time
  for (let i = 0; i < 2; i++) {
    player.applyForces();
    dummy.applyForces();
    physics.substep();
  }

  // dummy housekeeping: bring it back in front when it wandered off
  if (!dummy.down) {
    const g2 = dummy.x - player.x;
    if (Math.abs(g2) > 5.5 || Math.abs(g2) < 0.5 || Math.abs(dummy.bodies.hips.position.z) > 1.2) {
      dummy.resetTo(player.x + 2.3 * (player.facing || 1), -(player.facing || 1));
    }
  }
  if (drill && !drill.done) drill.t += 1 / 60;
}

// ---- render loop -----------------------------------------------------------------
const STEP = 1000 / 60;
let last = performance.now();
let acc = 0;
let hudTimer = 0;

function frame(now) {
  const dtMs = Math.min(now - last, 250);
  last = now;
  acc += dtMs;
  let ticks = 0;
  while (acc >= STEP && ticks < 6) { simTick(); acc -= STEP; ticks++; }
  if (ticks === 6) acc = 0;

  const dt = dtMs / 1000;
  player.update(dt);
  dummy.update(dt);
  fx.update(dt);
  view.follow((player.x + dummy.x) / 2 - 0.9, dt, Math.abs(dummy.x - player.x));
  hud.setSource(input.lastSource, input.padName);
  hudTimer += dt;
  if (hudTimer > 0.1) { hudTimer = 0; if (drill && !drill.done) updateDrillHud(); }
  view.render(dt);
  lastFrameAt = performance.now();
  if (!rafPending) { rafPending = true; requestAnimationFrame(rafFrame); }
}
let rafPending = false;
let lastFrameAt = performance.now();
function rafFrame(now) { rafPending = false; frame(now); }
rafPending = true;
requestAnimationFrame(rafFrame);
// watchdog: if the browser stops delivering animation frames (throttled or occluded
// window), keep the 60 Hz simulation alive on a timer so inputs are never dropped
setInterval(() => { if (performance.now() - lastFrameAt > 90) frame(performance.now()); }, 30);
