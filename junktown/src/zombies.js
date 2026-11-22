// Zombie types + their low-poly models (rendered on both host and guest from snapshots).
import * as THREE from 'three';

export const ZTYPES = {
  walker:   { hp: 60, speed: 2.8, dmg: 12, reach: 1.5, scale: 1, skin: 0x7fa36a, shirt: 0x5c6b7a, from: 1 },
  runner:   { hp: 35, speed: 5.7, dmg: 9, reach: 1.4, scale: 0.9, skin: 0x9bb88a, shirt: 0x9d4e3c, from: 2 },
  brute:    { hp: 240, speed: 1.8, dmg: 26, reach: 2.0, scale: 1.55, skin: 0x5f7d4f, shirt: 0x3a3a3a, from: 3, armor: 0.5 },
  exploder: { hp: 40, speed: 3.3, dmg: 0, reach: 1.8, scale: 1.15, skin: 0xa0b060, shirt: 0xd9b23a, from: 4, boom: { radius: 4.5, dmg: 35 } },
  // only moves while nobody is looking at it
  stalker:  { hp: 90, speed: 9, dmg: 30, reach: 1.6, scale: 1.3, skin: 0xd9d6cc, shirt: 0x141414, from: 2, stalker: true },
  // bursts out of containers you search
  lurker:   { hp: 30, speed: 6.2, dmg: 10, reach: 1.4, scale: 0.95, skin: 0xb5b89a, shirt: 0x3a3226, from: 1 },
  // bosses
  butcher:  { hp: 1400, speed: 2.4, dmg: 32, reach: 2.9, scale: 2.5, skin: 0x8a6a5a, shirt: 0xc8c2b0, boss: 'THE BUTCHER', armor: 0.8 },
  mother:   { hp: 1800, speed: 1.4, dmg: 28, reach: 2.8, scale: 2.3, skin: 0x7a9a4a, shirt: 0x4a3a2a, boss: 'THE MOTHER' },
  hollow:   { hp: 2200, speed: 3.4, dmg: 35, reach: 2.5, scale: 2.1, skin: 0xf0f0ea, shirt: 0x050505, boss: 'THE HOLLOW' },
};

const mats = new Map();
const mat = (c, o = {}) => { const k = c + JSON.stringify(o); if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.9, ...o })); return mats.get(k); };
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffee33 });
const blackEye = new THREE.MeshBasicMaterial({ color: 0x000000 });
const redEye = new THREE.MeshBasicMaterial({ color: 0xff1a1a });

