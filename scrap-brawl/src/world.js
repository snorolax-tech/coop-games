// The arena (fight) and the junkyard (build phase) live in the same scene, far apart.
import * as THREE from 'three';
import { makePartMesh, mat } from './parts.js';

export const ARENA_R = 30;
export const WALL_H = 10;
export const LAVA = [{ x: 17, z: 0, r: 3.6 }, { x: -17, z: 0, r: 3.6 }];
export const CRUSHER_HALF = 3.5;
export const JUNK = new THREE.Vector3(260, 0, 0);
export const BELT_START = -15, BELT_END = 15;
export const PODIUM_Z = 7.5;
export const SPAWNS = [{ x: 0, z: 21, yaw: Math.PI }, { x: 0, z: -21, yaw: 0 }];

function gridTexture(base, line, n = 8) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = line; g.lineWidth = 3;
  for (let i = 0; i <= n; i++) { const p = i * 256 / n; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 256); g.moveTo(0, p); g.lineTo(256, p); g.stroke(); }
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * 256, Math.random() * 256, 4, 4); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function stripeTexture(a, b) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = a; g.fillRect(0, 0, 64, 64); g.fillStyle = b;
  for (let i = -64; i < 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 - 64, 64); g.lineTo(i - 64, 64); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    scene.background = new THREE.Color(0x87a7c4);
    scene.fog = new THREE.Fog(0x87a7c4, 70, 160);
    scene.add(new THREE.HemisphereLight(0xdde8ff, 0x5a4a3a, 1.4));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
    sun.position.set(25, 45, 15); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 120 });
    scene.add(sun, sun.target);
    this.sun = sun;
    this.t = 0;
    this.buildArena();
    this.buildJunkyard();
    this.beltMeshes = new Map();
    this.pickupMeshes = new Map();
    this.hovered = null;
  }

  /** move the shadow camera to where the action is */
  focus(p) { this.sun.position.set(p.x + 25, 45, p.z + 15); this.sun.target.position.set(p.x, 0, p.z); }

  buildArena() {
    const s = this.scene;
    const ft = gridTexture('#7d7f84', '#6a6c70'); ft.repeat.set(6, 6);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_R, ARENA_R, 1, 48), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.9 }));
    floor.position.y = -0.5; floor.receiveShadow = true; s.add(floor);
    const outer = new THREE.Mesh(new THREE.CircleGeometry(200, 32), mat(0x6b5d4c, { metalness: 0 }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -1.2; s.add(outer);
    const wt = gridTexture('#4a4f57', '#3a3e45', 6); wt.repeat.set(12, 1);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_R + 0.3, ARENA_R + 0.3, WALL_H, 48, 1, true),
      new THREE.MeshStandardMaterial({ map: wt, side: THREE.BackSide, roughness: 0.8 }));
    wall.position.y = WALL_H / 2; wall.receiveShadow = true; s.add(wall);
    const st = stripeTexture('#f2c230', '#222'); st.repeat.set(60, 1);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_R + 0.35, ARENA_R + 0.35, 0.8, 48, 1, true),
      new THREE.MeshStandardMaterial({ map: st, side: THREE.DoubleSide }));
    rim.position.y = WALL_H - 0.4; s.add(rim);
    // stands / crowd blocks outside
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.BoxGeometry(7, 6 + (i % 3) * 2, 4), mat([0x5a6270, 0x6c5a4a, 0x50606a][i % 3], { metalness: 0.1 }));
      b.position.set(Math.cos(a) * (ARENA_R + 5), 2, Math.sin(a) * (ARENA_R + 5)); b.rotation.y = -a; s.add(b);
    }
    // lava pits
    this.lavaMats = [];
    for (const L of LAVA) {
      const m = new THREE.MeshStandardMaterial({ color: 0xff5a10, emissive: 0xff3300, emissiveIntensity: 1.2 });
      const pit = new THREE.Mesh(new THREE.CircleGeometry(L.r, 24), m);
      pit.rotation.x = -Math.PI / 2; pit.position.set(L.x, 0.03, L.z); s.add(pit);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(L.r, 0.25, 6, 24), mat(0x333333));
      ring.rotation.x = Math.PI / 2; ring.position.set(L.x, 0.05, L.z); s.add(ring);
      const light = new THREE.PointLight(0xff5500, 30, 12); light.position.set(L.x, 1.5, L.z); s.add(light);
      this.lavaMats.push(m);
    }
    // crusher
    const ht = stripeTexture('#f2c230', '#222'); ht.repeat.set(4, 4);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(CRUSHER_HALF * 2, 0.1, CRUSHER_HALF * 2), new THREE.MeshStandardMaterial({ map: ht }));
    plate.position.y = 0.04; plate.receiveShadow = true; s.add(plate);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 14, 0.7), mat(0x444a52));
      p.position.set(x * (CRUSHER_HALF + 0.5), 7, z * (CRUSHER_HALF + 0.5)); p.castShadow = true; s.add(p);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(CRUSHER_HALF * 2 + 2, 1, CRUSHER_HALF * 2 + 2), mat(0x444a52));
    top.position.y = 14.2; s.add(top);
    this.pressMat = new THREE.MeshStandardMaterial({ color: 0x77808a, flatShading: true, metalness: 0.6, roughness: 0.4 });
    this.press = new THREE.Mesh(new THREE.BoxGeometry(CRUSHER_HALF * 2 - 0.2, 2, CRUSHER_HALF * 2 - 0.2), this.pressMat);
    this.press.castShadow = true; this.press.position.y = 11; s.add(this.press);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 14, 8), mat(0xbbbbbb, { metalness: 0.9 }));
    rod.position.y = 7; this.press.add(rod);
    // the big magnet overhead
    this.magnet = new THREE.Group(); this.magnet.position.y = 26;
    this.magnetMat = new THREE.MeshStandardMaterial({ color: 0xd8312b, flatShading: true, metalness: 0.4, roughness: 0.5 });
    const u = new THREE.Mesh(new THREE.TorusGeometry(3, 1.1, 8, 20, Math.PI), this.magnetMat);
    u.rotation.z = Math.PI; this.magnet.add(u);
    for (const x of [-3, 3]) { const t = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.2, 2.3), mat(0xdddddd)); t.position.set(x, -0.5, 0); this.magnet.add(t); }
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 30, 6), mat(0x222222)); cable.position.y = 18; this.magnet.add(cable);
    s.add(this.magnet);
    this.magnetRings = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(1, 1.4, 40), new THREE.MeshBasicMaterial({ color: 0x77ccff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.position.y = 0.15; r.visible = false; s.add(r); this.magnetRings.push(r);
    }
  }

  buildJunkyard() {
    const s = this.scene;
    const J = JUNK;
    const gt = gridTexture('#7a6448', '#6d583e', 10); gt.repeat.set(4, 4);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.copy(J); ground.receiveShadow = true; s.add(ground);
    // conveyor belt
    this.beltTex = stripeTexture('#2e3136', '#3d4147'); this.beltTex.repeat.set(16, 1);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(BELT_END - BELT_START + 2, 1.2, 3.2),
      [mat(0x444a52), mat(0x444a52), new THREE.MeshStandardMaterial({ map: this.beltTex }), mat(0x444a52), mat(0x555b63), mat(0x555b63)]);
    belt.position.set(J.x, 0.6, J.z); belt.receiveShadow = true; belt.castShadow = true; s.add(belt);
    for (const z of [-1.7, 1.7]) { const r = new THREE.Mesh(new THREE.BoxGeometry(BELT_END - BELT_START + 2, 0.3, 0.2), mat(0xf2c230)); r.position.set(J.x, 1.3, J.z + z); s.add(r); }
    // chute (spawn) + scrap pit (end)
    const chute = new THREE.Mesh(new THREE.BoxGeometry(3, 6, 4), mat(0x5a4030)); chute.position.set(J.x + BELT_START - 2.5, 3, J.z); chute.castShadow = true; s.add(chute);
    const pit = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 5), mat(0x111111)); pit.position.set(J.x + BELT_END + 3, 0.02, J.z); s.add(pit);
    // podiums
    this.podiums = [];
    for (const [i, z] of [[0, PODIUM_Z], [1, -PODIUM_Z]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.6, 0.5, 16), mat(i ? 0x3dd6c6 : 0xff8a3d));
      p.position.set(J.x, 0.25, J.z + z); p.receiveShadow = true; s.add(p); this.podiums.push(p);
    }
    // scrap piles for decoration
    const rng = mulberry(7);
    for (let i = 0; i < 70; i++) {
      const a = rng() * Math.PI * 2, d = 18 + rng() * 14;
      const x = Math.cos(a) * d * 1.3, z = Math.sin(a) * d;
      const sz = 0.6 + rng() * 2.2;
      const m = rng() < 0.5 ? new THREE.Mesh(new THREE.BoxGeometry(sz, sz * 0.7, sz * 1.2), mat([0x7a4a2a, 0x5a6270, 0x8d939c, 0x6a3a22][i % 4]))
        : new THREE.Mesh(new THREE.TorusGeometry(sz * 0.5, sz * 0.22, 6, 10), mat(0x1e1e1e));
      m.position.set(J.x + x, sz * 0.3, J.z + z); m.rotation.set(rng() * 3, rng() * 3, rng() * 3); m.castShadow = true; s.add(m);
    }
    this.beltGroup = new THREE.Group(); s.add(this.beltGroup);
    this.pickupGroup = new THREE.Group(); s.add(this.pickupGroup);
  }

  podiumPose(i) { return { x: JUNK.x, y: 0.5, z: JUNK.z + (i ? -PODIUM_Z : PODIUM_Z), yaw: i ? 0 : Math.PI, a: { gr: true } }; }

  /** keep belt meshes in sync with state; advance positions locally between snapshots */
  syncBelt(items, dt, beltSpeed) {
    const seen = new Set();
    for (const it of items || []) {
      seen.add(it.id);
      let m = this.beltMeshes.get(it.id);
      if (!m) {
        m = new THREE.Group();
        const part = makePartMesh(it.part, 0xa0582c);
        part.scale.setScalar(1.05);
        m.add(part);
        m.userData = { itemId: it.id, part: it.part, x: it.x, spin: Math.random() * 6 };
        part.traverse((o) => { o.userData.itemId = it.id; });
        this.beltGroup.add(m);
        this.beltMeshes.set(it.id, m);
      }
      // correct towards authoritative x, otherwise move with the belt
      m.userData.x += beltSpeed * dt;
      if (Math.abs(m.userData.x - it.x) > 0.6) m.userData.x = it.x; else m.userData.x += (it.x - m.userData.x) * Math.min(1, dt * 5);
      const hov = this.hovered === it.id;
      m.position.set(JUNK.x + m.userData.x, 1.6 + (hov ? 0.4 : 0) + Math.sin(this.t * 3 + m.userData.spin) * 0.08, JUNK.z);
      m.rotation.y = m.userData.spin + this.t * 0.6;
      m.scale.setScalar(hov ? 1.25 : 1);
    }
    for (const [id, m] of this.beltMeshes) if (!seen.has(id)) { this.beltGroup.remove(m); this.beltMeshes.delete(id); }
  }

  syncPickups(list) {
    const seen = new Set();
    for (const p of list || []) {
      seen.add(p.id);
      let m = this.pickupMeshes.get(p.id);
      if (!m) {
        m = new THREE.Group();
        const part = makePartMesh(p.part, 0xa0582c); part.scale.setScalar(0.9); m.add(part);
        const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 24), new THREE.MeshBasicMaterial({ color: 0xffee55, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = -0.9; m.add(ring);
        m.userData.spin = Math.random() * 6;
        this.pickupGroup.add(m); this.pickupMeshes.set(p.id, m);
      }
      m.position.set(p.x, 1 + Math.sin(this.t * 3 + m.userData.spin) * 0.2, p.z);
      m.rotation.y = this.t * 1.5 + m.userData.spin;
    }
    for (const [id, m] of this.pickupMeshes) if (!seen.has(id)) { this.pickupGroup.remove(m); this.pickupMeshes.delete(id); }
  }

  /** hazard visuals from the authoritative state */
  update(dt, st) {
    this.t += dt;
    this.beltTex.offset.x -= dt * 0.55;
    for (const m of this.lavaMats) m.emissiveIntensity = 1 + Math.sin(this.t * 3) * 0.25;
    const cr = st?.cr || { y: 11, warn: false };
    this.press.position.y += (cr.y - this.press.position.y) * Math.min(1, dt * 25);
    this.pressMat.emissive.setHex(cr.warn && Math.floor(this.t * 8) % 2 ? 0x992200 : 0x000000);
    const mg = st?.mg || {};
    this.magnet.position.y = 26 - (mg.on ? 4 : 0) + Math.sin(this.t * 1.5) * 0.3;
    this.magnet.rotation.y += dt * (mg.on ? 3 : 0.2);
    this.magnetMat.emissive.setHex((mg.on || (mg.warn && Math.floor(this.t * 6) % 2)) ? 0x661111 : 0);
    this.magnetRings.forEach((r, i) => {
      r.visible = !!mg.on;
      if (mg.on) { const k = ((this.t * 0.8 + i / 3) % 1); const sc = (1 - k) * 26 + 1; r.scale.setScalar(sc); r.material.opacity = 0.6 * k; }
    });
  }
}

export function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
