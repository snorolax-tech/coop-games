// First-person controller: WASD + mouse look, sprint, jump, collisions with the
// 2.5D collider world, standing on platforms, wading in water, locked-zone walls.
import * as THREE from 'three';
import { Colliders } from '../world/colliders.js';
import { WATER_Y } from '../world/terrain.js';
import { WORLD_R } from '../world/zones.js';
import { clamp, lerp } from '../core/noise.js';

const EYE = 1.65;
const RADIUS = 0.4;
const STEP_UP = 0.45;
const GRAVITY = 24;
const JUMP_V = 8.6;
const WALK = 6;
const SPRINT = 10.5;

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.pos = new THREE.Vector3(0, 0, 16);
    this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3(); // external push (e.g. a grumpy creature's charge)
    this.shake = 0;
    this.yaw = 0; this.pitch = 0;
    this.onGround = false;
    this.inWater = false;
    this.zone = 'ranch';
    this.bob = 0;
    this.stepDist = 0;
    this.fov = 75;
    this.aiming = false;
    this.sensitivity = 0.0022;
    this._q = [];
    this.isLocked = () => false; // set by game: (zoneId) => boolean
    this.onBlocked = null;
    this.onStep = null;
    this.pos.y = world.groundY(this.pos.x, this.pos.z);
  }

  teleport(x, z, yaw = this.yaw) {
    this.pos.set(x, this.world.groundY(x, z), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
  }

  /** Highest surface under (x, z) that the feet can stand on from height feetY. */
  support(x, z, feetY) {
    let g = this.world.groundY(x, z);
    if (g < WATER_Y - 1.1) g = WATER_Y - 1.1; // wade, don't drown
    const list = this.world.colliders.query(x, z, RADIUS, this._q);
    for (const c of list) {
      if (c.top <= g) continue;
      if (feetY < c.top - STEP_UP) continue;
      if (Colliders.covers(c, x, z, RADIUS * 0.5)) g = c.top;
    }
    return g;
  }

  _resolve(feetY) {
    for (let iter = 0; iter < 3; iter++) {
      const list = this.world.colliders.query(this.pos.x, this.pos.z, RADIUS + 1, this._q);
      let moved = false;
      for (const c of list) {
        if (feetY >= c.top - STEP_UP) continue;      // we're above it (standing / stepping on)
        if (feetY + EYE + 0.1 < c.bottom) continue;  // it's above our head
        const p = Colliders.penetration(c, this.pos.x, this.pos.z, RADIUS);
        if (!p) continue;
        this.pos.x += p.nx * p.depth; this.pos.z += p.nz * p.depth;
        // kill velocity into the surface
        const vn = this.vel.x * p.nx + this.vel.z * p.nz;
        if (vn < 0) { this.vel.x -= vn * p.nx; this.vel.z -= vn * p.nz; }
        moved = true;
      }
      if (!moved) break;
    }
  }

  update(dt, input, frozen = false) {
    // look
    if (input.locked && !frozen) {
      const sens = this.sensitivity * (this.aiming ? 0.55 : 1);
      this.yaw -= input.dx * sens;
      this.pitch = clamp(this.pitch - input.dy * sens, -1.5, 1.5);
    }

    // wish direction
    let fx = 0, fz = 0;
    if (!frozen) {
      if (input.isDown('KeyW')) fz -= 1;
      if (input.isDown('KeyS')) fz += 1;
      if (input.isDown('KeyA')) fx -= 1;
      if (input.isDown('KeyD')) fx += 1;
    }
    const len = Math.hypot(fx, fz) || 1;
    fx /= len; fz /= len;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = fx * cos + fz * sin;
    const wz = -fx * sin + fz * cos;
    const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    let speed = (sprint && !this.aiming ? SPRINT : WALK) * (this.aiming ? 0.6 : 1);
    if (this.inWater) speed *= 0.55;
    const accel = this.onGround ? 14 : 4;
    this.vel.x = lerp(this.vel.x, wx * speed, Math.min(1, accel * dt));
    this.vel.z = lerp(this.vel.z, wz * speed, Math.min(1, accel * dt));

    if (!frozen && this.onGround && input.wasPressed('Space')) {
      this.vel.y = this.inWater ? JUMP_V * 0.7 : JUMP_V;
      this.onGround = false;
      this.onJump?.();
    }
    this.vel.y -= GRAVITY * dt;

    // horizontal move + collisions
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += (this.vel.x + this.knock.x) * dt;
    this.pos.z += (this.vel.z + this.knock.z) * dt;
    this.knock.multiplyScalar(Math.exp(-5 * dt));
    this._resolve(this.pos.y);

    // locked zones and the world edge
    const z = this.world.zoneAt(this.pos.x, this.pos.z);
    if (z !== 'ranch' && this.isLocked(z)) {
      this.pos.x = ox; this.pos.z = oz;
      this.vel.x *= -0.3; this.vel.z *= -0.3;
      this.onBlocked?.(z);
    }
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > WORLD_R) { this.pos.x *= WORLD_R / r; this.pos.z *= WORLD_R / r; }

    // vertical
    const prevY = this.pos.y;
    this.pos.y += this.vel.y * dt;
    const ground = this.support(this.pos.x, this.pos.z, Math.max(prevY, this.pos.y));
    const wasGround = this.onGround;
    if (this.pos.y <= ground) {
      if (!wasGround && this.vel.y < -12) this.onLand?.(-this.vel.y);
      this.pos.y = ground; this.vel.y = 0; this.onGround = true;
    } else if (wasGround && this.pos.y - ground < 0.6 && this.vel.y <= 0) {
      this.pos.y = ground; this.vel.y = 0; this.onGround = true; // stick to slopes going down
    } else {
      this.onGround = false;
    }
    this.inWater = this.world.groundY(this.pos.x, this.pos.z) < WATER_Y - 0.4 && this.pos.y < WATER_Y + 0.2;

    const nz = this.world.zoneAt(this.pos.x, this.pos.z);
    if (nz !== this.zone) { this.zone = nz; this.onZone?.(nz); }

    // head bob + footsteps
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 0.5) {
      this.bob += dt * hs * 1.6;
      this.stepDist += hs * dt;
      if (this.stepDist > (sprint ? 2.6 : 2.1)) { this.stepDist = 0; this.onStep?.(this.inWater); }
    } else {
      this.bob = lerp(this.bob, Math.round(this.bob / Math.PI) * Math.PI, Math.min(1, dt * 6));
    }

    // camera
    const targetFov = this.aiming ? 48 : sprint && hs > 7 ? 80 : 75;
    this.fov = lerp(this.fov, targetFov, Math.min(1, dt * 10));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
    this.shake = Math.max(0, this.shake - dt * 2);
    const sh = this.shake * this.shake * 0.25;
    this.camera.position.set(
      this.pos.x + (Math.random() - 0.5) * sh,
      this.pos.y + EYE + Math.sin(this.bob * 2) * 0.05 * Math.min(1, hs / 6) + (Math.random() - 0.5) * sh,
      this.pos.z + (Math.random() - 0.5) * sh);
    this.camera.rotation.set(this.pitch, this.yaw, (Math.random() - 0.5) * sh * 0.2, 'YXZ');
  }

  forward(out = new THREE.Vector3()) {
    return this.camera.getWorldDirection(out);
  }
}
