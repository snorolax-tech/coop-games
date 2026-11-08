// Low-poly prop builders. Static decoration is baked into big merged meshes with vertex
// colours (one material, few draw calls). Interactive things build their own small groups.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

/** Collects coloured, transformed geometry pieces and merges them into meshes. */
export class Batch {
  constructor() { this.parts = []; }

  /** Add geometry with a colour, transformed by position/rotation/scale. */
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
      new THREE.Vector3(sx, sy, sz),
    );
    g.applyMatrix4(m);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    // small per-piece brightness jitter keeps big batches from looking flat
    const j = 0.94 + Math.random() * 0.12;
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r * j; arr[i * 3 + 1] = c.g * j; arr[i * 3 + 2] = c.b * j; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts.push(g);
    return this;
  }

  /** Add a pre-built group (meshes with MeshLambert/Standard materials) baked with its colours. */
  addGroup(group) {
    group.updateMatrixWorld(true);
    group.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.deleteAttribute('uv');
      g.applyMatrix4(o.matrixWorld);
      const c = o.material.color || new THREE.Color(0xffffff);
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      this.parts.push(g);
    });
  }

  build({ castShadow = true, receiveShadow = true } = {}) {
    if (!this.parts.length) return new THREE.Group();
    const geo = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, flatMat);
    mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
    return mesh;
  }
}

// Shared primitive geometries (cloned on add).
export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cylLow: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 7),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  ico1: new THREE.IcosahedronGeometry(0.5, 1),
  dodec: new THREE.DodecahedronGeometry(0.5, 0),
  sphere: new THREE.SphereGeometry(0.5, 10, 8),
  prism: (() => { // triangular roof prism, 1x1x1, ridge along z
    const s = new THREE.Shape();
    s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 0.5); s.lineTo(-0.5, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
    g.translate(0, 0, -0.5);
    return g;
  })(),
};

// --- trees / plants --------------------------------------------------------

export const TREE_STYLES = {
  round: { trunk: '#8b5a2b', leaves: ['#5cc55a', '#74d16a', '#4fb34f'] },
  pine: { trunk: '#6d4424', leaves: ['#2f8f4e', '#277a43', '#3a9d58'] },
  birch: { trunk: '#efe9dc', leaves: ['#a8e063', '#c3ec7a', '#93d356'] },
  palm: { trunk: '#b08150', leaves: ['#4fcf74', '#63dd84'] },
  charred: { trunk: '#3b2b26', leaves: ['#5a4038', '#6b4a3a'] },
  blossom: { trunk: '#8b5a2b', leaves: ['#ffb7d5', '#ffc9e0', '#ff9fc7'] },
};

/** Adds a tree to a batch. Returns trunk radius for collisions. */
export function addTree(batch, style, x, y, z, s = 1, rand = Math.random) {
  const st = TREE_STYLES[style];
  const leaf = () => st.leaves[Math.floor(rand() * st.leaves.length)];
  const ry = rand() * Math.PI * 2;
  if (style === 'pine') {
    const h = 7 * s;
    batch.add(G.cyl, st.trunk, x, y + h * 0.2, z, 0, 0, 0, 0.55 * s, h * 0.4, 0.55 * s);
    for (let i = 0; i < 3; i++) {
      const w = (3.6 - i * 0.9) * s;
      batch.add(G.cone, leaf(), x, y + h * (0.35 + i * 0.2), z, 0, ry + i, 0, w, h * 0.4, w);
    }
    return 0.4 * s;
  }
  if (style === 'palm') {
    const h = 6 * s;
    for (let i = 0; i < 5; i++) {
      batch.add(G.cyl, st.trunk, x + i * 0.12 * s, y + (i + 0.5) * h / 5, z, 0, 0, -0.06, 0.45 * s - i * 0.04 * s, h / 5 + 0.05, 0.45 * s - i * 0.04 * s);
    }
    for (let i = 0; i < 6; i++) {
      const a = ry + (i / 6) * Math.PI * 2;
      batch.add(G.box, leaf(), x + 0.6 * s + Math.sin(a) * 1.4 * s, y + h, z + Math.cos(a) * 1.4 * s, 0.35, a, 0, 0.9 * s, 0.12 * s, 3 * s);
    }
    return 0.35 * s;
  }
  if (style === 'charred') {
    const h = 4.5 * s;
    batch.add(G.cylLow, st.trunk, x, y + h / 2, z, 0, ry, 0.08, 0.5 * s, h, 0.5 * s);
    batch.add(G.cylLow, st.trunk, x + 0.6 * s, y + h * 0.7, z, 0, ry, -0.9, 0.22 * s, 1.8 * s, 0.22 * s);
    batch.add(G.cylLow, st.trunk, x - 0.5 * s, y + h * 0.55, z, 0, ry, 0.9, 0.2 * s, 1.5 * s, 0.2 * s);
    return 0.35 * s;
  }
  // round / birch / blossom
  const h = (style === 'birch' ? 6.5 : 5) * s;
  batch.add(G.cyl, st.trunk, x, y + h * 0.35, z, 0, 0, 0, 0.6 * s, h * 0.7, 0.6 * s);
  const blobs = style === 'birch' ? 3 : 4;
  for (let i = 0; i < blobs; i++) {
    const a = ry + i * 2.1, rr = i === 0 ? 0 : 1.1 * s;
    const sz = (i === 0 ? 3.6 : 2.6) * s;
    batch.add(G.ico, leaf(), x + Math.sin(a) * rr, y + h * 0.75 + (i === 0 ? 0.6 * s : rand() * 0.8 * s), z + Math.cos(a) * rr, rand(), rand(), 0, sz, sz * 0.9, sz);
  }
  return 0.45 * s;
}

