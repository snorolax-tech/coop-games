// A mech = fixed frame (torso) + one swappable mesh per slot.
import * as THREE from 'three';
import { SLOTS, slotId, makePartMesh, mat, PARTS } from './parts.js';

const MOUNTS = {
  head: [0, 2.85, 0],
  leftArm: [1.15, 2.25, 0.1],   // +x is the mech's left when it faces +z
  rightArm: [-1.15, 2.25, 0.1],
  back: [0, 2.25, -0.8],
  legs: [0, 0, 0],
};

export class Mech {
  constructor(color) {
    this.color = color;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.torsoMat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.5, metalness: 0.3 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.3, 1.3), this.torsoMat);
    torso.position.y = 2.1; torso.castShadow = true;
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.28, 12), new THREE.MeshBasicMaterial({ color: 0xffffaa }));
    core.position.set(0, 2.15, 0.66);
    this.core = core;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.18, 1.32), mat(0x2a2d33));
    stripe.position.y = 1.6;
    const hip = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 0.9), mat(0x50565e));
    hip.position.y = 1.4;
    this.body.add(torso, core, stripe, hip);
    for (const x of [-1.05, 1.05]) {
      const j = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), mat(0x50565e));
      j.position.set(x, 2.25, 0.1); this.body.add(j);
    }
    this.slots = {};
    this.ids = {};
    for (const s of SLOTS) {
      const g = new THREE.Group();
      g.position.set(...MOUNTS[s]);
      (s === 'legs' ? this.root : this.body).add(g);
      this.slots[s] = g;
    }
    // shield bubble
    this.bubble = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x77ddff, transparent: true, opacity: 0.22, depthWrite: false }));
    this.bubble.position.y = 2; this.bubble.visible = false;
    this.root.add(this.bubble);
    this.flameParticles = [];
    this.t = 0; this.walkPhase = 0; this.flashT = 0;
    this.setParts({});
  }

  setParts(parts) {
    for (const s of SLOTS) {
      const id = slotId(parts, s) || (s === 'head' ? 'basicHead' : null);
      if (this.ids[s] === id) continue;
      this.ids[s] = id;
      const g = this.slots[s];
      g.clear();
      if (id) {
        const m = makePartMesh(id, this.color);
        if (s === 'rightArm') m.userData.side = -1;
        g.add(m);
      }
    }
  }

  flash() { this.flashT = 0.15; }

  /** pose: {x,y,z,yaw, a:{la,lh,ra,rh,sh,jt,sp,mv,gr,vy,br}} */
  update(dt, pose, fx) {
    this.t += dt;
    const a = pose.a || {};
    this.root.position.set(pose.x, pose.y, pose.z);
    this.root.rotation.y = pose.yaw;
    const mv = a.mv || 0;
    const walk = Math.min(1.4, mv / 7);
    this.walkPhase += dt * (3 + mv * 1.1);
    this.body.position.y = a.gr ? Math.abs(Math.sin(this.walkPhase)) * 0.08 * walk : 0;
    this.body.rotation.x = Math.min(0.25, mv * 0.015);
    this.bubble.visible = !!a.sh;
    if (a.sh) this.bubble.material.opacity = 0.18 + Math.sin(this.t * 12) * 0.05;
    this.flashT -= dt;
    this.torsoMat.emissive.setHex(this.flashT > 0 ? 0xffffff : 0x000000);
    this.core.material.color.setHex(this.flashT > 0 ? 0xff3333 : 0xffffaa);

    const base = { t: this.t, dt, walkPhase: this.walkPhase, walk, gr: a.gr, vy: a.vy || 0 };
    for (const s of SLOTS) {
      const m = this.slots[s].children[0];
      if (!m) continue;
      let st = base;
      if (s === 'leftArm') st = { ...base, prog: a.la || 0, held: !!a.lh, active: !!a.lh || a.la > 0 };
      else if (s === 'rightArm') st = { ...base, prog: a.ra || 0, held: !!a.rh, active: !!a.rh || a.ra > 0 };
      else if (s === 'back') st = { ...base, active: !!(a.jt || a.sp), ready: !!a.br };
      m.userData.animate?.(m, st);
      if (m.userData.flame && st.held && fx) {
        m.userData.tip.getWorldPosition(_v);
        const dir = _d.set(Math.sin(pose.yaw), 0, Math.cos(pose.yaw));
        fx.flame(_v, dir);
      }
    }
  }
}
const _v = new THREE.Vector3(), _d = new THREE.Vector3();

export { PARTS };
