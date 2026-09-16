import * as THREE from 'three';

// Blue lightning burst for the electric. Particles + jagged bolts + a point light.
export class Electric {
  static PALETTES = {
    spark:    { points: 0xffd9a0, lines: 0xfff3d0, light: 0xffb060, bolts: 3 },   // regular WGF: hot sparks
    electric: { points: 0x9ee8ff, lines: 0xbdf0ff, light: 0x5ee2ff, bolts: 7 },   // EWGF: blue lightning
    gold:     { points: 0xffd23c, lines: 0xfff2b0, light: 0xffb800, bolts: 9 },   // PEWGF: golden
  };

  constructor(scene) {
    this.scene = scene;
    this.N = 140;
    this.life = 0; this.maxLife = 0.45;
    this.origin = new THREE.Vector3();

    const pos = new Float32Array(this.N * 3);
    this.vel = new Float32Array(this.N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x9ee8ff, size: 0.045, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.maxBolts = 9; this.bolts = 7; this.segs = 8;
    const bpos = new Float32Array(this.maxBolts * this.segs * 2 * 3);
    const bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
    this.lines = new THREE.LineSegments(bgeo, new THREE.LineBasicMaterial({
      color: 0xbdf0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.lines.frustumCulled = false;
    scene.add(this.lines);

    this.light = new THREE.PointLight(0x5ee2ff, 0, 7, 1.5);
    scene.add(this.light);
    this.points.visible = this.lines.visible = false;
  }

  burst(origin, strength = 1, palette = Electric.PALETTES.electric) {
    this.points.material.color.set(palette.points);
    this.lines.material.color.set(palette.lines);
    this.light.color.set(palette.light);
    this.bolts = palette.bolts ?? 7;
    this.origin.copy(origin);
    this.life = this.maxLife;
    this.strength = strength;
    const p = this.points.geometry.attributes.position.array;
    for (let i = 0; i < this.N; i++) {
      p[i * 3] = origin.x; p[i * 3 + 1] = origin.y; p[i * 3 + 2] = origin.z;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
      const s = 1.5 + Math.random() * 4 * strength;
      this.vel[i * 3] = Math.sin(ph) * Math.cos(th) * s;
      this.vel[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * s + 1.5;
      this.vel[i * 3 + 2] = Math.cos(ph) * s;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.light.position.copy(origin);
    this.points.visible = this.lines.visible = true;
  }

  update(dt) {
    if (this.life <= 0) return;
    this.life -= dt;
    const k = Math.max(0, this.life / this.maxLife);
    if (this.life <= 0) {
      this.points.visible = this.lines.visible = false;
      this.light.intensity = 0;
      return;
    }
    // particles
    const p = this.points.geometry.attributes.position.array;
    for (let i = 0; i < this.N; i++) {
      p[i * 3] += this.vel[i * 3] * dt;
      p[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      p[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] -= 6 * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.material.opacity = k;

    // bolts: regenerated every frame so they flicker
    const b = this.lines.geometry.attributes.position.array;
    let w = 0;
    const reach = 0.55 * (0.4 + 0.6 * k) * this.strength;
    for (let i = 0; i < this.bolts; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize();
      let prev = this.origin.clone();
      for (let s = 0; s < this.segs; s++) {
        const next = prev.clone().addScaledVector(dir, reach / this.segs)
          .add(new THREE.Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12));
        b[w++] = prev.x; b[w++] = prev.y; b[w++] = prev.z;
        b[w++] = next.x; b[w++] = next.y; b[w++] = next.z;
        prev = next;
      }
    }
    for (; w < b.length; w++) b[w] = 0;
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.material.opacity = k > 0.35 ? (Math.random() > 0.2 ? 1 : 0.3) : k;
    this.light.intensity = 30 * k * this.strength;
  }
}
