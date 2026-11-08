// First-person controller (physics sphere) + the chef avatar seen by the other player.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export const PLAYER_R = 0.35;
export const EYE = 1.25; // eye height above body center
const WALK = 4.2, SPRINT = 6.8, JUMP = 5.2;

export class LocalPlayer {
  constructor(physics, spawn, playerMat) {
    this.physics = physics;
    this.body = new CANNON.Body({ mass: 70, shape: new CANNON.Sphere(PLAYER_R), material: playerMat, fixedRotation: true, linearDamping: 0 });
    this.body.position.set(spawn.x, spawn.y, spawn.z);
    this.body.collisionFilterGroup = 2;
    this.body.allowSleep = false;
    physics.addBody(this.body);
    this.yaw = 0; this.pitch = 0;
    this.grounded = false;
    this.sens = 1;
    this.moving = false;
    this.sprinting = false;
    this._ray = new CANNON.RaycastResult();
  }
  look(dx, dy) {
    const s = 0.0022 * this.sens;
    this.yaw -= dx * s;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * s));
  }
  // env: { slippery, quake, push: Vector3-like extra accel }
  update(dt, input, env = {}) {
    const b = this.body;
    if (this.knock > 0) { // knocked out: no control, just slide to a stop
      this.knock -= dt; this.moving = false; this.sprinting = false;
      const f = Math.max(0, 1 - 3 * dt); b.velocity.x *= f; b.velocity.z *= f;
      return;
    }
    // ground check
    const from = b.position, to = new CANNON.Vec3(from.x, from.y - PLAYER_R - 0.12, from.z);
    this._ray.reset();
    this.physics.raycastClosest(from, to, { collisionFilterMask: 1 | 4, skipBackfaces: true }, this._ray);
    this.grounded = this._ray.hasHit;

    let fx = 0, fz = 0;
    if (input.isDown('KeyW')) fz -= 1;
    if (input.isDown('KeyS')) fz += 1;
    if (input.isDown('KeyA')) fx -= 1;
    if (input.isDown('KeyD')) fx += 1;
    const len = Math.hypot(fx, fz) || 1; fx /= len; fz /= len;
    this.sprinting = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = this.sprinting ? SPRINT : WALK;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward is -Z rotated by yaw
    const wx = (fx * cos + fz * sin) * speed;
    const wz = (-fx * sin + fz * cos) * speed;
    this.moving = fx !== 0 || fz !== 0;

    let accel = this.grounded ? 14 : 4;
    if (env.slippery && this.grounded) accel = this.moving ? 1.6 : 0.35;
    const t = Math.min(1, accel * dt);
    b.velocity.x += (wx - b.velocity.x) * t;
    b.velocity.z += (wz - b.velocity.z) * t;
    if (env.push) { b.velocity.x += env.push.x * dt; b.velocity.z += env.push.z * dt; }
    if (env.quake) {
      b.velocity.x += (Math.random() - 0.5) * 30 * dt;
      b.velocity.z += (Math.random() - 0.5) * 30 * dt;
    }
    if (this.grounded && input.wasPressed('Space') && b.velocity.y < 2) { b.velocity.y = JUMP; this.justJumped = true; }
  }
  headPos(out = new THREE.Vector3()) {
    const p = this.body.position; return out.set(p.x, p.y + EYE, p.z);
  }
}

// Kinematic stand-in for a remote player so they can bump into things.
export class PlayerProxy {
  constructor(physics) {
    this.body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, shape: new CANNON.Sphere(PLAYER_R) });
    this.body.addShape(new CANNON.Sphere(PLAYER_R * 0.9), new CANNON.Vec3(0, 0.7, 0));
    this.body.collisionFilterGroup = 4;
    this.body.position.set(0, -50, 0);
    physics.addBody(this.body);
    this.physics = physics;
  }
  moveTo(p, dt) {
    const b = this.body;
    const dx = p.x - b.position.x, dy = p.y - b.position.y, dz = p.z - b.position.z;
    const d = Math.hypot(dx, dy, dz);
    // big jumps (teleports, ragdoll catch-up) snap instead of ramming through people at 100 m/s
    if (b.position.y < -20 || d > 1.2) { b.position.set(p.x, p.y, p.z); b.velocity.setZero(); return; }
    const inv = 1 / Math.max(dt, 1 / 120);
    const s = Math.min(1, 7 / Math.max(1e-6, d * inv)); // cap shove speed at 7 m/s
    b.velocity.set(dx * inv * s, dy * inv * s, dz * inv * s);
  }
  remove() { this.physics.removeBody(this.body); }
}