export function addRock(batch, x, y, z, s = 1, color = '#a2a2ad', rand = Math.random) {
  batch.add(G.dodec, color, x, y + s * 0.25, z, rand() * 3, rand() * 3, rand() * 3, s * (1 + rand() * 0.4), s * (0.7 + rand() * 0.3), s * (1 + rand() * 0.4));
}

export function addGrass(batch, x, y, z, color, rand = Math.random) {
  for (let i = 0; i < 3; i++) {
    const a = rand() * Math.PI * 2;
    batch.add(G.cone, color, x + Math.sin(a) * 0.15, y + 0.25, z + Math.cos(a) * 0.15, (rand() - 0.5) * 0.5, a, (rand() - 0.5) * 0.5, 0.12, 0.6 + rand() * 0.4, 0.12);
  }
}

export function addFlowerDecor(batch, x, y, z, color) {
  batch.add(G.cylLow, '#3f9b4a', x, y + 0.2, z, 0, 0, 0, 0.05, 0.4, 0.05);
  batch.add(G.ico, color, x, y + 0.45, z, 0, 0, 0, 0.22, 0.12, 0.22);
  batch.add(G.ico, '#fff3b0', x, y + 0.5, z, 0, 0, 0, 0.08);
}

export function addMushroom(batch, x, y, z, s = 1, cap = '#ff5d5d') {
  batch.add(G.cyl, '#f6eedd', x, y + 0.35 * s, z, 0, 0, 0, 0.3 * s, 0.7 * s, 0.3 * s);
  batch.add(G.sphere, cap, x, y + 0.75 * s, z, 0, 0, 0, 1.1 * s, 0.6 * s, 1.1 * s);
}

// --- buildings ---------------------------------------------------------------

export function addFenceSegment(batch, ax, ay, az, bx, by, bz, color = '#c98d4b') {
  const len = Math.hypot(bx - ax, bz - az);
  const ang = Math.atan2(bx - ax, bz - az);
  const posts = Math.max(1, Math.round(len / 2.5));
  for (let i = 0; i <= posts; i++) {
    const t = i / posts;
    const px = ax + (bx - ax) * t, pz = az + (bz - az) * t, py = ay + (by - ay) * t;
    batch.add(G.box, color, px, py + 0.6, pz, 0, ang, 0, 0.22, 1.2, 0.22);
  }
  const my = (ay + by) / 2;
  for (const h of [0.45, 0.95]) {
    batch.add(G.box, '#e0a96d', (ax + bx) / 2, my + h, (az + bz) / 2, 0, ang, 0, 0.1, 0.16, len);
  }
}

/** Big red barn. Returns footprint half-sizes for collisions. */
export function makeBarn() {
  const g = new THREE.Group();
  const M = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const wall = new THREE.Mesh(G.box, M('#d64545')); wall.scale.set(12, 7, 16); wall.position.y = 3.5; g.add(wall);
  const roof = new THREE.Mesh(G.prism, M('#6b3e2e')); roof.scale.set(14, 9, 17); roof.position.y = 7; g.add(roof);
  const trimC = M('#ffffff');
  const door = new THREE.Mesh(G.box, M('#8f2d2d')); door.scale.set(5, 5, 0.3); door.position.set(0, 2.5, 8.05); g.add(door);
  for (const [w, h, x, y, rz] of [[5.6, 0.35, 0, 5, 0], [0.35, 5, -2.6, 2.5, 0], [0.35, 5, 2.6, 2.5, 0], [0.3, 6.8, 0, 2.5, 0.82], [0.3, 6.8, 0, 2.5, -0.82]]) {
    const t = new THREE.Mesh(G.box, trimC); t.scale.set(w, h, 0.2); t.position.set(x, y, 8.25); t.rotation.z = rz; g.add(t);
  }
  const loft = new THREE.Mesh(G.box, M('#ffe08a')); loft.scale.set(2, 1.6, 0.2); loft.position.set(0, 8.6, 8.55); g.add(loft);
  return { group: g, hw: 6, hd: 8, top: 7 };
}

