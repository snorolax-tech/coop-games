// Visual effects: instanced particles, fires, puddle, chicken. Purely visual — used by host and client.
import * as THREE from 'three';

const PARTICLE_KINDS = {
  foam:     { color: [0xffffff, 0xe8f7ff], g: -3, drag: 1.5, life: [0.6, 1.1], size: [0.06, 0.12], grow: 2.2 },
  smoke:    { color: [0x8d8d8d, 0xb0b0b0, 0x6e6e6e], g: 1.2, drag: 1.0, life: [1.0, 1.8], size: [0.05, 0.1], grow: 2.2 },
  steam:    { color: [0xf0f0f0, 0xffffff], g: 0.8, drag: 1.0, life: [0.8, 1.4], size: [0.04, 0.08], grow: 2.5 },
  ember:    { color: [0xff9f1c, 0xffd60a], g: 1.5, drag: 0.5, life: [0.4, 0.9], size: [0.02, 0.04], grow: -0.8 },
  confetti: { color: [0xff006e, 0xffbe0b, 0x3a86ff, 0x8338ec, 0x06d6a0], g: -5, drag: 1.2, life: [1.2, 2.0], size: [0.03, 0.05], grow: 0 },
  water:    { color: [0x6ecbff, 0x48cae4], g: -9, drag: 0.2, life: [0.5, 0.9], size: [0.025, 0.05], grow: 0 },
  crumbs:   { color: [0xe9a64b, 0x70c040, 0xe63946], g: -9, drag: 0.3, life: [0.6, 1.0], size: [0.02, 0.04], grow: 0 },
  dust:     { color: [0xd9c8a9, 0xbfae8f], g: 0.3, drag: 2, life: [0.6, 1.2], size: [0.05, 0.1], grow: 1.5 },
  stars:    { color: [0xffd60a, 0xfff3b0, 0xffffff], g: 0.5, drag: 2.2, life: [0.8, 1.3], size: [0.035, 0.06], grow: 0 },
  feather:  { color: [0xffffff, 0xf8f9fa], g: -1, drag: 2.5, life: [1.0, 1.8], size: [0.03, 0.05], grow: 0 },
};

const rnd = (a, b) => a + Math.random() * (b - a);

export class Particles {
  constructor(scene, max = 900) {
    this.max = max;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.list = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
    // init instanceColor
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, this._c.set(0xffffff));
  }
  spawn(kind, pos, vel, opts = {}) {
    if (this.list.length >= this.max) this.list.shift();
    const k = PARTICLE_KINDS[kind];
    const life = rnd(...k.life) * (opts.life || 1);
    this.list.push({
      k, p: new THREE.Vector3().copy(pos), v: new THREE.Vector3().copy(vel), life, max: life,
      size: rnd(...k.size) * (opts.size || 1), color: k.color[(Math.random() * k.color.length) | 0],
      rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0),
    });
  }
  burst(kind, pos, n = 12, speed = 2, opts = {}) {
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.set(rnd(-1, 1), rnd(0.2, 1.2), rnd(-1, 1)).normalize().multiplyScalar(speed * rnd(0.4, 1));
      if (opts.up) v.y = Math.abs(v.y) + opts.up;
      this.spawn(kind, pos, v, opts);
    }
  }
  update(dt) {
    let n = 0;
    const alive = [];
    for (const p of this.list) {
      p.life -= dt; if (p.life <= 0) continue;
      p.v.y += p.k.g * dt;
      p.v.multiplyScalar(Math.max(0, 1 - p.k.drag * dt));
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < 0.01 && p.k.g < 0) { p.p.y = 0.01; p.v.set(0, 0, 0); }
      const age = 1 - p.life / p.max;
      let s = p.size * Math.max(0.05, 1 + p.k.grow * age);
      if (p.life < 0.25) s *= p.life / 0.25;
      this._s.set(s, s, s);
      p.rot.x += dt * 3;
      this._q.setFromEuler(p.rot);
      this._m.compose(p.p, this._q, this._s);
      this.mesh.setMatrixAt(n, this._m);
      this.mesh.setColorAt(n, this._c.set(p.color));
      n++; alive.push(p);
    }
    this.list = alive;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---- Fire visuals: synced from a list of {id, p:[x,y,z], hp} ----
