// Builds the whole world: terrain, sky, the ranch hub, zone decoration, landmarks,
// locked-zone barriers and resource nodes.
import * as THREE from 'three';
import { rng, smoothstep } from '../core/noise.js';
import { buildTerrain, buildWater, groundY, WATER_Y, LAKE, VOLCANO } from './terrain.js';
import { ZONES, WILD_ZONES, HUB_R, ZONE_R, WORLD_R, zoneAt, zoneDir } from './zones.js';
import { Colliders } from './colliders.js';
import { Sky } from './sky.js';
import {
  Batch, G, addTree, addRock, addGrass, addFlowerDecor, addMushroom, addFenceSegment,
  makeBarn, makeHouse, makeShopStall, makeNoticeBoard, makeSign,
} from './props.js';
import { ResourceNodes } from './resources.js';

const faceCenter = (x, z) => Math.atan2(-x, -z);

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = new Colliders();
    this.sky = new Sky(scene);
    this.groundY = groundY;
    this.zoneAt = zoneAt;
    this.barriers = {};
    this.lockSigns = {};
    this.reserved = []; // {x, z, r} spots kept free of random decoration
    this.animated = []; // objects with an update(t, dt)
    this.time = 0;
  }

  build(game) {
    this.game = game;
    const scene = this.scene;
    this.terrain = buildTerrain();
    scene.add(this.terrain);
    this.water = buildWater();
    scene.add(this.water);
    this.resources = new ResourceNodes(this, game);

    this._buildHub(game);
    this._buildLandmarks(game);
    this._buildGates();
    for (const id of WILD_ZONES) this._decorateZone(id);
    this._decorateRidges();
    this._spawnResources();
  }

  // --- helpers ----------------------------------------------------------------

  isFree(x, z, r) {
    for (const s of this.reserved) if (Math.hypot(x - s.x, z - s.z) < s.r + r) return false;
    return true;
  }

  reserve(x, z, r) { this.reserved.push({ x, z, r }); }

  /** Random spot inside a zone. opts: { margin, minR, maxR, water: 'avoid'|'shore', maxSlope, clear } */
  randomSpot(zone, rand, opts = {}) {
    const { minR = ZONE_R + 10, maxR = 292, clear = 1.5, water = 'avoid', maxSlope = 0.9 } = opts;
    for (let tries = 0; tries < 40; tries++) {
      let x, z;
      if (zone === 'ranch') {
        const a = rand() * Math.PI * 2, r = 12 + rand() * (HUB_R - 16);
        x = Math.sin(a) * r; z = -Math.cos(a) * r;
        if (Math.min(Math.abs(x), Math.abs(z)) < 5) continue; // keep paths clear
      } else {
        const base = ZONES[zone].angle;
        const a = base + (rand() - 0.5) * (Math.PI / 2 - 0.22);
        const r = minR + Math.sqrt(rand()) * (maxR - minR);
        x = Math.sin(a) * r; z = -Math.cos(a) * r;
        if (Math.hypot(x, z) < 125 && Math.min(Math.abs(x), Math.abs(z)) < 4) continue; // gate paths
      }
      if (zoneAt(x, z) !== zone) continue;
      const y = groundY(x, z);
      if (water === 'avoid' && y < WATER_Y + 0.5) continue;
      if (water === 'shore' && (y < WATER_Y + 0.1 || y > WATER_Y + 1.4)) continue;
      const slope = Math.abs(groundY(x + 1, z) - groundY(x - 1, z)) + Math.abs(groundY(x, z + 1) - groundY(x, z - 1));
      if (slope > maxSlope * 2) continue;
      if (!this.isFree(x, z, clear)) continue;
      return { x, y, z };
    }
    return null;
  }

  // --- ranch hub --------------------------------------------------------------

  _place(obj, x, z, rot) {
    obj.position.set(x, groundY(x, z), z);
    obj.rotation.y = rot;
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(obj);
    return obj;
  }

  _buildHub(game) {
    const I = game.interactions;
    // farmhouse
    {
      const x = -26, z = -24, rot = faceCenter(x, z);
      const h = makeHouse();
      this._place(h.group, x, z, rot);
      this.colliders.box(x, z, h.hw, h.hd, rot, h.top);
      this.reserve(x, z, 9);
      I.add({ id: 'house', root: h.group, name: 'Farmhouse', sub: 'E  Rest until morning', use: (a) => game.sleep(a) });
    }
    // barn
    {
      const x = 28, z = -26, rot = faceCenter(x, z);
      const b = makeBarn();
      this._place(b.group, x, z, rot);
      this.colliders.box(x, z, b.hw, b.hd, rot, b.top);
      this.reserve(x, z, 12);
      I.add({ id: 'barn', root: b.group, name: 'Big Red Barn', sub: 'Creature storage opens in Stage 4', use: (a) => a.toast('The barn will house your creatures (Stage 4)', 'muted') });
    }
    // shop stall
    {
      const x = -20, z = 20, rot = faceCenter(x, z);
      const s = makeShopStall();
      this._place(s.group, x, z, rot);
      this.colliders.box(x, z, s.hw, s.hd, rot, s.top);
      this.reserve(x, z, 5);
      I.add({ id: 'shop', root: s.group, name: 'Ranch Shop', sub: 'E  Sell resources', use: (a) => game.sellAll(a) });
    }
    // notice board
    {
      const x = 11, z = 11, rot = faceCenter(x, z);
      const nb = makeNoticeBoard();
      this._place(nb, x, z, rot);
      this.colliders.box(x, z, 1.6, 0.3, rot, 3);
      this.reserve(x, z, 3);
      I.add({ id: 'board', root: nb, name: 'Notice Board', sub: 'Requests arrive in Stage 7', use: (a) => a.toast('No requests yet — check back later!', 'muted') });
    }
    // welcome well in the plaza
    {
      const w = new THREE.Group();
      const M = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.2, 1.2, 10, 1, true), M('#b9b9c4')); ring.position.y = 0.6; ring.material.side = THREE.DoubleSide;
      const water = new THREE.Mesh(new THREE.CircleGeometry(1.9, 10), M('#4cc9f0')); water.rotation.x = -Math.PI / 2; water.position.y = 0.8;
      const roof = new THREE.Mesh(G.cone, M('#d64545')); roof.scale.set(5, 1.8, 5); roof.position.y = 4;
      w.add(ring, water, roof);
      for (const s of [-1, 1]) { const p = new THREE.Mesh(G.box, M('#8b5a2b')); p.scale.set(0.25, 3.2, 0.25); p.position.set(s * 1.8, 2.1, 0); w.add(p); }
      this._place(w, 0, 0, 0.3);
      this.colliders.circle(0, 0, 2.3, 1.2);
      this.reserve(0, 0, 6);
      I.add({ id: 'well', root: w, name: 'Wishing Well', sub: 'E  Make a wish', use: (a) => { a.toast('You toss in a pebble. Plink!'); game.worldSound('plink', w.position); } });
    }

    // fence ring with gaps at the four gates
    const fence = new Batch();
    const segs = 64;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const mid = (a0 + a1) / 2;
      let nearGate = false;
      for (const k of [0, Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI * 2]) if (Math.abs(mid - k) < 0.06) nearGate = true;
      if (nearGate) continue;
      const ax = Math.sin(a0) * HUB_R, az = -Math.cos(a0) * HUB_R, bx = Math.sin(a1) * HUB_R, bz = -Math.cos(a1) * HUB_R;
      addFenceSegment(fence, ax, groundY(ax, az), az, bx, groundY(bx, bz), bz);
      this.colliders.segment(ax, az, bx, bz, 0.25, groundY(ax, az) + 1.2);
    }
    this.scene.add(fence.build());

    // a few trees and bushes dotted around the hub
    const rand = rng(77);
    const hub = new Batch();
    for (let i = 0; i < 26; i++) {
      const p = this.randomSpot('ranch', rand, { clear: 3 });
      if (!p) continue;
      if (Math.hypot(p.x, p.z) < 40 && rand() < 0.7) continue; // keep the middle open for building
      const r = addTree(hub, rand() < 0.4 ? 'blossom' : 'round', p.x, p.y, p.z, 0.8 + rand() * 0.4, rand);
      this.colliders.circle(p.x, p.z, r + 0.2, p.y + 6);
      this.reserve(p.x, p.z, 3);
    }
    const grass = new Batch();
    for (let i = 0; i < 260; i++) {
      const p = this.randomSpot('ranch', rand, { clear: 0.5 });
      if (!p) continue;
      if (rand() < 0.25) addFlowerDecor(grass, p.x, p.y, p.z, ['#ff70a6', '#ffd670', '#ffffff', '#c77dff'][i % 4]);
      else addGrass(grass, p.x, p.y, p.z, '#63c255', rand);
    }
    this.scene.add(hub.build(), grass.build({ castShadow: false }));
  }

  // --- gates & barriers --------------------------------------------------------

  _buildGates() {
    const M = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    for (const id of WILD_ZONES) {
      const zone = ZONES[id];
      const d = zoneDir(id);
      const gx = d.x * HUB_R, gz = d.z * HUB_R;
      const rot = Math.atan2(d.x, d.z);
      const gate = new THREE.Group();
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(G.box, M('#8b5a2b')); post.scale.set(0.6, 5.5, 0.6); post.position.set(s * 4.2, 2.75, 0);
        gate.add(post);
        const lx = gx + Math.cos(rot) * s * 4.2, lz = gz - Math.sin(rot) * s * 4.2;
        this.colliders.circle(lx, lz, 0.45, groundY(lx, lz) + 5.5);
      }
      const beam = new THREE.Mesh(G.box, M('#6b3e2e')); beam.scale.set(10, 0.6, 0.7); beam.position.y = 5.6; gate.add(beam);
      const sign = makeSign(zone.name, zone.color, 6.5);
      sign.position.set(0, 4.6, 0.45);
      gate.add(sign);
      const sign2 = sign.clone(); sign2.position.z = -0.45; gate.add(sign2);
      const lock = makeSign(`🔒 Ranch Rating ${zone.rating}`, '#ffe8a3', 4.4);
      lock.position.set(0, 3.1, -0.5);
      gate.add(lock);
      this.lockSigns[id] = lock;
      this._place(gate, gx, gz, rot);
      this.reserve(gx, gz, 8);

      // shimmering barrier arc
      const a = zone.angle;
      const theta = Math.PI - a;
      const geo = new THREE.CylinderGeometry(ZONE_R, ZONE_R, 40, 40, 1, true, theta - Math.PI / 4, Math.PI / 2);
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        uniforms: { time: { value: 0 }, color: { value: new THREE.Color(zone.color) } },
        vertexShader: `varying vec2 vUv; varying float vY; void main(){ vUv = uv; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float time; uniform vec3 color; varying vec2 vUv; varying float vY;
          void main(){
            float band = 0.5 + 0.5 * sin(vUv.x * 220.0 + time * 1.5);
            float wave = 0.5 + 0.5 * sin(vY * 1.2 - time * 2.0 + vUv.x * 30.0);
            float fade = smoothstep(20.0, 2.0, vY) * smoothstep(-20.0, -14.0, vY);
            gl_FragColor = vec4(color, (0.16 + 0.4 * band * wave) * fade);
          }`,
      });
      const barrier = new THREE.Mesh(geo, mat);
      barrier.position.y = 0;
      barrier.renderOrder = 5;
      this.scene.add(barrier);
      this.barriers[id] = barrier;
      this.animated.push((t) => { mat.uniforms.time.value = t; });
    }
  }

  setUnlocked(id, unlocked) {
    if (this.barriers[id]) this.barriers[id].visible = !unlocked;
    if (this.lockSigns[id]) this.lockSigns[id].visible = !unlocked;
  }

  // --- landmarks ---------------------------------------------------------------

  _buildLandmarks(game) {
    const M = (c, e) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...(e || {}) });
    const I = game.interactions;

    // Sunstone Spire (Meadow): climb the spiral stepping stones to the crystal.
    {
      const sx = 46, sz = -205, base = groundY(sx, sz) - 0.5;
      const g = new THREE.Group();
      const H = 16, R = 3.6;
      for (let i = 0; i < 4; i++) {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(R - i * 0.15, R - i * 0.1, H / 4, 9), M(i % 2 ? '#c9b48a' : '#b8a37a'));
        drum.position.y = H / 8 + (i * H) / 4; drum.rotation.y = i * 0.5; g.add(drum);
      }
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), M('#ffe066', { emissive: 0xffb700, emissiveIntensity: 0.8 }));
      crystal.position.y = H + 1.8; crystal.scale.y = 1.6; g.add(crystal);
      this.animated.push((t) => { crystal.rotation.y = t * 0.8; crystal.position.y = H + 1.8 + Math.sin(t * 1.6) * 0.25; });
      g.position.set(sx, base, sz);
      this.scene.add(g);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.colliders.circle(sx, sz, R, base + H);
      const steps = 15;
      for (let i = 0; i < steps; i++) {
        const a = i * 0.62;
        const r = R + 1.5;
        const x = sx + Math.cos(a) * r, z = sz + Math.sin(a) * r;
        const top = base + 1.0 + i * 1.02;
        const st = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.1, 0.6, 7), M('#a2a2ad'));
        st.position.set(x, top - 0.3, z);
        st.castShadow = st.receiveShadow = true;
        this.scene.add(st);
        this.colliders.circle(x, z, 1.25, top, top - 0.6);
      }
      this.reserve(sx, sz, 10);
      I.add({ id: 'spire', root: crystal, name: 'Sunstone Crystal', sub: 'E  Touch the crystal', range: 4,
        use: (a) => game.touchLandmark('spire', 'You feel the warm hum of the Sunstone!', a, crystal.getWorldPosition(new THREE.Vector3())) });
    }

    // Old Stone Arch (Meadow)
    {
      const ax = -70, az = -150, rot = 0.6;
      const g = new THREE.Group();
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(G.box, M('#9a9aa4')); p.scale.set(1.6, 7, 1.6); p.position.set(s * 4, 3.5, 0); g.add(p);
      }
      const top = new THREE.Mesh(G.box, M('#8a8a94')); top.scale.set(11, 1.4, 2); top.position.y = 7.6; g.add(top);
      this._place(g, ax, az, rot);
      const y = groundY(ax, az);
      for (const s of [-1, 1]) this.colliders.circle(ax + Math.cos(rot) * s * 4, az - Math.sin(rot) * s * 4, 1.1, y + 7);
      this.colliders.box(ax, az, 5.5, 1, rot, y + 8.3, y + 6.9);
      this.reserve(ax, az, 8);
    }

    // Elder Stump (Forest)
    {
      const ex = 215, ez = 32, base = groundY(ex, ez) - 0.3;
      const g = new THREE.Group();
      const stump = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 8, 7, 12), M('#7a4a26'));
      stump.position.y = 3.5; g.add(stump);
      const topRing = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, 0.2, 12), M('#e3b779'));
      topRing.position.y = 7.05; g.add(topRing);
      g.position.set(ex, base, ez); this.scene.add(g);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.colliders.circle(ex, ez, 7, base + 7.1);
      for (let i = 0; i < 5; i++) {
        const a = -1.2 + i * 0.7, top = base + 1.4 + i * 1.2;
        const x = ex + Math.cos(a) * 8.6, z = ez + Math.sin(a) * 8.6;
        const shelf = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.2, 0.4, 8), M(i % 2 ? '#ffb38a' : '#ffd6a5'));
        shelf.position.set(x, top - 0.2, z); shelf.castShadow = shelf.receiveShadow = true;
        this.scene.add(shelf);
        this.colliders.circle(x, z, 1.6, top, top - 0.5);
      }
      this.reserve(ex, ez, 13);
    }

    // Lakeside dock + island
    {
      const startZ = LAKE.z - LAKE.r - 2, len = 22;
      const top = Math.max(WATER_Y + 1.0, groundY(0, startZ) + 0.25);
      const g = new THREE.Group();
      const deck = new THREE.Mesh(G.box, M('#c98d4b')); deck.scale.set(3, 0.3, len); deck.position.set(0, top - 0.15, startZ + len / 2); g.add(deck);
      for (let i = 0; i <= 4; i++) for (const s of [-1, 1]) {
        const p = new THREE.Mesh(G.cyl, M('#8b5a2b')); p.scale.set(0.3, 4, 0.3); p.position.set(s * 1.4, top - 2, startZ + (i * len) / 4); g.add(p);
      }
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(g);
      this.colliders.box(0, startZ + len / 2, 1.5, len / 2, 0, top, top - 0.4);
      this.reserve(0, startZ + len / 2, 4);
    }

    // Volcano crater lava glow
    {
      const lava = new THREE.Mesh(new THREE.CircleGeometry(VOLCANO.crater - 2, 16), new THREE.MeshBasicMaterial({ color: 0xff5a1f }));
      lava.rotation.x = -Math.PI / 2;
      const y = groundY(VOLCANO.x, VOLCANO.z) + 1.5;
      lava.position.set(VOLCANO.x, y, VOLCANO.z);
      this.scene.add(lava);
      const glow = new THREE.PointLight(0xff6a00, 400, 60, 2);
      glow.position.set(VOLCANO.x, y + 6, VOLCANO.z);
      this.scene.add(glow);
      this.animated.push((t) => { lava.material.color.setHSL(0.04 + Math.sin(t * 2) * 0.01, 1, 0.5 + Math.sin(t * 3.1) * 0.06); });
      this.reserve(VOLCANO.x, VOLCANO.z, 20);
    }
  }

  // --- zone decoration ---------------------------------------------------------

  _decorateZone(id) {
    const rand = rng({ meadow: 11, forest: 22, lakeside: 33, volcano: 44 }[id]);
    const big = new Batch();
    const small = new Batch();
    const cfg = {
      meadow: { trees: 70, styles: ['round', 'round', 'blossom', 'birch'], grass: 1100, grassCol: '#7fd34e', flowers: 360, rocks: 40, rockCol: '#a2a2ad' },
      forest: { trees: 300, styles: ['pine', 'pine', 'round', 'birch'], grass: 650, grassCol: '#3f9b4a', flowers: 60, rocks: 45, rockCol: '#8d8f86', shrooms: 90 },
      lakeside: { trees: 70, styles: ['palm', 'palm', 'birch'], grass: 650, grassCol: '#6fd08a', flowers: 150, rocks: 35, rockCol: '#b5b0a0' },
      volcano: { trees: 55, styles: ['charred'], grass: 220, grassCol: '#8a7a4a', flowers: 0, rocks: 140, rockCol: '#5a4a45' },
    }[id];

    for (let i = 0; i < cfg.trees; i++) {
      const p = this.randomSpot(id, rand, { clear: 2.5, maxSlope: 1.2 });
      if (!p) continue;
      if (id === 'volcano' && Math.hypot(p.x - VOLCANO.x, p.z - VOLCANO.z) < 45) continue;
      const style = cfg.styles[Math.floor(rand() * cfg.styles.length)];
      const s = 0.8 + rand() * 0.6;
      const r = addTree(big, style, p.x, p.y - 0.2, p.z, s, rand);
      this.colliders.circle(p.x, p.z, r + 0.15, p.y + 6 * s);
      this.reserve(p.x, p.z, 2);
    }
    for (let i = 0; i < cfg.rocks; i++) {
      const p = this.randomSpot(id, rand, { clear: 1.5, maxSlope: 2 });
      if (!p) continue;
      const s = 0.6 + rand() * (id === 'volcano' ? 2.6 : 1.6);
      addRock(big, p.x, p.y - 0.2, p.z, s, cfg.rockCol, rand);
      if (s > 1.2) { this.colliders.circle(p.x, p.z, s * 0.6, p.y + s * 0.65); this.reserve(p.x, p.z, s * 0.7); }
    }
    for (let i = 0; i < cfg.grass; i++) {
      const p = this.randomSpot(id, rand, { clear: 0.3, maxSlope: 2 });
      if (p) addGrass(small, p.x, p.y, p.z, cfg.grassCol, rand);
    }
    const fc = ['#ff70a6', '#ffd670', '#70d6ff', '#e9ff70', '#c77dff', '#ffffff'];
    for (let i = 0; i < cfg.flowers; i++) {
      const p = this.randomSpot(id, rand, { clear: 0.3, maxSlope: 2 });
      if (p) addFlowerDecor(small, p.x, p.y, p.z, fc[Math.floor(rand() * fc.length)]);
    }
    for (let i = 0; i < (cfg.shrooms || 0); i++) {
      const p = this.randomSpot(id, rand, { clear: 0.5 });
      if (p) addMushroom(small, p.x, p.y, p.z, 0.4 + rand() * 0.6, rand() < 0.5 ? '#ff6b6b' : '#b388ff');
    }
    if (id === 'lakeside') {
      // reeds on the shore and lily pads on the water
      for (let i = 0; i < 260; i++) {
        const p = this.randomSpot(id, rand, { clear: 0.2, water: 'shore', minR: 120 });
        if (!p) continue;
        for (let k = 0; k < 3; k++) small.add(G.cylLow, '#5c9e4a', p.x + (rand() - 0.5) * 0.6, p.y + 0.9, p.z + (rand() - 0.5) * 0.6, (rand() - 0.5) * 0.2, 0, (rand() - 0.5) * 0.2, 0.08, 1.8 + rand(), 0.08);
      }
      for (let i = 0; i < 40; i++) {
        const a = rand() * Math.PI * 2, r = 10 + rand() * (LAKE.r - 14);
        const x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r;
        if (groundY(x, z) > WATER_Y - 0.3) continue;
        small.add(G.cyl, '#3fae4f', x, WATER_Y + 0.03, z, 0, rand() * 6, 0, 1.3 + rand(), 0.05, 1.3 + rand());
        if (rand() < 0.3) small.add(G.ico, '#ff9fc7', x, WATER_Y + 0.25, z, 0, 0, 0, 0.4);
      }
    }
    this.scene.add(big.build(), small.build({ castShadow: false }));
  }

  _decorateRidges() {
    const rand = rng(99);
    const b = new Batch();
    for (let i = 0; i < 220; i++) {
      const diag = [Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 4, (-3 * Math.PI) / 4][i % 4];
      const r = 110 + rand() * 200;
      const a = diag + (rand() - 0.5) * (14 / r) * 2;
      const x = Math.sin(a) * r, z = -Math.cos(a) * r;
      const y = groundY(x, z);
      if (rand() < 0.5) {
        const rr = addTree(b, 'pine', x, y - 0.3, z, 0.9 + rand() * 0.5, rand);
        this.colliders.circle(x, z, rr + 0.1, y + 7);
      } else addRock(b, x, y - 0.3, z, 1 + rand() * 2, '#9a9aa4', rand);
    }
    // edge-of-world mountains get pines too
    for (let i = 0; i < 260; i++) {
      const a = rand() * Math.PI * 2, r = 305 + rand() * 50;
      const x = Math.sin(a) * r, z = -Math.cos(a) * r;
      const y = groundY(x, z);
      if (y < 40) addTree(b, 'pine', x, y - 0.3, z, 1 + rand() * 0.8, rand);
    }
    this.scene.add(b.build());
  }

  // --- resources -----------------------------------------------------------------

  _spawnResources() {
    const plan = {
      ranch: { berry: 4, flower: 4, rock: 2, log: 2 },
      meadow: { berry: 16, glow: 6, flower: 22, rock: 9, log: 6 },
      forest: { berry: 8, glow: 8, flower: 6, rock: 7, log: 14, mushroom: 12 },
      lakeside: { berry: 8, flower: 12, rock: 8, log: 6, shell: 14 },
      volcano: { rock: 12, ember: 12, flower: 3, log: 3 },
    };
    const rand = rng(1234);
    for (const [zone, counts] of Object.entries(plan)) {
      for (const [type, n] of Object.entries(counts)) {
        for (let i = 0; i < n; i++) {
          const opts = { clear: 2.5 };
          if (type === 'shell') { opts.water = 'shore'; opts.minR = 120; opts.clear = 1; }
          if (zone === 'meadow') opts.maxR = 270;
          const p = this.randomSpot(zone, rand, opts);
          if (!p) continue;
          if (zone === 'ranch' && Math.hypot(p.x, p.z) < 38) { i--; continue; }
          this.resources.spawn(type, p.x, p.z, rand, zone);
          this.reserve(p.x, p.z, 2);
        }
      }
    }
    // island glowberry
    this.resources.spawn('glow', LAKE.x + 18, LAKE.z + 10, rand, 'lakeside');
  }

  update(dt, focus) {
    this.time += dt;
    this.sky.update(focus);
    this.resources.update(dt, this.sky.night, focus);
    for (const f of this.animated) f(this.time, dt);
  }
}

export { smoothstep, WORLD_R };