export class ZombieModel {
  constructor(type) {
    const T = ZTYPES[type];
    this.type = type;
    const g = this.root = new THREE.Group();
    const body = this.body = new THREE.Group(); g.add(body);
    const add = (w, h, d, c, x, y, z, parent = body) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    add(0.7, 0.85, 0.4, T.shirt, 0, 1.25, 0);
    this.head = add(0.45, 0.45, 0.45, T.skin, 0, 1.9, 0.05);
    const eyes = type === 'stalker' ? blackEye : type === 'hollow' ? redEye : eyeMat;
    for (const x of [-0.11, 0.11]) { const e = new THREE.Mesh(new THREE.BoxGeometry(type === 'stalker' ? 0.12 : 0.08, type === 'stalker' ? 0.14 : 0.06, 0.02), eyes); e.position.set(x, 1.95, 0.29); body.add(e); }
    if (type === 'stalker' || type === 'hollow') { const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.02), blackEye); mouth.position.set(0, 1.76, 0.29); body.add(mouth); }
    this.armL = new THREE.Group(); this.armL.position.set(0.45, 1.6, 0); body.add(this.armL);
    this.armR = new THREE.Group(); this.armR.position.set(-0.45, 1.6, 0); body.add(this.armR);
    add(0.18, 0.18, 0.75, T.skin, 0, 0, 0.35, this.armL); add(0.18, 0.18, 0.75, T.skin, 0, 0, 0.35, this.armR);
    this.legL = new THREE.Group(); this.legL.position.set(0.18, 0.85, 0); g.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(-0.18, 0.85, 0); g.add(this.legR);
    add(0.22, 0.85, 0.24, 0x3d405b, 0, -0.42, 0, this.legL); add(0.22, 0.85, 0.24, 0x3d405b, 0, -0.42, 0, this.legR);
    if (type === 'brute') { add(0.9, 0.3, 0.55, 0x6c757d, 0, 1.55, 0); add(0.55, 0.15, 0.55, 0x6c757d, 0, 2.15, 0.05); }
    if (type === 'stalker' || type === 'hollow') {
      // stretched, too-thin body with long dangling arms
      body.scale.set(0.7, 1.25, 0.7); this.legL.scale.y = this.legR.scale.y = 1.4; this.legL.position.y = this.legR.position.y = 1.15;
      this.armL.scale.z = this.armR.scale.z = 1.9; body.position.y = 0.35;
    }
    if (type === 'butcher') {
      add(0.8, 0.9, 0.05, 0xd8d0c0, 0, 1.15, 0.23); // apron
      const cleaver = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.7), mat(0xcccccc, { metalness: 0.8 })); cleaver.position.set(0, -0.1, 0.85); this.armR.add(cleaver);
      add(1.1, 0.35, 0.6, 0x6a4a3a, 0, 1.6, 0);
    }
    if (type === 'mother') {
      this.belly = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), mat(0x8fae5a, { emissive: 0x112200 }));
      this.belly.position.set(0, 1.15, 0.15); body.add(this.belly);
      for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4), mat(0xb5c96a)); b.position.set(Math.cos(i) * 0.55, 1 + Math.sin(i * 2) * 0.3, 0.3 + Math.sin(i) * 0.3); body.add(b); }
    }
    if (type === 'exploder') {
      this.belly = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), mat(0xc9b458, { emissive: 0x332200 }));
      this.belly.position.set(0, 1.2, 0.2); body.add(this.belly);
    }
    // status fx
    this.fire = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.3, 6), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85 }));
    this.fire.position.y = 1.6; this.fire.visible = false; g.add(this.fire);
    this.zap = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), new THREE.MeshBasicMaterial({ color: 0x9ee7ff, wireframe: true }));
    this.zap.position.y = 1.3; this.zap.visible = false; g.add(this.zap);
    this.goo = new THREE.Mesh(new THREE.SphereGeometry(0.75, 8, 6), new THREE.MeshBasicMaterial({ color: 0xa7c957, transparent: true, opacity: 0.3 }));
    this.goo.position.y = 1.2; this.goo.visible = false; g.add(this.goo);
    g.scale.setScalar(T.scale);
    this.phase = Math.random() * 10;
    this.flashT = 0; this.dead = 0;
    this.x = 0; this.z = 0; this.yaw = 0;
  }

  /** s = snapshot entry */
  update(dt, s, t) {
    if (this.dead) {
      this.dead += dt;
      this.root.rotation.x = Math.min(Math.PI / 2, this.dead * 5) * -1;
      this.root.position.y = -Math.max(0, this.dead - 1) * 1.2;
      return this.dead < 2.2;
    }
    const k = 1 - Math.exp(-dt * 12);
    const d = Math.hypot(s.x - this.x, s.z - this.z);
    if (d > 6) { this.x = s.x; this.z = s.z; } else { this.x += (s.x - this.x) * k; this.z += (s.z - this.z) * k; }
    this.yaw += Math.atan2(Math.sin(s.yaw - this.yaw), Math.cos(s.yaw - this.yaw)) * k;
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.yaw;
    const fl = s.f || 0;
    const stunned = fl & 2;
    const frozen = fl & 32;
    const spd = stunned || frozen ? 0 : ZTYPES[this.type].speed * (fl & 64 ? 3 : 1);
    this.head.rotation.z = frozen ? Math.sin(t * 31) * 0.04 + 0.35 : 0;
    this.phase += dt * spd * 2.2;
    const sw = Math.sin(this.phase) * 0.6;
    this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
    const attacking = fl & 8;
    this.armL.rotation.x = attacking ? -0.6 + Math.sin(t * 18) * 0.6 : -0.15 + Math.sin(this.phase * 0.5) * 0.15;
    this.armR.rotation.x = attacking ? -0.6 + Math.cos(t * 18) * 0.6 : -0.15 - Math.sin(this.phase * 0.5) * 0.15;
    this.body.rotation.z = Math.sin(this.phase * 0.5) * 0.08 + (stunned ? Math.sin(t * 40) * 0.15 : 0);
    this.fire.visible = !!(fl & 1); if (fl & 1) this.fire.scale.set(1 + Math.sin(t * 20) * 0.15, 1 + Math.sin(t * 13) * 0.25, 1);
    this.zap.visible = !!stunned; if (stunned) this.zap.rotation.set(t * 9, t * 7, 0);
    this.goo.visible = !!(fl & 4);
    if (this.belly) this.belly.scale.setScalar(1 + Math.sin(t * 8) * 0.08);
    this.flashT -= dt;
    this.head.material = this.flashT > 0 ? mat(0xffffff) : mat(ZTYPES[this.type].skin);
    return true;
  }
}