export class FireVisuals {
  constructor(scene) { this.scene = scene; this.map = new Map(); this.t = 0; }
  sync(fires, particles, dt) {
    this.t += dt;
    const seen = new Set();
    for (const f of fires) {
      seen.add(f.id);
      let v = this.map.get(f.id);
      if (!v) { v = this.create(); this.map.set(f.id, v); }
      v.group.position.set(f.p[0], f.p[1], f.p[2]);
      const s = 0.45 + f.hp * 0.85;
      v.cones.forEach((c, i) => {
        const ph = c.userData.ph;
        const flick = 1 + Math.sin(this.t * (11 + ph * 7) + ph * 10) * 0.25 + Math.sin(this.t * 23 + ph * 3) * 0.1;
        c.scale.set(s, s * flick, s);
        c.position.x = c.userData.x * s + Math.sin(this.t * 9 + ph * 5) * 0.015;
        c.position.z = c.userData.z * s;
        c.rotation.z = Math.sin(this.t * 7 + ph * 4) * 0.15;
      });
      v.light.intensity = 4 + f.hp * 6 + Math.sin(this.t * 20) * 1.5;
      if (Math.random() < dt * 14 * (0.4 + f.hp)) particles.spawn('ember', v.group.position, new THREE.Vector3(rnd(-0.4, 0.4), rnd(1, 2.5), rnd(-0.4, 0.4)));
      if (Math.random() < dt * 6 * f.hp) particles.spawn('smoke', v.group.position.clone().add(new THREE.Vector3(0, 0.5 * s, 0)), new THREE.Vector3(rnd(-0.2, 0.2), rnd(0.8, 1.4), rnd(-0.2, 0.2)));
    }
    for (const [id, v] of this.map) if (!seen.has(id)) { this.scene.remove(v.group); this.map.delete(id); }
  }
  create() {
    const g = new THREE.Group();
    // a cluster of flickering flame "tongues": outer red/orange ring, yellow core
    const tongues = [
      [0xff4800, 0.11, 0.45, 0.12, 0], [0xff4800, 0.1, 0.38, -0.12, 0.05], [0xff4800, 0.1, 0.4, 0.02, -0.13],
      [0xff4800, 0.09, 0.35, 0.04, 0.13], [0xff9e00, 0.12, 0.6, 0.05, 0.03], [0xff9e00, 0.1, 0.5, -0.06, -0.04],
      [0xffd000, 0.08, 0.42, 0, 0], [0xfff3b0, 0.05, 0.28, 0.01, 0.01],
    ];
    const cones = tongues.map(([c, r, h, x, z], i) => {
      const geo = new THREE.ConeGeometry(r, h, 5); geo.translate(0, h / 2, 0);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9 }));
      m.userData = { ph: i * 0.37 + Math.random(), x, z };
      m.position.set(x, 0, z); m.renderOrder = 2; g.add(m); return m;
    });
    const light = new THREE.PointLight(0xff7b00, 6, 6, 1.5); light.position.y = 0.6; g.add(light);
    this.scene.add(g);
    return { group: g, cones, light };
  }
  clear() { for (const v of this.map.values()) this.scene.remove(v.group); this.map.clear(); }
}

export class PuddleVisual {
  constructor(scene, center) {
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshLambertMaterial({ color: 0x48cae4, transparent: true, opacity: 0.65, emissive: 0x0a3d62 }));
    this.mesh.rotation.x = -Math.PI / 2; this.mesh.position.copy(center); this.mesh.visible = false;
    scene.add(this.mesh); this.t = 0;
  }
  sync(r, dt) {
    this.t += dt;
    this.mesh.visible = r > 0.05;
    const w = 1 + Math.sin(this.t * 3) * 0.03;
    this.mesh.scale.set(r * w, r / w, 1);
  }
}

export function buildChicken() {
  const g = new THREE.Group();
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), lam(0xffffff)); body.scale.set(1, 0.85, 1.2); body.position.y = 0.32; body.castShadow = true; g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 5), lam(0xf8f9fa)); tail.position.set(0, 0.42, 0.25); tail.rotation.x = -0.8; g.add(tail);
  const head = new THREE.Group(); head.position.set(0, 0.55, -0.18); g.add(head);
  head.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), lam(0xffffff)));
  const comb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.12), lam(0xe63946)); comb.position.y = 0.11; head.add(comb);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 4), lam(0xffb703)); beak.rotation.x = -Math.PI / 2; beak.position.z = -0.13; head.add(beak);
  const wattle = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), lam(0xe63946)); wattle.position.set(0, -0.05, -0.1); head.add(wattle);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 4), lam(0x111111)); eye.position.set(s * 0.07, 0.03, -0.07); head.add(eye);
    const wing = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), lam(0xe9ecef)); wing.scale.set(0.3, 0.7, 1); wing.position.set(s * 0.21, 0.34, 0); g.add(wing);
    (s < 0 ? (g.userData.wingL = wing) : (g.userData.wingR = wing));
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 4), lam(0xffb703)); leg.position.set(s * 0.07, 0.08, 0); g.add(leg);
    (s < 0 ? (g.userData.legL = leg) : (g.userData.legR = leg));
  }
  const loot = new THREE.Group(); loot.position.set(0, 0.62, -0.3); g.add(loot);
  g.userData.head = head; g.userData.loot = loot;
  g.userData.npc = 'chicken';
  return g;
}
