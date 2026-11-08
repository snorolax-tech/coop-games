// Ambient life around the player: fireflies at night, falling leaves in the forest,
// embers in the Cinder Hills and butterflies on sunny days. Each is a cheap point cloud
// that lives in a box around the camera and wraps around as you move.
// Also plays ambient sounds (birds, crickets, water, rumbles).
import * as THREE from 'three';

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const DOT = dotTexture();

const SYSTEMS = {
  fireflies: { n: 70, color: 0xd4ff6b, size: 0.28, box: [40, 6, 40], y0: 0.5, additive: true },
  leaves:    { n: 60, color: 0xffa94d, size: 0.32, box: [36, 14, 36], y0: 1, additive: false, vary: [0xffa94d, 0xe07a2d, 0x8bc34a] },
  embers:    { n: 90, color: 0xff7b2e, size: 0.22, box: [40, 16, 40], y0: 0, additive: true },
  butterflies:{ n: 18, color: 0xff8fb8, size: 0.38, box: [36, 4, 36], y0: 0.6, additive: false, vary: [0xff8fb8, 0xffd166, 0x9bf6ff, 0xffffff] },
};

class Cloud {
  constructor(scene, def) {
    this.def = def;
    const n = def.n;
    this.pos = new Float32Array(n * 3);
    this.seed = new Float32Array(n);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * def.box[0];
      this.pos[i * 3 + 1] = def.y0 + Math.random() * def.box[1];
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * def.box[2];
      this.seed[i] = Math.random() * 100;
      c.setHex(def.vary ? def.vary[i % def.vary.length] : def.color);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    geo.setAttribute('position', this.attr);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.mat = new THREE.PointsMaterial({ size: def.size, map: DOT, vertexColors: true, transparent: true, opacity: 0, depthWrite: false,
      blending: def.additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.level = 0; // 0..1 fade
  }

  update(dt, t, center, target, kind, ground) {
    this.level += (target - this.level) * Math.min(1, dt * 0.8);
    this.mat.opacity = this.level * (kind === 'fireflies' ? 0.95 : 0.9);
    this.points.visible = this.level > 0.02;
    if (!this.points.visible) return;
    const d = this.def, p = this.pos, out = this.attr.array;
    const hx = d.box[0] / 2, hz = d.box[2] / 2;
    for (let i = 0; i < d.n; i++) {
      const s = this.seed[i];
      let x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      if (kind === 'fireflies') { x += Math.sin(t * 0.7 + s) * dt * 0.6; z += Math.cos(t * 0.6 + s * 1.3) * dt * 0.6; y += Math.sin(t * 1.1 + s) * dt * 0.3; }
      else if (kind === 'leaves') { y -= dt * (0.7 + (s % 1) * 0.6); x += Math.sin(t * 1.5 + s) * dt * 0.8; z += dt * 0.25; if (y < 0) y += d.box[1]; }
      else if (kind === 'embers') { y += dt * (0.8 + (s % 1) * 1.2); x += Math.sin(t * 2 + s) * dt * 0.4; if (y > d.box[1]) y -= d.box[1]; }
      else if (kind === 'butterflies') { x += Math.sin(t * 0.9 + s) * dt * 1.4; z += Math.cos(t * 0.8 + s * 2) * dt * 1.4; y = d.y0 + 0.6 + Math.abs(Math.sin(t * 6 + s)) * 0.5; }
      // particles live in world space; wrap any that leave the box around the camera
      if (x - center.x > hx) x -= d.box[0]; else if (x - center.x < -hx) x += d.box[0];
      if (z - center.z > hz) z -= d.box[2]; else if (z - center.z < -hz) z += d.box[2];
      p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
      out[i * 3] = x; out[i * 3 + 2] = z;
      out[i * 3 + 1] = ground(x, z) + y;
    }
    // fireflies twinkle
    if (kind === 'fireflies') this.mat.size = d.size * (0.85 + Math.sin(t * 3) * 0.15);
    this.attr.needsUpdate = true;
  }
}

export class Ambient {
  constructor(game) {
    this.game = game;
    this.clouds = {};
    for (const [k, def] of Object.entries(SYSTEMS)) this.clouds[k] = new Cloud(game.scene, def);
    this.t = 0;
    this.soundT = 2;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    const zone = g.player.zone;
    const night = g.world.sky.night;
    const day = 1 - night;
    const want = {
      fireflies: (zone === 'meadow' || zone === 'forest' || zone === 'ranch' || zone === 'lakeside') ? night : 0,
      leaves: zone === 'forest' ? 1 : 0,
      embers: zone === 'volcano' ? 1 : 0,
      butterflies: (zone === 'meadow' || zone === 'ranch') ? day : 0,
    };
    const center = g.camera.position;
    const ground = (x, z) => g.world.groundY(x, z);
    for (const [k, c] of Object.entries(this.clouds)) c.update(dt, this.t, center, want[k], k, ground);

    // ambient sounds
    this.soundT -= dt;
    if (this.soundT <= 0 && g.state === 'playing') {
      this.soundT = 2 + Math.random() * 4;
      const a = g.audio;
      if (night > 0.5 && zone !== 'volcano') a.play('cricket', 0.8 + Math.random() * 0.4);
      else if (zone === 'meadow' || zone === 'ranch' || zone === 'forest') a.play('bird', 0.7 + Math.random() * 0.5);
      if (zone === 'lakeside' && Math.random() < 0.6) a.play('waterlap', 1);
      if (zone === 'volcano' && Math.random() < 0.35) a.play('rumble', 1);
      if (zone === 'forest' && Math.random() < 0.4) a.play('leaves', 1);
    }
  }
}
