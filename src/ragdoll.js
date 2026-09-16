import * as CANNON from 'cannon-es';
import * as THREE from 'three';

// Chunky, blocky ACTIVE ragdoll. There are no animations: every limb is a
// rigid body, joints are cone-twist constraints, and each joint has a PD
// "muscle" that torques the limb toward a target pose. A hover force on the
// hips keeps the body standing. A knock-down just turns the muscles off.
//
// Local frame: character faces +X, +Z is its right side. Positive rotation
// about Z swings a hanging limb forward.

const G = 13; // matches the world gravity
const DRIVE_HZ = 6.5;
const ZETA = 0.9;

// [x depth, y height, z width]
const SEGS = [
  { name: 'hips',   size: [0.30, 0.22, 0.44], pos: [0, 1.00, 0],  mass: 10, gain: 8 },
  { name: 'chest',  size: [0.32, 0.50, 0.52], pos: [0, 1.38, 0],  mass: 16, parent: 'hips',  joint: [0, 1.11, 0], cone: 0.5, twist: 0.4, gain: 5 },
  { name: 'head',   size: [0.34, 0.34, 0.34], pos: [0, 1.85, 0],  mass: 3,  parent: 'chest', joint: [0, 1.65, 0], cone: 0.6, twist: 0.6, gain: 1.5 },
  { name: 'lUpper', size: [0.16, 0.30, 0.16], pos: [0, 1.43, -0.36], mass: 2,   parent: 'chest',  joint: [0, 1.58, -0.36], cone: 3.0, twist: 1.0, gain: 2 },
  { name: 'lFore',  size: [0.15, 0.28, 0.15], pos: [0, 1.14, -0.36], mass: 1.5, parent: 'lUpper', joint: [0, 1.28, -0.36], cone: 2.5, twist: 0.4, gain: 2,
    extra: { size: [0.20, 0.20, 0.20], offset: [0, -0.22, 0] } },
  { name: 'rUpper', size: [0.16, 0.30, 0.16], pos: [0, 1.43, 0.36], mass: 2,   parent: 'chest',  joint: [0, 1.58, 0.36], cone: 3.0, twist: 1.0, gain: 2 },
  { name: 'rFore',  size: [0.15, 0.28, 0.15], pos: [0, 1.14, 0.36], mass: 1.5, parent: 'rUpper', joint: [0, 1.28, 0.36], cone: 2.5, twist: 0.4, gain: 2,
    extra: { size: [0.20, 0.20, 0.20], offset: [0, -0.22, 0] } },
  { name: 'lThigh', size: [0.20, 0.40, 0.20], pos: [0, 0.69, -0.13], mass: 5, parent: 'hips',   joint: [0, 0.89, -0.13], cone: 2.2, twist: 1.6, gain: 2.5 },
  { name: 'lShin',  size: [0.18, 0.40, 0.18], pos: [0, 0.29, -0.13], mass: 3, parent: 'lThigh', joint: [0, 0.49, -0.13], cone: 2.2, twist: 2.4, gain: 2,
    extra: { size: [0.28, 0.10, 0.20], offset: [0.05, -0.24, 0] } },
  { name: 'rThigh', size: [0.20, 0.40, 0.20], pos: [0, 0.69, 0.13],  mass: 5, parent: 'hips',   joint: [0, 0.89, 0.13],  cone: 2.2, twist: 1.6, gain: 2.5 },
  { name: 'rShin',  size: [0.18, 0.40, 0.18], pos: [0, 0.29, 0.13],  mass: 3, parent: 'rThigh', joint: [0, 0.49, 0.13],  cone: 2.2, twist: 2.4, gain: 2,
    extra: { size: [0.28, 0.10, 0.20], offset: [0.05, -0.24, 0] } },
];

// attack definitions (frames at 60 Hz): active window, total recovery, knockback [x, y]
export const ATTACKS = {
  jabL: { limb: 'lFore', height: 'h', active: [6, 12], total: 17, kb: [1.6, 0.6], heavy: false },
  jabR: { limb: 'rFore', height: 'h', active: [6, 12], total: 17, kb: [1.6, 0.6], heavy: false },
  kickL: { limb: 'lShin', height: 'm', active: [10, 17], total: 28, kb: [3.0, 1.4], heavy: false },
  kickR: { limb: 'rShin', height: 'm', active: [10, 17], total: 28, kb: [3.0, 1.4], heavy: false },
  wgf: { limb: 'rFore', height: 'm', active: [11, 16], total: 30, kb: [1.3, 4.4], heavy: true },
  ewgf: { limb: 'rFore', height: 'm', active: [11, 16], total: 30, kb: [1.6, 5.2], heavy: true, electric: true },
};

