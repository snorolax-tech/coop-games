// Zombie types + their low-poly models (rendered on both host and guest from snapshots).
import * as THREE from 'three';

export const ZTYPES = {
  walker:   { hp: 45, speed: 2.7, dmg: 9, reach: 1.5, scale: 1, skin: 0x7fa36a, shirt: 0x5c6b7a, from: 1 },
  runner:   { hp: 28, speed: 5.4, dmg: 7, reach: 1.4, scale: 0.9, skin: 0x9bb88a, shirt: 0x9d4e3c, from: 2 },
  brute:    { hp: 190, speed: 1.7, dmg: 22, reach: 2.0, scale: 1.55, skin: 0x5f7d4f, shirt: 0x3a3a3a, from: 3, armor: 0.5 },
  exploder: { hp: 35, speed: 3.1, dmg: 0, reach: 1.8, scale: 1.15, skin: 0xa0b060, shirt: 0xd9b23a, from: 4, boom: { radius: 4.5, dmg: 35 } },
};

const mats = new Map();
const mat = (c, o = {}) => { const k = c + JSON.stringify(o); if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.9, ...o })); return mats.get(k); };
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffee33 });

export class ZombieModel {
  constructor(type) {
    const T = ZTYPES[type];
    this.type = type;
    const g = this.root = new THREE.Group();
    const body = this.body = new THREE.Group(); g.add(body);
    const add = (w, h, d, c, x, y, z, parent = body) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    add(0.7, 0.85, 0.4, T.shirt, 0, 1.25, 0);
    this.head = add(0.45, 0.45, 0.45, T.skin, 0, 1.9, 0.05);
    for (const x of [-0.11, 0.11]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.02), eyeMat); e.position.set(x, 1.95, 0.29); body.add(e); }
    this.armL = new THREE.Group(); this.armL.position.set(0.45, 1.6, 0); body.add(this.armL);
    this.armR = new THREE.Group(); this.armR.position.set(-0.45, 1.6, 0); body.add(this.armR);
    add(0.18, 0.18, 0.75, T.skin, 0, 0, 0.35, this.armL); add(0.18, 0.18, 0.75, T.skin, 0, 0, 0.35, this.armR);
    this.legL = new THREE.Group(); this.legL.position.set(0.18, 0.85, 0); g.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(-0.18, 0.85, 0); g.add(this.legR);
    add(0.22, 0.85, 0.24, 0x3d405b, 0, -0.42, 0, this.legL); add(0.22, 0.85, 0.24, 0x3d405b, 0, -0.42, 0, this.legR);
    if (type === 'brute') { add(0.9, 0.3, 0.55, 0x6c757d, 0, 1.55, 0); add(0.55, 0.15, 0.55, 0x6c757d, 0, 2.15, 0.05); }
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
    const spd = stunned ? 0 : ZTYPES[this.type].speed;
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