function nameTag(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.roundRect(4, 4, 248, 56, 18); g.fill();
  g.font = 'bold 34px Fredoka, "Segoe UI", sans-serif'; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(0.8, 0.2, 1); s.renderOrder = 10;
  return s;
}

export const RAGDOLL_TIME = 2.2;
const RAG_PARTS = {
  torso: { mass: 20, shape: () => new CANNON.Box(new CANNON.Vec3(0.3, 0.42, 0.22)) },
  head:  { mass: 5, shape: () => new CANNON.Sphere(0.27) },
  armL:  { mass: 3, shape: () => new CANNON.Box(new CANNON.Vec3(0.08, 0.26, 0.08)) },
  armR:  { mass: 3, shape: () => new CANNON.Box(new CANNON.Vec3(0.08, 0.26, 0.08)) },
  legL:  { mass: 5, shape: () => new CANNON.Box(new CANNON.Vec3(0.1, 0.2, 0.1)) },
  legR:  { mass: 5, shape: () => new CANNON.Box(new CANNON.Vec3(0.1, 0.2, 0.1)) },
};
// [bodyA, pivotInA, bodyB, pivotInB] — ball joints = maximum flop
const RAG_JOINTS = [
  ['torso', [0, 0.45, 0], 'head', [0, -0.13, 0]],
  ['torso', [-0.36, 0.25, 0], 'armL', [0, 0.24, 0]],
  ['torso', [0.36, 0.25, 0], 'armR', [0, 0.24, 0]],
  ['torso', [-0.13, -0.4, 0], 'legL', [0, 0.2, 0]],
  ['torso', [0.13, -0.4, 0], 'legR', [0, 0.2, 0]],
];

