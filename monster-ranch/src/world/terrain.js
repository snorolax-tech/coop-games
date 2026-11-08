// Heightfield terrain covering the whole world. The analytic height function shapes the
// zones; the mesh is sampled from it on a grid and `groundY` interpolates that grid exactly
// the way the GPU draws it, so feet always touch the visible ground.
import * as THREE from 'three';
import { fbm, smoothstep, angDiff, clamp } from '../core/noise.js';
import { ZONES, WILD_ZONES, HUB_R } from './zones.js';

export const SIZE = 760;
export const SEGS = 240;
const STEP = SIZE / SEGS;
export const WATER_Y = -2.2;
export const LAKE = { x: 0, z: 215, r: 62 };
export const VOLCANO = { x: -228, z: 0, r: 115, h: 62, crater: 15 };

// --- analytic shape -------------------------------------------------------

function zoneWeights(x, z) {
  const ang = Math.atan2(x, -z);
  const w = {};
  let sum = 0;
  for (const id of WILD_ZONES) {
    const d = Math.abs(angDiff(ang, ZONES[id].angle));
    const v = smoothstep(Math.PI / 4 + 0.16, Math.PI / 4 - 0.16, d);
    w[id] = v; sum += v;
  }
  for (const id of WILD_ZONES) w[id] /= sum || 1;
  return w;
}

function zoneHeight(id, x, z) {
  switch (id) {
    case 'meadow':
      return fbm(x * 0.011, z * 0.011, 4, 1) * 8 + fbm(x * 0.04, z * 0.04, 2, 2) * 1.2 + 1.5;
    case 'forest':
      return fbm(x * 0.009, z * 0.009, 4, 3) * 11 + fbm(x * 0.05, z * 0.05, 2, 4) * 1.5 + 3;
    case 'lakeside': {
      let h = fbm(x * 0.01, z * 0.01, 3, 5) * 4 + 1.2;
      const d = Math.hypot(x - LAKE.x, z - LAKE.z);
      h -= 10 * smoothstep(LAKE.r + 18, LAKE.r - 22, d);
      // little island in the lake
      const di = Math.hypot(x - (LAKE.x + 18), z - (LAKE.z + 10));
      h += 11 * smoothstep(13, 3, di);
      return h;
    }
    case 'volcano': {
      let h = fbm(x * 0.012, z * 0.012, 4, 6) * 6 + 2;
      const d = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
      h += VOLCANO.h * Math.pow(Math.max(0, 1 - d / VOLCANO.r), 1.5);
      if (d < VOLCANO.crater) h -= (VOLCANO.crater - d) * 1.6;
      return h;
    }
  }
  return 0;
}

export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const hub = smoothstep(HUB_R - 2, HUB_R + 34, r); // 0 in hub, 1 in the wilds
  let h = 0;
  if (hub > 0) {
    const w = zoneWeights(x, z);
    let zh = 0;
    for (const id of WILD_ZONES) if (w[id] > 0.001) zh += w[id] * zoneHeight(id, x, z);
    // ridges along the diagonals separate the zones (climbable hills, not walls)
    const ang = Math.atan2(x, -z);
    let dAng = Infinity;
    for (const diag of [Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 4, (-3 * Math.PI) / 4]) {
      dAng = Math.min(dAng, Math.abs(angDiff(ang, diag)));
    }
    const lateral = r * Math.sin(Math.min(dAng, Math.PI / 2));
    const ridge = 16 * Math.exp(-((lateral / 16) ** 2)) * smoothstep(90, 160, r) * (0.8 + 0.4 * fbm(x * 0.03, z * 0.03, 2, 9));
    h = hub * (zh + ridge);
  }
  // mountains at the world edge
  h += smoothstep(300, 375, r) * (55 + 20 * fbm(x * 0.02, z * 0.02, 3, 11));
  return h;
}

// Ground colour by position (vertex colours of the terrain mesh).
const C = (hex) => new THREE.Color(hex);
const PAL = {
  hub: C('#7fd36b'), path: C('#d9b77a'),
  meadow: C('#9be15d'), meadowB: C('#c8e86b'),
  forest: C('#3f9b4a'), forestB: C('#2f7d3f'),
  lake: C('#76d18f'), sand: C('#f1dca0'), lakebed: C('#6fb6a8'),
  volcano: C('#7a5c4f'), volcanoB: C('#4e3b36'), ash: C('#3a2f2e'), lava: C('#ff6a2a'),
  rock: C('#9a9aa4'), snow: C('#f4f7ff'),
};
const tmp = new THREE.Color();