const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

function eulerQ(z = 0, x = 0, y = 0) {
  const q = new CANNON.Quaternion();
  q.setFromEuler(x, y, z, 'XYZ');
  return q;
}

export class ActiveRagdoll {
  constructor(physics, scene, { x = 0, facing = 1, tone = 0xe6e6ea, group = 2, mask = 1 | 4, hair = null } = {}) {
    this.physics = physics;
    this.scene = scene;
    this.facing = facing;
    this.bodies = {};
    this.visuals = {};
    this.defs = {};
    this.gains = {};
    this.constraints = [];
    this.totalMass = 0;
    this.group = new THREE.Group();
    scene.add(this.group);

    const mat = new THREE.MeshStandardMaterial({ color: tone, roughness: 0.6, metalness: 0.05 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.7 });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x0b0b0d });
    this.materials = [mat, dark];

    const addBox = (parent, size, offset, m = mat) => {
      const geo = new THREE.BoxGeometry(...size);
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(...offset);
      mesh.castShadow = true;
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
      parent.add(mesh);
      return mesh;
    };

    const yawQ = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 1, 0), facing > 0 ? 0 : Math.PI);

    for (const s of SEGS) {
      const body = new CANNON.Body({
        mass: s.mass, material: physics.mat,
        linearDamping: 0.1, angularDamping: 0.8,
        collisionFilterGroup: group, collisionFilterMask: mask,
      });
      body.addShape(new CANNON.Box(new CANNON.Vec3(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2)));
      if (s.extra) {
        body.addShape(new CANNON.Box(new CANNON.Vec3(s.extra.size[0] / 2, s.extra.size[1] / 2, s.extra.size[2] / 2)),
          new CANNON.Vec3(...s.extra.offset));
      }
      body.position.set(x + s.pos[0] * facing, s.pos[1], s.pos[2] * facing);
      body.quaternion.copy(yawQ);
      body.updateMassProperties();
      physics.world.addBody(body);
      this.bodies[s.name] = body;
      this.defs[s.name] = s;
      this.totalMass += s.mass;
      this.fullMask = mask;

      // PD gains from the body's own inertia, capped so the explicit torque
      // integration at 1/120 s stays stable: w*dt <= ~0.4, and 2*zeta*w*dt <= ~0.5
      const I = Math.max(body.inertia.x, body.inertia.y, body.inertia.z);
      const w = Math.min(2 * Math.PI * DRIVE_HZ * Math.sqrt(s.gain), 62);
      const zeta = Math.min(ZETA, 34 / w);
      const kp = I * w * w;
      this.gains[s.name] = { kp, kd: 2 * zeta * w * I, max: kp * 1.5 };

      const g = new THREE.Group();
      addBox(g, s.size, [0, 0, 0]);
      if (s.extra) addBox(g, s.extra.size, s.extra.offset, s.name.endsWith('Shin') ? dark : mat);
      if (s.name === 'head') {
        addBox(g, [0.03, 0.06, 0.06], [0.17, 0.03, -0.08], dark);
        addBox(g, [0.03, 0.06, 0.06], [0.17, 0.03, 0.08], dark);
        if (hair) this.addHair(g, hair, addBox);
      }
      if (s.name === 'hips') addBox(g, [0.31, 0.06, 0.45], [0, 0.09, 0], dark);
      this.group.add(g);
      this.visuals[s.name] = g;
    }

    const up = new CANNON.Vec3(0, 1, 0);
    for (const s of SEGS) {
      if (!s.parent) continue;
      const A = this.bodies[s.parent], B = this.bodies[s.name];
      const jp = new CANNON.Vec3(x + s.joint[0] * facing, s.joint[1], s.joint[2] * facing);
      const c = new CANNON.ConeTwistConstraint(A, B, {
        pivotA: A.pointToLocalFrame(jp), pivotB: B.pointToLocalFrame(jp),
        axisA: A.vectorToLocalFrame(up), axisB: B.vectorToLocalFrame(up),
        angle: s.cone, twistAngle: s.twist, collideConnected: false,
      });
      physics.world.addConstraint(c);
      this.constraints.push(c);
      (this.pivots ||= {})[s.name] = c.pivotA; // joint pivot in the parent's local frame
    }

    // control state
    this.vTarget = 0;         // desired horizontal speed (m/s), in world x
    this.crouchTarget = 0;
    this.crouch = 0;
    this.lean = 0;
    this.leanTarget = 0;
    this.gait = 0;
    this.moving = 0;
    this.limp = 0;            // seconds of being knocked out
    this.weak = 1;            // muscle strength multiplier (flinch)
    this.weakTimer = 0;
    this.stun = 0;            // frames unable to act
    this.attack = null;
    this.blocking = false;
    this.targets = {};
    this.hoverHeight = 1.0;
    this.listeners = {};
  }

  // Bootleg Mishima haircuts, built from blocks on the head (local: +X forward, +Z right,
  // head is a 0.34 cube centred on the origin, so the top is y = 0.17 and the face x = 0.17).
  addHair(head, style, addBox) {
    const tilted = (pos, rotZ, rotX = 0) => {
      const grp = new THREE.Group();
      grp.position.set(...pos);
      grp.rotation.set(rotX, 0, rotZ);
      head.add(grp);
      return grp;
    };
    if (style === 'kazuya') {
      const black = new THREE.MeshStandardMaterial({ color: 0x101014, roughness: 0.55 });
      addBox(head, [0.37, 0.07, 0.37], [-0.01, 0.19, 0], black);              // cap
      addBox(head, [0.08, 0.05, 0.12], [0.16, 0.17, 0], black);              // widow's peak
      addBox(head, [0.06, 0.16, 0.06], [0.14, 0.11, -0.16], black);          // sideburns
      addBox(head, [0.06, 0.16, 0.06], [0.14, 0.11, 0.16], black);
      addBox(head, [0.06, 0.20, 0.36], [-0.17, 0.02, 0], black);             // back
      // spikes: base x, base z, height, backward tilt (rad)
      const spikes = [[0.07, 0, 0.16, 0.35], [-0.02, -0.1, 0.20, 0.55], [-0.02, 0.1, 0.20, 0.55],
        [-0.11, 0, 0.30, 0.8], [-0.15, -0.09, 0.24, 1.0], [-0.15, 0.09, 0.24, 1.0], [0.0, 0, 0.24, 0.45]];
      for (const [sx, sz, h, tilt] of spikes) {
        const grp = tilted([sx, 0.2, sz], tilt);
        addBox(grp, [0.09, h, 0.09], [0, h / 2, 0], black);
      }
      addBox(head, [0.03, 0.03, 0.09], [0.17, 0.085, -0.08], black);          // heavy brows
      addBox(head, [0.03, 0.03, 0.09], [0.17, 0.085, 0.08], black);
    } else if (style === 'heihachi') {
      const grey = new THREE.MeshStandardMaterial({ color: 0xbfc2c6, roughness: 0.6 });
      // bald on top; side wings sweep up and out to a point
      for (const side of [-1, 1]) {
        const base = tilted([-0.03, 0.08, 0.17 * side], 0.25, 0.6 * side);   // flare outward
        addBox(base, [0.22, 0.30, 0.07], [0, 0.15, 0], grey);
        const tip = tilted([0, 0.30, 0], 0.1, 0.4 * side);
        base.add(tip);
        addBox(tip, [0.12, 0.16, 0.05], [0, 0.08, 0], grey);
      }
      addBox(head, [0.10, 0.14, 0.36], [-0.16, 0.0, 0], grey);               // hair around the back
      addBox(head, [0.04, 0.03, 0.15], [0.17, -0.04, 0], grey);              // moustache
      addBox(head, [0.03, 0.035, 0.10], [0.17, 0.09, -0.08], grey);          // bushy brows
      addBox(head, [0.03, 0.035, 0.10], [0.17, 0.09, 0.08], grey);
    }
  }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, ...a) { for (const fn of this.listeners[ev] || []) fn(...a); }

  get x() { return this.bodies.hips.position.x; }
  get y() { return this.bodies.hips.position.y; }
  get down() { return this.limp > 0 || !!this.juggle; }
  get busy() { return !!this.attack || this.stun > 0 || this.limp > 0 || !!this.juggle; }

  // Tekken-style juggle: the launched body floats on its back, feet toward the attacker,
  // on a slow analytic arc; each hit bumps it up and pushes it back, until it lands.
  startJuggle(dirX, vy) {
    this.juggle = { y: Math.max(this.y, 0.95), vy, vx: dirX * 1.5, dirX, hits: 1 };
    this.limp = 0; this.attack = null; this.stun = 0;
    this.flash(0.15);
  }

  fistPosition(limb, out = new THREE.Vector3()) {
    const b = this.bodies[limb];
    const d = this.defs[limb];
    const p = d.extra ? b.pointToWorldFrame(new CANNON.Vec3(...d.extra.offset)) : b.position;
    return out.set(p.x, p.y, p.z);
  }

  // hard reset to the rest pose at x
  resetTo(x, facing = this.facing) {
    this.facing = facing;
    const yawQ = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 1, 0), facing > 0 ? 0 : Math.PI);
    for (const s of SEGS) {
      const b = this.bodies[s.name];
      b.position.set(x + s.pos[0] * facing, s.pos[1], s.pos[2] * facing);
      b.quaternion.copy(yawQ);
      b.velocity.setZero(); b.angularVelocity.setZero();
      b.force.setZero(); b.torque.setZero();
    }
    this.limp = 0; this.weak = 1; this.weakTimer = 0; this.stun = 0; this.attack = null; this.juggle = null;
    this.crouch = 0; this.lean = 0; this.vTarget = 0; this.anchorX = x;
  }

  translate(dx) { for (const b of Object.values(this.bodies)) b.position.x += dx; }

  startAttack(name) {
    if (this.busy) return false;
    this.attack = { name, def: ATTACKS[name], f: 0, hitDone: false };
    if (name === 'wgf' || name === 'ewgf') this.emit('wgfStart', name);
    return true;
  }

  // called by the game when one of this fighter's attacks connects / is blocked
  takeHit(def, dirX, blocked, attackerName) {
    const vx = def.kb[0] * dirX, vy = def.kb[1];
    if (this.juggle) {
      // juggle hit: a bump up and a push away, more for launchers
      const j = this.juggle;
      // launchers reset the arc (same height every time, so a loop looks identical each rep);
      // light hits just bump. Push-away is small: about one WGF step, so the next electric reaches.
      if (def.heavy) { j.vy = 3.0; j.y = Math.min(j.y, 1.6); } else { j.vy = Math.max(j.vy, 0.4) + 1.4; }
      j.vx = dirX * (def.heavy ? 0.95 : 0.6);
      j.dirX = dirX;
      j.hits++;
      this.flash();
      return 'juggle';
    }
    if (this.limp > 0) {
      this.impulseAll(vx * 0.8, vy * 0.9, 0);
      this.limp = Math.max(this.limp, 1.2);
      this.flash();
      return 'juggle';
    }
    if (blocked) {
      this.impulseAll(vx * 0.35, 0, 0);
      this.weaken(0.6, 8);
      this.stun = 6;
      return 'block';
    }
    this.attack = null;
    this.flash();
    if (def.heavy) {
      this.startJuggle(dirX, vy * 0.65);
      return 'launch';
    }
    this.impulseAll(vx * 0.5, vy * 0.3, 0);
    this.weaken(0.2, 14);
    this.stun = 14;
    return 'hit';
  }

  impulseAll(vx, vy, vz) {
    for (const b of Object.values(this.bodies)) {
      b.wakeUp();
      b.applyImpulse(new CANNON.Vec3(vx * b.mass, vy * b.mass, vz * b.mass), new CANNON.Vec3());
    }
  }

  weaken(factor, frames) { this.weak = Math.min(this.weak, factor); this.weakTimer = Math.max(this.weakTimer, frames); }
  flash() { this.hitFlash = 0.12; }

  // ---- per simulation frame (60 Hz) ----
  control({ vTarget = 0, crouch = 0, lean = 0, facing = this.facing, moving = 0, blocking = false, state = 'stand' }) {
    this.vTarget = vTarget; this.crouchTarget = crouch; this.leanTarget = lean;
    this.facing = facing; this.moving = moving; this.blocking = blocking; this.moveState = state;
  }

  tick() {
    if (this.stun > 0) this.stun--;
    if (this.juggle) {
      const j = this.juggle, dt = 1 / 60;
      j.vy -= 6.0 * dt;               // juggle gravity: quicker than the first version, still floaty
      j.y += j.vy * dt;
      j.vx *= 0.965;
      if (j.y < 0.5 && j.vy < 0) {
        // lands: goes limp on the floor for a moment, then gets back up
        this.juggle = null;
        this.limp = 1.1;
        this.impulseAll(j.vx * 0.5, -1.0, 0);
        this.emit('juggleEnd', j.hits);
      }
    }
    if (this.weakTimer > 0) { this.weakTimer--; if (this.weakTimer === 0) this.weak = 1; }
    if (this.attack) {
      const a = this.attack;
      a.f++;
      if ((a.name === 'wgf' || a.name === 'ewgf') && a.f === 4) {
        // the lunge: hop forward and up
        this.impulseAll(0, 2.2, 0); // the hop; the forward step is a velocity profile in applyForces
      }
      if (a.f >= a.def.total) this.attack = null;
    }
    this.crouch += (this.crouchTarget - this.crouch) * 0.5;
    this.lean += (this.leanTarget - this.lean) * 0.45;
    // stride phase advances with distance travelled (about a 0.7 m stride), backwards reverses it
    // stride phase advances with distance: a 0.4 rad swing on a 0.9 m leg is a 0.72 m step,
    // so one full cycle (two steps) is 1.44 m -> 2π / 1.44 / 60 = 0.073 rad per frame per m/s
    if (Math.abs(this.moving) > 0.05) this.gait += this.moving * 0.073 * (this.moveState === 'dash' || this.moveState === 'run' ? 1.25 : 1); // moving is relative to facing
    else this.gait += (Math.round(this.gait / Math.PI) * Math.PI - this.gait) * 0.3; // settle feet together
    this.computeTargets();
  }

  computeTargets() {
    const T = this.targets;
    const c = this.crouch, lean = this.lean;
    const speed = Math.abs(this.moving);
    const walk = Math.min(1, speed / 0.6);            // 0 = standing, 1 = full walk cycle
    const phi = this.gait;

    // --- walk cycle: legs alternate, knee lifts during the swing, arms counter-swing ---
    const A = (this.moveState === 'dash' || this.moveState === 'run' ? 0.58 : 0.4) * walk;
    const legL = Math.sin(phi), legR = Math.sin(phi + Math.PI);
    const liftL = Math.max(0, Math.cos(phi)) * walk, liftR = Math.max(0, Math.cos(phi + Math.PI)) * walk;
    const bob = -Math.abs(Math.sin(phi)) * 0.05 * walk; // dips at mid-stride, weight visibly transfers

    // --- stance / crouch (feet computed to stay flat on the floor) ---
    const thighStandL = 0.18, thighStandR = -0.12, kneeStand = -0.28;
    const thighCrouch = 1.1, kneeCrouch = -2.0;

    T.chest = eulerQ(-(0.06 + 0.45 * c + 0.14 * lean), 0, 0);
    T.head = eulerQ(0.12 + 0.35 * c, 0, 0);
    T.lUpper = eulerQ(0.08 - 0.45 * legL * walk, 0.14, 0);   // arms hang relaxed, swing only while walking
    T.rUpper = eulerQ(0.08 - 0.45 * legR * walk, -0.14, 0);
    T.lFore = eulerQ(0.25 + 0.3 * walk, 0, 0);
    T.rFore = eulerQ(0.25 + 0.3 * walk, 0, 0);
    T.lThigh = eulerQ(lerp(thighStandL, thighCrouch, c) + A * legL, 0, 0);
    T.rThigh = eulerQ(lerp(thighStandR, thighCrouch, c) + A * legR, 0, 0);
    T.lShin = eulerQ(lerp(kneeStand, kneeCrouch, c) - 0.9 * liftL * (1 - c), 0, 0);
    T.rShin = eulerQ(lerp(kneeStand, kneeCrouch, c) - 0.9 * liftR * (1 - c), 0, 0);
    this.hoverHeight = lerp(1.0, 0.60, c) + bob;

    // --- movement-state poses ---
    const st = this.moveState;
    if (st === 'cd') {
      // crouch dash: low lunge, front leg driving, back leg trailing, torso pitched forward
      T.lThigh = eulerQ(1.3, 0, 0); T.lShin = eulerQ(-1.1, 0, 0);
      T.rThigh = eulerQ(0.35, 0, 0); T.rShin = eulerQ(-1.75, 0, 0);
      T.chest = eulerQ(-0.75, 0, 0); T.head = eulerQ(0.55, 0, 0);
      T.lUpper = eulerQ(0.2, 0.25, 0); T.lFore = eulerQ(1.9, 0, 0);
      T.rUpper = eulerQ(-0.4, -0.25, 0); T.rFore = eulerQ(1.6, 0, 0);
      this.hoverHeight = 0.62;
    } else if (st === 'dash' || st === 'run') {
      T.chest = eulerQ(st === 'run' ? -0.4 : -0.32, 0, 0); T.head = eulerQ(0.3, 0, 0);
      // pumping arms while running
      if (st === 'run') { T.lUpper = eulerQ(0.3 - 0.7 * legL, 0.2, 0); T.rUpper = eulerQ(0.3 - 0.7 * legR, -0.2, 0); T.lFore = eulerQ(1.4, 0, 0); T.rFore = eulerQ(1.4, 0, 0); }
      this.hoverHeight += -0.04;
    } else if (st === 'backdash') {
      // hop back: legs tucked together, torso leaning away
      T.lThigh = eulerQ(0.55, 0, 0); T.lShin = eulerQ(-1.0, 0, 0);
      T.rThigh = eulerQ(0.45, 0, 0); T.rShin = eulerQ(-1.1, 0, 0);
      T.chest = eulerQ(0.22, 0, 0); T.head = eulerQ(-0.1, 0, 0);
      T.lUpper = eulerQ(0.5, 0.2, 0); T.rUpper = eulerQ(0.4, -0.2, 0); T.lFore = eulerQ(1.2, 0, 0); T.rFore = eulerQ(1.2, 0, 0);
      this.hoverHeight = 1.06;
    }

    if (this.blocking) {
      T.lUpper = eulerQ(1.0, 0.1, 0); T.lFore = eulerQ(2.1, 0, 0);
      T.rUpper = eulerQ(0.9, -0.1, 0); T.rFore = eulerQ(2.1, 0, 0);
    }

    if (this.juggle) {
      // floating on the back: legs out toward the attacker, arms flung out, head back
      T.chest = eulerQ(0.15, 0, 0);
      T.head = eulerQ(-0.35, 0, 0);
      T.lUpper = eulerQ(0.4, 1.1, 0); T.rUpper = eulerQ(0.4, -1.1, 0);
      T.lFore = eulerQ(0.5, 0, 0); T.rFore = eulerQ(0.5, 0, 0);
      T.lThigh = eulerQ(0.25, 0.15, 0); T.rThigh = eulerQ(0.1, -0.15, 0);
      T.lShin = eulerQ(-0.35, 0, 0); T.rShin = eulerQ(-0.25, 0, 0);
      this.hoverHeight = this.juggle.y;
      this.motorLimbs = null;
      return;
    }

    const a = this.attack;
    this.motorLimbs = null;
    if (a) {
      const f = a.f, d = a.def;
      // the striking limb is motor-driven so it actually reaches the pose in a few frames
      this.motorLimbs = a.name === 'jabL' ? ['lUpper', 'lFore'] : a.name === 'jabR' ? ['rUpper', 'rFore']
        : a.name === 'kickL' ? ['lThigh'] : a.name === 'kickR' ? ['rThigh'] : ['rUpper', 'rFore'];
      if (a.name.startsWith('jab')) {
        const side = a.name === 'jabL' ? 'l' : 'r';
        const ext = f < 5 ? smooth(f / 5) : f < 11 ? 1 : 1 - smooth((f - 11) / 6);
        T[side + 'Upper'] = eulerQ(lerp(0.1, 1.55, ext), (side === 'l' ? 0.14 : -0.14) * (1 - ext), 0);
        T[side + 'Fore'] = eulerQ(lerp(0.3, 0.1, ext), 0, 0);
        T.chest = eulerQ(-0.1, 0, (side === 'r' ? 0.45 : -0.45) * ext);
      } else if (a.name.startsWith('kick')) {
        const side = a.name === 'kickL' ? 'l' : 'r';
        const ext = f < 9 ? smooth(f / 9) : f < 16 ? 1 : 1 - smooth((f - 16) / 12);
        T[side + 'Thigh'] = eulerQ(lerp(0.1, 1.5, ext), 0, 0);
        T[side + 'Shin'] = eulerQ(lerp(-0.3, -0.05, ext), 0, 0);
        T.chest = eulerQ(0.25 * ext, 0, 0);
        this.hoverHeight = 1.0 + 0.05 * ext;
      } else {
        // wind god fist: crouch wind-up, then a rising right uppercut
        const wind = f < 4 ? smooth(f / 4) : f < 10 ? 1 - smooth((f - 4) / 6) : 0;
        const rise = f < 4 ? 0 : f < 11 ? smooth((f - 4) / 7) : f < 18 ? 1 : 1 - smooth((f - 18) / 12);
        T.rUpper = eulerQ(lerp(lerp(0.1, -0.7, wind), 2.8, rise), -0.15 * (1 - rise), 0);
        T.rFore = eulerQ(lerp(lerp(0.3, 0.7, wind), 0.4, rise), 0, 0);
        T.lUpper = eulerQ(lerp(0.1, 0.9, wind), 0.2, 0); T.lFore = eulerQ(lerp(0.3, 1.4, wind), 0, 0);
        T.chest = eulerQ(-(0.45 * wind) + 0.15 * rise, 0, -0.5 * wind + 0.55 * rise);
        T.head = eulerQ(0.3 * rise, 0, 0);
        this.hoverHeight = lerp(lerp(1.0, 0.62, wind), 1.15, rise * (1 - smooth((f - 16) / 14)));
      }
    }
  }

  // ---- physics substep forces ----
  applyForces() {
    const hips = this.bodies.hips;
    const M = this.totalMass;
    const alive = this.limp <= 0;
    // While standing, the legs are owned entirely by their motors: they do not collide
    // with the floor, so no contact can shove a foot sideways or lift the stance.
    // Knocked down, everything collides again so the body can lie on the ground.
    if (alive !== this.legsFree) {
      this.legsFree = alive;
      for (const n of ['lThigh', 'lShin', 'rThigh', 'rShin']) {
        this.bodies[n].collisionFilterMask = alive ? (this.fullMask & ~1) : this.fullMask;
      }
    }
    const strength = alive ? this.weak : 0.04;

    if (alive) {
      // Root motor: the hips and chest are steered by blending their velocity
      // toward a target every substep. This is unconditionally stable and is
      // what keeps the character standing; everything hanging off it is
      // ordinary torque-driven physics.
      const b = Math.min(1, strength);
      const v = hips.velocity;
      // never let a foot go under the floor: raise the hover target by the deepest penetration
      let sink = 0;
      for (const n of ['lShin', 'rShin']) {
        const fy = this.bodies[n].pointToWorldFrame(new CANNON.Vec3(0.05, -0.29, 0)).y;
        if (fy < sink) sink = fy;
      }
      const vyT = (this.hoverHeight - sink - hips.position.y) * 22;
      v.y += (vyT - v.y) * 0.7 * b;
      const lunging = this.attack && (this.attack.name === 'wgf' || this.attack.name === 'ewgf') && this.attack.f < 20;
      if (this.anchorX === undefined || lunging || this.weak < 1) this.anchorX = hips.position.x;
      if (this.juggle) {
        v.x += (this.juggle.vx - v.x) * 0.4;
        this.anchorX = hips.position.x;
      } else if (lunging) {
        // wind god fist step: a short, fixed push for the first 10 frames, then hold
        const step = this.attack.f < 10 ? 2.2 * this.facing : 0;
        v.x += (step - v.x) * 0.55;
        this.anchorX = hips.position.x;
      } else {
        // position-anchored root: no slow drift, and movement stops dead when input stops
        const vT = this.attack ? 0 : this.vTarget;
        this.anchorX += vT / 120;
        const vx = vT + (this.anchorX - hips.position.x) * 12;
        v.x += (vx - v.x) * 0.55 * b;
      }
      v.z += (-hips.position.z * 8 - v.z) * 0.3 * b;
      // the chest is carried along too, otherwise the joint solver dilutes the root motion
      const cv = this.bodies.chest.velocity;
      cv.y += (vyT - cv.y) * 0.5 * b;
      cv.x += (v.x - cv.x) * 0.35 * b;
      cv.z += (v.z - cv.z) * 0.2 * b;

      const yaw = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 1, 0), this.facing > 0 ? 0 : Math.PI);
      // juggling: lie flat on the back with the feet toward the attacker (local -Y swings to local +X,
      // which is the direction this character faces, i.e. toward whoever launched it)
      const hipsTarget = this.juggle
        ? yaw.mult(eulerQ(Math.PI / 2 - 0.15, 0, 0))
        : yaw.mult(eulerQ(-(0.1 * this.crouch + 0.15 * this.lean), 0, 0));
      this.motorTo(hips, hipsTarget, 26, 0.7 * b);
      const chestTarget = (this.juggle ? hipsTarget : yaw).mult(this.targets.chest);
      this.motorTo(this.bodies.chest, chestTarget, 20, 0.5 * b);
    }

    for (const s of SEGS) {
      if (!s.parent) continue;
      const child = this.bodies[s.name], parent = this.bodies[s.parent];
      const tw = parent.quaternion.mult(this.targets[s.name]);
      if (!alive) { this.driveTo(child, parent, tw, this.gains[s.name], strength); continue; }
      // every joint is motor-driven while the character is up: poses are crisp and
      // animation-like, but still bodies that collide, get shoved and go limp.
      const striking = this.motorLimbs && this.motorLimbs.includes(s.name);
      const leg = s.name.endsWith('Thigh') || s.name.endsWith('Shin');
      // legs are the base of the stance, so they get the stiffest motors
      const rate = striking ? 36 : leg ? 34 : 28;
      const blend = striking ? 0.8 : leg ? 0.78 : 0.6;
      this.motorTo(child, tw, rate, blend * Math.min(1, strength), parent, this.pivots[s.name]);
    }
  }

  // rotation error between body and target as an axis*angle vector (world frame)
  static errorVec(body, targetQ, out) {
    const err = targetQ.mult(body.quaternion.inverse());
    err.normalize();
    if (err.w < 0) { err.x = -err.x; err.y = -err.y; err.z = -err.z; err.w = -err.w; }
    const angle = 2 * Math.acos(Math.min(1, err.w));
    if (angle > 1e-4) {
      const s = Math.sin(angle / 2);
      out.set(err.x / s * angle, err.y / s * angle, err.z / s * angle);
    } else out.set(0, 0, 0);
    return out;
  }

  // velocity-blend motor for root bodies
  motorTo(body, targetQ, rate, blend, parent = null, pivotLocal = null) {
    const e = ActiveRagdoll.errorVec(body, targetQ, new CANNON.Vec3());
    const max = 34;
    let wx = e.x * rate, wy = e.y * rate, wz = e.z * rate;
    const m = Math.hypot(wx, wy, wz);
    if (m > max) { wx *= max / m; wy *= max / m; wz *= max / m; }
    if (parent) { wx += parent.angularVelocity.x; wy += parent.angularVelocity.y; wz += parent.angularVelocity.z; }
    const w = body.angularVelocity;
    w.x += (wx - w.x) * blend; w.y += (wy - w.y) * blend; w.z += (wz - w.z) * blend;
    if (parent && pivotLocal) {
      // make the linear velocity consistent with rotating about the joint pivot,
      // otherwise the joint solver cancels most of the angular change
      const pw = parent.pointToWorldFrame(pivotLocal);
      const pv = parent.velocity.vadd(parent.angularVelocity.cross(pw.vsub(parent.position)));
      const r = body.position.vsub(pw);
      const vt = pv.vadd(w.cross(r));
      const v = body.velocity;
      v.x += (vt.x - v.x) * blend; v.y += (vt.y - v.y) * blend; v.z += (vt.z - v.z) * blend;
    }
  }

  // torque PD muscle for limbs
  driveTo(body, parent, targetQ, gain, strength) {
    const e = ActiveRagdoll.errorVec(body, targetQ, new CANNON.Vec3());
    const pw = parent ? parent.angularVelocity : new CANNON.Vec3();
    const kp = gain.kp * strength, kd = gain.kd * Math.max(strength, 0.4);
    let tx = kp * e.x - kd * (body.angularVelocity.x - pw.x);
    let ty = kp * e.y - kd * (body.angularVelocity.y - pw.y);
    let tz = kp * e.z - kd * (body.angularVelocity.z - pw.z);
    const mag = Math.hypot(tx, ty, tz), max = gain.max * Math.max(strength, 0.05);
    if (mag > max) { const k = max / mag; tx *= k; ty *= k; tz *= k; }
    body.applyTorque(new CANNON.Vec3(tx, ty, tz));
    if (parent) parent.applyTorque(new CANNON.Vec3(-tx * 0.3, -ty * 0.3, -tz * 0.3));
  }

  // ---- render frame ----
  update(dt) {
    if (this.limp > 0) this.limp -= dt;
    for (const [name, b] of Object.entries(this.bodies)) {
      const v = this.visuals[name];
      v.position.set(b.position.x, b.position.y, b.position.z);
      v.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    }
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      const k = Math.max(0, this.hitFlash) * 5;
      this.materials[0].emissive.setRGB(k, k, k);
    } else this.materials[0].emissive.setRGB(0, 0, 0);
  }

  dispose() {
    for (const c of this.constraints) this.physics.world.removeConstraint(c);
    for (const b of Object.values(this.bodies)) this.physics.world.removeBody(b);
    this.scene.remove(this.group);
  }
}