export class ChefAvatar {
  constructor(color, name) {
    const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    const m = (geo, mat) => { const x = new THREE.Mesh(geo, mat); x.castShadow = true; return x; };
    this.group = new THREE.Group();
    this.bodyGroup = new THREE.Group(); this.group.add(this.bodyGroup);
    // Each body part is its own group (origin = part center) so it can become a ragdoll piece.
    const part = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    const shirt = lam(color);
    this.torso = part(this.bodyGroup, 0, 0.8, 0);
    const belly = m(new THREE.CapsuleGeometry(0.3, 0.5, 4, 10), shirt); belly.position.y = -0.05; this.torso.add(belly);
    const apron = m(new THREE.BoxGeometry(0.42, 0.55, 0.05), lam(0xffffff)); apron.position.set(0, -0.12, -0.28); this.torso.add(apron);
    const pocket = m(new THREE.BoxGeometry(0.16, 0.1, 0.02), lam(color)); pocket.position.set(0, -0.18, -0.31); this.torso.add(pocket);
    for (const s of [-1, 1]) {
      const leg = part(this.bodyGroup, s * 0.13, 0.2, 0);
      leg.add(m(new THREE.CylinderGeometry(0.09, 0.09, 0.4, 8), lam(0x2b2d42)));
      const shoe = m(new THREE.BoxGeometry(0.15, 0.08, 0.24), lam(0x111111)); shoe.position.set(0, -0.17, -0.05); leg.add(shoe);
      // arm: shoulder end at local +y, hand at local -y; tilted forward so hands reach out
      const arm = part(this.bodyGroup, s * 0.36, 0.96, -0.22); arm.rotation.x = 1.2;
      arm.add(m(new THREE.CapsuleGeometry(0.07, 0.35, 3, 6), shirt));
      const hand = m(new THREE.SphereGeometry(0.075, 8, 6), lam(0xf4c095)); hand.position.y = -0.27; arm.add(hand);
      if (s < 0) { this.legL = leg; this.armL = arm; } else { this.legR = leg; this.armR = arm; }
    }
    this.head = new THREE.Group(); this.head.position.y = 1.38; this.group.add(this.head);
    const skin = lam(0xf4c095);
    const face = m(new THREE.SphereGeometry(0.24, 14, 10), skin); this.head.add(face);
    const nose = m(new THREE.SphereGeometry(0.06, 8, 6), lam(0xf1a27c)); nose.position.set(0, -0.02, -0.24); this.head.add(nose);
    for (const s of [-1, 1]) {
      const eye = m(new THREE.SphereGeometry(0.045, 8, 6), lam(0xffffff)); eye.position.set(s * 0.09, 0.06, -0.2); this.head.add(eye);
      const pupil = m(new THREE.SphereGeometry(0.025, 6, 6), lam(0x111111)); pupil.position.set(s * 0.09, 0.06, -0.24); this.head.add(pupil);
    }
    const stache = m(new THREE.TorusGeometry(0.07, 0.025, 5, 10, Math.PI), lam(0x3d2c1e)); stache.position.set(0, -0.09, -0.22); stache.rotation.z = Math.PI; this.head.add(stache);
    const hatBand = m(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 14), lam(0xffffff)); hatBand.position.y = 0.22; this.head.add(hatBand);
    const puff = lam(0xffffff);
    for (const [x, z] of [[0, 0], [0.1, 0.06], [-0.1, 0.06], [0, -0.1], [0.08, -0.07], [-0.08, -0.07]]) {
      const p = m(new THREE.SphereGeometry(0.13, 10, 8), puff); p.position.set(x, 0.38, z); this.head.add(p);
    }
    const stripe = m(new THREE.CylinderGeometry(0.205, 0.205, 0.03, 14), lam(color)); stripe.position.y = 0.2; this.head.add(stripe);
    this.tag = nameTag(name, '#' + new THREE.Color(color).getHexString());
    this.tag.position.y = 2.15; this.group.add(this.tag);
    this.t = 0;
    this.parts = { torso: this.torso, head: this.head, armL: this.armL, armR: this.armR, legL: this.legL, legR: this.legR };
    this.rest = {};
    for (const [k, p] of Object.entries(this.parts)) this.rest[k] = { parent: p.parent, pos: p.position.clone(), quat: p.quaternion.clone() };
    this.rag = null;
  }

  // ---------- Ragdoll ----------
  // Turns the chef into floppy physics pieces joined by ball joints, launched with velocity v.
  startRagdoll(physics, scene, v, duration = RAGDOLL_TIME) {
    if (this.rag) { this.rag.t = Math.max(this.rag.t, duration); return; }
    this.group.updateMatrixWorld(true);
    const bodies = {};
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion();
    for (const [k, p] of Object.entries(this.parts)) {
      const def = RAG_PARTS[k];
      p.getWorldPosition(wp); p.getWorldQuaternion(wq);
      const b = new CANNON.Body({ mass: def.mass, shape: def.shape(), material: physics.defaultMaterial, linearDamping: 0.08, angularDamping: 0.35 });
      b.position.set(wp.x, wp.y, wp.z); b.quaternion.set(wq.x, wq.y, wq.z, wq.w);
      const jitter = k === 'torso' ? 0.3 : 1.5;
      b.velocity.set(v[0] + (Math.random() - 0.5) * jitter, v[1] + (Math.random() - 0.5) * jitter, v[2] + (Math.random() - 0.5) * jitter);
      b.angularVelocity.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
      b.collisionFilterGroup = 8; b.collisionFilterMask = 1; // hits world + items, not players or itself
      b.allowSleep = false;
      physics.addBody(b); bodies[k] = b;
      scene.attach(p); // keep world transform, detach from avatar
    }
    const constraints = RAG_JOINTS.map(([a, pa, b, pb]) => {
      const c = new CANNON.PointToPointConstraint(bodies[a], new CANNON.Vec3(...pa), bodies[b], new CANNON.Vec3(...pb));
      physics.addConstraint(c); return c;
    });
    this.rag = { bodies, constraints, physics, t: duration };
  }
  get ragdolling() { return !!this.rag; }
  // Copy physics to meshes. Returns true when the ragdoll just ended.
  updateRagdoll(dt) {
    if (!this.rag) return false;
    for (const [k, b] of Object.entries(this.rag.bodies)) {
      const p = this.parts[k];
      p.position.set(b.position.x, b.position.y, b.position.z);
      p.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    }
    this.rag.t -= dt;
    if (this.rag.t <= 0) { this.endRagdoll(); return true; }
    return false;
  }
  endRagdoll() {
    if (!this.rag) return;
    const { physics, bodies, constraints } = this.rag;
    constraints.forEach((c) => physics.removeConstraint(c));
    Object.values(bodies).forEach((b) => physics.removeBody(b));
    for (const [k, p] of Object.entries(this.parts)) {
      const r = this.rest[k];
      r.parent.add(p); p.position.copy(r.pos); p.quaternion.copy(r.quat);
    }
    this.rag = null;
    this.popT = 0.35; // little squash on getting up
  }
  // ---------- Health visuals ----------
  setOnFire(on) {
    if (!on && !this.flames) return;
    if (!this.flames) {
      this.flames = new THREE.Group();
      const cols = [0xff4800, 0xff9e00, 0xffd000, 0xff4800, 0xff9e00, 0xffea00, 0xff4800, 0xff9e00, 0xffd000, 0xff6a00];
      cols.forEach((c, i) => {
        const geo = new THREE.ConeGeometry(0.13 + (i % 3) * 0.04, 0.6 + (i % 3) * 0.2, 5); geo.translate(0, 0.3, 0);
        const f = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9 }));
        const a = (i / cols.length) * Math.PI * 2;
        f.position.set(Math.cos(a) * 0.3, -0.2 + (i % 3) * 0.2, Math.sin(a) * 0.28);
        f.userData.ph = Math.random() * 10;
        this.flames.add(f);
      });
      this.flames.traverse((o) => o.layers.mask = this.torso.children[0].layers.mask);
      this.torso.add(this.flames); // follows the body even while ragdolling
    }
    this.flames.visible = on;
  }
  setGhost(on) {
    if (this.ghost === on) return;
    this.ghost = on;
    this.group.traverse((o) => {
      if (!o.isMesh || (this.flames && o.parent === this.flames)) return;
      o.material.transparent = on; o.material.opacity = on ? 0.35 : 1; o.material.depthWrite = !on;
      o.castShadow = !on;
    });
  }
  ragHead() { return this.rag?.bodies.head; }
  ragTorso() { return this.rag?.bodies.torso; }

  // pos = body center position
  update(pos, yaw, pitch, dt, speed = 0) {
    this.group.position.set(pos.x, pos.y - PLAYER_R, pos.z);
    this.group.rotation.y = yaw;
    if (this.flames?.visible) for (const f of this.flames.children) f.scale.set(1, 0.7 + Math.abs(Math.sin(performance.now() / 90 + f.userData.ph)) * 0.8, 1);
    if (this.rag) return;
    if (this.ghost) { this.group.position.y += 0.3 + Math.sin(performance.now() / 300) * 0.08; } // spooky float
    this.head.rotation.x = pitch * 0.7;
    if (this.popT > 0) {
      this.popT -= dt;
      const k = Math.max(0, this.popT / 0.35);
      this.group.scale.set(1 + 0.25 * k, 1 - 0.3 * k, 1 + 0.25 * k);
    } else this.group.scale.set(1, 1, 1);
    this.t += dt * (2 + speed * 2.2);
    const swing = Math.min(1, speed / 4) * 0.5;
    this.legL.rotation.x = Math.sin(this.t) * swing;
    this.legR.rotation.x = -Math.sin(this.t) * swing;
    this.bodyGroup.position.y = Math.abs(Math.sin(this.t)) * 0.05 * Math.min(1, speed / 3);
    this.head.position.y = 1.38 + this.bodyGroup.position.y;
  }
}