function colorAt(x, z, h, out) {
  const r = Math.hypot(x, z);
  const hub = smoothstep(HUB_R - 2, HUB_R + 34, r);
  const n = fbm(x * 0.05, z * 0.05, 2, 21) * 0.5 + 0.5;
  // hub base + dirt paths toward the four gates
  out.copy(PAL.hub).lerp(PAL.meadowB, n * 0.25);
  const pathW = Math.min(Math.abs(x), Math.abs(z));
  if (r < 125 && r > 9 && pathW < 3.2) out.lerp(PAL.path, smoothstep(3.2, 2.0, pathW) * smoothstep(125, 95, r));
  if (r < 9 && r > 6.5) out.copy(PAL.path);

  if (hub > 0) {
    const w = zoneWeights(x, z);
    tmp.setRGB(0, 0, 0);
    const add = (c, k) => { tmp.r += c.r * k; tmp.g += c.g * k; tmp.b += c.b * k; };
    const cm = PAL.meadow.clone().lerp(PAL.meadowB, n);
    const cf = PAL.forest.clone().lerp(PAL.forestB, n);
    let cl = PAL.lake.clone().lerp(PAL.meadowB, n * 0.3);
    if (h < WATER_Y + 1.6) cl = PAL.sand.clone();
    if (h < WATER_Y - 0.4) cl = PAL.lakebed.clone();
    let cv = PAL.volcano.clone().lerp(PAL.volcanoB, n);
    const dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
    cv.lerp(PAL.ash, smoothstep(70, 30, dv));
    if (dv < VOLCANO.crater + 2) cv.lerp(PAL.lava, smoothstep(VOLCANO.crater + 2, VOLCANO.crater - 4, dv));
    add(cm, w.meadow); add(cf, w.forest); add(cl, w.lakeside); add(cv, w.volcano);
    // keep the gate paths going a bit into each zone
    const pathMix = (r < 125 && pathW < 3.2) ? smoothstep(3.2, 2.0, pathW) * smoothstep(125, 95, r) : 0;
    tmp.lerp(PAL.path, pathMix);
    out.lerp(tmp, hub);
  }
  // rocky / snowy mountains
  const edge = smoothstep(305, 335, r);
  if (edge > 0) out.lerp(PAL.rock, edge);
  if (h > 48) out.lerp(PAL.snow, smoothstep(48, 62, h) * edge);
  return out;
}

// --- mesh + exact sampling ------------------------------------------------

const grid = new Float32Array((SEGS + 1) * (SEGS + 1));

export function buildTerrain() {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const ix = Math.round((x + SIZE / 2) / STEP), iz = Math.round((z + SIZE / 2) / STEP);
    grid[iz * (SEGS + 1) + ix] = h;
    colorAt(x, z, h, col);
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

function g(ix, iz) {
  ix = clamp(ix, 0, SEGS); iz = clamp(iz, 0, SEGS);
  return grid[iz * (SEGS + 1) + ix];
}

/** Exact height of the rendered terrain surface at (x, z). */
export function groundY(x, z) {
  const fx = (x + SIZE / 2) / STEP, fz = (z + SIZE / 2) / STEP;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const u = fx - ix, v = fz - iz;
  const ha = g(ix, iz), hb = g(ix, iz + 1), hc = g(ix + 1, iz + 1), hd = g(ix + 1, iz);
  // PlaneGeometry splits each cell along the b-d diagonal
  if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
  return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
}

/** Approximate surface normal (for bouncing thrown things). */
export function groundNormal(x, z, out = new THREE.Vector3()) {
  const e = 0.6;
  const hx = groundY(x + e, z) - groundY(x - e, z);
  const hz = groundY(x, z + e) - groundY(x, z - e);
  return out.set(-hx, 2 * e, -hz).normalize();
}

export function buildWater() {
  const geo = new THREE.CircleGeometry(LAKE.r + 30, 48);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.72, emissive: 0x0a3550 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(LAKE.x, WATER_Y, LAKE.z);
  m.name = 'water';
  return m;
}