export function makeHouse() {
  const g = new THREE.Group();
  const M = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const wall = new THREE.Mesh(G.box, M('#fff1d6')); wall.scale.set(10, 5, 8); wall.position.y = 2.5; g.add(wall);
  const roof = new THREE.Mesh(G.prism, M('#4f86c6')); roof.scale.set(11.5, 5, 9.5); roof.rotation.y = Math.PI / 2; roof.position.y = 5; g.add(roof);
  const door = new THREE.Mesh(G.box, M('#a0612f')); door.scale.set(1.6, 3, 0.2); door.position.set(0, 1.5, 4.05); g.add(door);
  for (const x of [-3, 3]) {
    const w = new THREE.Mesh(G.box, M('#9fe3ff')); w.scale.set(1.8, 1.6, 0.15); w.position.set(x, 2.8, 4.05); g.add(w);
  }
  const chim = new THREE.Mesh(G.box, M('#b5654a')); chim.scale.set(1.2, 3, 1.2); chim.position.set(3, 7, -1.5); g.add(chim);
  const porch = new THREE.Mesh(G.box, M('#c98d4b')); porch.scale.set(5, 0.3, 2.5); porch.position.set(0, 0.15, 5.2); g.add(porch);
  return { group: g, hw: 5, hd: 4, top: 5 };
}

export function makeShopStall() {
  const g = new THREE.Group();
  const M = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const counter = new THREE.Mesh(G.box, M('#c98d4b')); counter.scale.set(5, 1.2, 1.6); counter.position.y = 0.6; g.add(counter);
  for (const x of [-2.3, 2.3]) for (const z of [-0.6, 0.6]) {
    const p = new THREE.Mesh(G.box, M('#8b5a2b')); p.scale.set(0.2, 3.2, 0.2); p.position.set(x, 1.6, z); g.add(p);
  }
  for (let i = 0; i < 6; i++) {
    const stripe = new THREE.Mesh(G.box, M(i % 2 ? '#ffffff' : '#ef476f'));
    stripe.scale.set(5.6 / 6, 0.2, 2.6); stripe.position.set(-2.8 + 5.6 / 12 + i * 5.6 / 6, 3.3, 0); stripe.rotation.x = -0.15; g.add(stripe);
  }
  // goods on the counter
  const goods = ['#3a86ff', '#ffbe0b', '#ff006e', '#8ac926'];
  goods.forEach((c, i) => { const s = new THREE.Mesh(G.sphere, M(c)); s.scale.setScalar(0.5); s.position.set(-1.6 + i * 1.05, 1.45, 0); g.add(s); });
  return { group: g, hw: 2.6, hd: 0.9, top: 1.2 };
}

export function makeNoticeBoard() {
  const g = new THREE.Group();
  const M = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  for (const x of [-1.4, 1.4]) { const p = new THREE.Mesh(G.box, M('#8b5a2b')); p.scale.set(0.25, 2.8, 0.25); p.position.set(x, 1.4, 0); g.add(p); }
  const board = new THREE.Mesh(G.box, M('#d9a066')); board.scale.set(3.2, 1.8, 0.15); board.position.y = 2; g.add(board);
  const roof = new THREE.Mesh(G.prism, M('#6b3e2e')); roof.scale.set(3.8, 0.9, 0.7); roof.position.y = 2.9; g.add(roof);
  const papers = ['#ffffff', '#fff3b0', '#cdeffd'];
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(G.box, M(papers[i % 3])); p.scale.set(0.6, 0.7, 0.02);
    p.position.set(-1.05 + i * 0.7, 2 + (i % 2 ? 0.15 : -0.15), 0.09); p.rotation.z = (i - 1.5) * 0.08; g.add(p);
  }
  return g;
}

/** Wooden sign with painted text (CanvasTexture). */
export function makeSign(text, color = '#ffd166', w = 4) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#8b5a2b'; ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#5e3b1c'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, 502, 118);
  ctx.font = 'bold 54px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  if (tw > 470) ctx.font = `bold ${Math.floor(54 * 470 / tw)}px "Trebuchet MS", sans-serif`;
  ctx.lineWidth = 9; ctx.strokeStyle = '#2b1a0c'; ctx.lineJoin = 'round';
  ctx.strokeText(text, 256, 68);
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const plane = new THREE.Mesh(new THREE.BoxGeometry(w, w / 4, 0.15), [
    new THREE.MeshLambertMaterial({ color: '#8b5a2b' }), new THREE.MeshLambertMaterial({ color: '#8b5a2b' }),
    new THREE.MeshLambertMaterial({ color: '#8b5a2b' }), new THREE.MeshLambertMaterial({ color: '#8b5a2b' }),
    mat, mat,
  ]);
  return plane;
}
