// Lightweight custom physics for thrown things (Bond Orbs, treats): gravity, bouncing
// off the terrain and colliders, rolling to rest. Resting items can be picked back up.
// Later stages register "targets" (creatures) so throws can hit them.
import * as THREE from 'three';
import { Colliders } from '../world/colliders.js';
import { groundNormal, WATER_Y } from '../world/terrain.js';

const GRAV = 22;
const _n = new THREE.Vector3();

export function makeOrbMesh(scale = 1) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x3a86ff, emissive: 0x0a2a66 }));
  const bot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0xfff6e0 }));
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.141, 0.018, 6, 20), new THREE.MeshLambertMaterial({ color: 0xffbe0b, emissive: 0x553300 }));
  band.rotation.x = Math.PI / 2;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.04), new THREE.MeshLambertMaterial({ color: 0xff70a6, emissive: 0x991144 }));
  gem.position.z = 0.145;
  g.add(top, bot, band, gem);
  g.scale.setScalar(scale);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeTreatMesh(scale = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshLambertMaterial({ color: 0xff70a6, emissive: 0x330a1a }));
  body.scale.set(1.3, 0.9, 0.9);
  g.add(body);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 6), new THREE.MeshLambertMaterial({ color: 0xffd670 }));
    w.rotation.z = s * Math.PI / 2; w.position.x = s * 0.16; g.add(w);
  }
  g.scale.setScalar(scale);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Projectiles {
  constructor(world, game) {
    this.world = world;
    this.game = game;
    this.list = [];
    this.targets = []; // { pos: Vector3, radius, onHit(projectile) } — creatures register here later
    this.maxResting = 30;
    this._q = [];
    this.nextId = 1;
    this.proxies = new Map(); // guest only: id -> { mesh, target, kind, resting, interact }
  }

  /** Host/solo: spawn and simulate a thrown item. owner = actor id ('host' | 'guest'). */
  throw(kind, origin, velocity, owner = 'host') {
    const mesh = kind === 'orb' ? makeOrbMesh() : makeTreatMesh();
    mesh.position.copy(origin);
    this.world.scene.add(mesh);
    const p = { id: this.nextId++, kind, mesh, pos: mesh.position, vel: velocity.clone(), radius: kind === 'orb' ? 0.14 : 0.12,
      resting: false, age: 0, bounces: 0, owner, spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0) };
    this.list.push(p);
    return p;
  }

  remove(p) {
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
    this.world.scene.remove(p.mesh);
    if (p.interact) this.game.interactions.remove(p.interact);
  }

  _pickupDef(id, kind, mesh, onPick) {
    return this.game.interactions.add({
      id: 'proj:' + id, root: mesh, name: kind === 'orb' ? 'Bond Orb' : 'Tasty Treat', sub: 'E  Pick up', range: 3.5,
      use: onPick,
    });
  }

  _rest(p) {
    p.resting = true;
    p.vel.set(0, 0, 0);
    p.interact = this._pickupDef(p.id, p.kind, p.mesh, (actor) => { actor.give(p.kind, 1, true); this.remove(p); });
    this.game.onProjectileRest?.(p);
    const resting = this.list.filter((q) => q.resting);
    if (resting.length > this.maxResting) this.remove(resting[0]);
  }

  /** Host: compact state for snapshots. */
  snapshot() {
    return this.list.map((p) => [p.id, p.kind === 'orb' ? 0 : 1, +p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2), p.resting ? 1 : 0]);
  }

  /** Guest: mirror the host's projectiles. */
  applySnapshot(arr) {
    const seen = new Set();
    for (const [id, k, x, y, z, resting] of arr) {
      seen.add(id);
      let px = this.proxies.get(id);
      if (!px) {
        const kind = k === 0 ? 'orb' : 'treat';
        const mesh = kind === 'orb' ? makeOrbMesh() : makeTreatMesh();
        mesh.position.set(x, y, z);
        this.world.scene.add(mesh);
        px = { mesh, kind, target: new THREE.Vector3(x, y, z), resting: false };
        this.proxies.set(id, px);
      }
      px.target.set(x, y, z);
      if (resting && !px.resting) {
        px.resting = true;
        px.interact = this._pickupDef(id, px.kind, px.mesh, null); // use is routed to the host by id
      }
    }
    for (const [id, px] of this.proxies) {
      if (seen.has(id)) continue;
      this.world.scene.remove(px.mesh);
      if (px.interact) this.game.interactions.remove(px.interact);
      this.proxies.delete(id);
    }
  }

  updateProxies(dt) {
    for (const px of this.proxies.values()) {
      px.mesh.position.lerp(px.target, 1 - Math.exp(-18 * dt));
      if (!px.resting) { px.mesh.rotation.x += dt * 8; px.mesh.rotation.y += dt * 6; }
    }
  }

  clear() {
    for (const p of [...this.list]) this.remove(p);
    this.applySnapshot([]);
  }

  update(dt) {
    for (const p of [...this.list]) {
      if (p.resting) continue;
      p.age += dt;
      // sub-step for fast throws
      const steps = Math.ceil((p.vel.length() * dt) / 0.25) || 1;
      const h = dt / steps;
      for (let s = 0; s < steps && !p.resting; s++) this._step(p, h);
      p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt;
      if (p.age > 20 && !p.resting) this._rest(p);
    }
  }

  _step(p, h) {
    p.vel.y -= GRAV * h;
    p.pos.addScaledVector(p.vel, h);

    // creature targets
    for (const t of this.targets) {
      if (t.pos.distanceTo(p.pos) < t.radius + p.radius) {
        if (t.onHit(p) === 'consume') { this.remove(p); return; }
        _n.subVectors(p.pos, t.pos).normalize();
        const vn = p.vel.dot(_n);
        if (vn < 0) p.vel.addScaledVector(_n, -1.5 * vn);
        p.pos.copy(t.pos).addScaledVector(_n, t.radius + p.radius + 0.01);
      }
    }

    // colliders (trees, rocks, buildings)
    const list = this.world.colliders.query(p.pos.x, p.pos.z, p.radius + 1, this._q);
    for (const c of list) {
      if (p.pos.y - p.radius > c.top || p.pos.y + p.radius < c.bottom) continue;
      const pen = Colliders.penetration(c, p.pos.x, p.pos.z, p.radius);
      if (!pen) continue;
      // landed on top?
      if (p.vel.y < 0 && p.pos.y - p.radius > c.top - 0.3) {
        p.pos.y = c.top + p.radius;
        this._bounceY(p);
        continue;
      }
      p.pos.x += pen.nx * pen.depth; p.pos.z += pen.nz * pen.depth;
      const vn = p.vel.x * pen.nx + p.vel.z * pen.nz;
      if (vn < 0) { p.vel.x -= 1.5 * vn * pen.nx; p.vel.z -= 1.5 * vn * pen.nz; this._bonk(p, -vn); }
    }

    // terrain / water
    const g = this.world.groundY(p.pos.x, p.pos.z);
    if (g < WATER_Y && p.pos.y < WATER_Y) {
      // splash: float on the surface
      p.vel.multiplyScalar(0.9);
      p.vel.y = Math.max(p.vel.y, 0) + (WATER_Y - p.pos.y) * 6 * h;
      if (!p.splashed) { p.splashed = true; this.game.worldFx('splash', p.pos.clone()); this.game.worldSound('splash', p.pos); }
      if (p.vel.lengthSq() < 0.05 && Math.abs(p.pos.y - WATER_Y) < 0.1) this._rest(p);
      return;
    }
    if (p.pos.y - p.radius < g) {
      p.pos.y = g + p.radius;
      groundNormal(p.pos.x, p.pos.z, _n);
      const vn = p.vel.dot(_n);
      if (vn < 0) {
        p.vel.addScaledVector(_n, -1.45 * vn); // restitution ~0.45
        p.vel.multiplyScalar(0.82);            // friction
        this._bonk(p, -vn);
        p.bounces++;
      }
      // slide downhill a bit, then settle
      if (p.vel.lengthSq() < 0.35 && _n.y > 0.8) this._rest(p);
    }
  }

  _bounceY(p) {
    if (p.vel.y < 0) { p.vel.y *= -0.45; p.vel.x *= 0.8; p.vel.z *= 0.8; this._bonk(p, Math.abs(p.vel.y)); }
    if (p.vel.lengthSq() < 0.35) this._rest(p);
  }

  _bonk(p, speed) {
    if (speed > 2.5) this.game.worldSound('bounce', p.pos, Math.min(1, speed / 12));
  }
}
