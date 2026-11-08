// Builds the kitchen set: static geometry, physics colliders, stations and lights.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export const COUNTER_H = 0.9;
export const BURNERS = [-3.0, -2.0, -1.0].map((x) => new THREE.Vector3(x, 0.93, -4.6));
export const BOARDS = [-1.0, 1.0].map((x) => new THREE.Vector3(x, 0.94, 0.6));
export const WINDOW_POS = new THREE.Vector3(6.6, 1.2, 0);
export const SINK_POS = new THREE.Vector3(2.1, 0.95, -4.6);
export const TRASH_POS = new THREE.Vector3(6.4, 0.7, 2.7);
export const DOOR_POS = new THREE.Vector3(-5, 0, 4.4);
export const PUDDLE_CENTER = new THREE.Vector3(2.1, 0.012, -3.2);
export const SPAWNS = [new THREE.Vector3(-1.2, 0.4, 2.6), new THREE.Vector3(1.2, 0.4, 2.6)];
export const ROOM = { minX: -6.0, maxX: 6.0, minZ: -3.9, maxZ: 4.5 };

const THEMES = {
  classic: {
    bg: 0x2b2140, floor: ['#fff4e0', '#ff5d8f'], wall: 0xffd166, wallTrim: 0xff8fab, counter: 0x4ecdc4, top: 0xfaf3e3,
    stove: 0x3d405b, island: 0xff8fab, walls: true, fog: null,
  },
  boat: {
    bg: 0x0b3954, floor: ['#b07945', '#9a6638'], wall: 0x2f7fb3, wallTrim: 0xf6f1d1, counter: 0xe9c46a, top: 0xfff3d6,
    stove: 0x264653, island: 0xe76f51, walls: true, portholes: true,
  },
  bbq: {
    bg: 0x8fd3ff, floor: ['#7bc950', '#6ab23f'], wall: 0xa0703c, wallTrim: 0x7a5230, counter: 0xc97b4a, top: 0xe8d5b5,
    stove: 0x222222, island: 0x9c6644, walls: false,
  },
};

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function makeLabelTexture(lines, { w = 512, h = 256, bg = '#fffbea', fg = '#3d2c1e', border = '#3d2c1e', font = 40 } = {}) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = border; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((ln, i) => {
      const size = ln.size || font;
      g.font = `bold ${size}px Fredoka, "Segoe UI", sans-serif`;
      g.fillStyle = ln.color || fg;
      g.fillText(ln.text, w / 2, ln.y != null ? ln.y * h : h * (i + 1) / (lines.length + 1));
    });
  });
}

export function buildKitchen(scene, physics, setId = 'classic') {
  const theme = THEMES[setId] || THEMES.classic;
  const K = { stations: [], blockers: [], footprints: [], lights: {}, setId, theme, animated: [] };
  scene.background = new THREE.Color(theme.bg);

  const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

  function addStatic(w, h, d, x, y, z) {
    if (!physics) return;
    // explicit material so the frictionless player<->world contact material applies (null material = sticky default friction)
    const b = new CANNON.Body({ type: CANNON.Body.STATIC, material: physics.defaultMaterial, shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)) });
    b.position.set(x, y, z); physics.addBody(b);
    return b;
  }
  function addBox(w, h, d, x, y, z, material, { body = true, shadow = true, blocker = true, parent = scene } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true;
    parent.add(m);
    if (blocker) K.blockers.push(m);
    if (body) addStatic(w, h, d, x, y, z);
    return m;
  }
  function counter(x0, x1, z0, z1, color = theme.counter) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    addBox(w, COUNTER_H - 0.05, d, cx, (COUNTER_H - 0.05) / 2, cz, mat(color), { body: false });
    addBox(w + 0.04, 0.05, d + 0.04, cx, COUNTER_H - 0.025, cz, mat(theme.top), { body: false });
    addStatic(w, COUNTER_H, d, cx, COUNTER_H / 2, cz);
    // little kick-plate stripe for cartoon flair
    addBox(w + 0.005, 0.08, d + 0.005, cx, 0.04, cz, mat(0x222233), { body: false, blocker: false, shadow: false });
    K.footprints.push({ x0, x1, z0, z1, h: COUNTER_H });
  }
  function station(type, mesh, data = {}) {
    const st = { type, mesh, ...data };
    const meshes = Array.isArray(mesh) ? mesh : [mesh];
    meshes.forEach((m) => { m.userData.station = st; });
    st.mesh = meshes[0];
    st.pos = st.pos || meshes[0].getWorldPosition(new THREE.Vector3());
    K.stations.push(st);
    return st;
  }

  // ---------- Floor ----------
  const floorTex = canvasTexture(256, 256, (g) => {
    const [a, b] = theme.floor;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * 64, j * 64, 64, 64);
    }
    if (setId === 'boat') { g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke(); } }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(setId === 'bbq' ? 12 : 7, setId === 'bbq' ? 10 : 5);
  if (setId !== 'classic') floorTex.magFilter = THREE.NearestFilter;
  const floorSize = setId === 'bbq' ? [40, 34] : [14, 10];
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(...floorSize), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  K.blockers.push(floor);
  addStatic(60, 1, 60, 0, -0.5, 0);

  // Invisible "player-only" wall across the serving window / hatch: chefs can't walk out, food can fly through.
  if (physics) {
    const pw = new CANNON.Body({ type: CANNON.Body.STATIC, material: physics.defaultMaterial, shape: new CANNON.Box(new CANNON.Vec3(0.1, 1.5, 0.9)) });
    pw.position.set(7.05, 1.5, 0); pw.collisionFilterGroup = 16; pw.collisionFilterMask = 2;
    physics.addBody(pw);
  }

  // ---------- Walls ----------
  const wallMat = mat(theme.wall), trimMat = mat(theme.wallTrim);
  const H = 4;
  if (theme.walls) {
    addBox(16, H, 1, 0, H / 2, -5.5, wallMat);           // back
    addBox(16, H, 1, 0, H / 2, 5.5, wallMat);            // front
    addBox(1, H, 10, -7.5, H / 2, 0, wallMat);           // left
    // right wall with serving window (opening z -0.75..0.75, y 0.95..2.1)
    addBox(1, H, 4.25, 7.5, H / 2, -2.875, wallMat);
    addBox(1, H, 4.25, 7.5, H / 2, 2.875, wallMat);
    addBox(1, 0.95, 1.5, 7.5, 0.475, 0, wallMat);
    addBox(1, H - 2.1, 1.5, 7.5, 2.1 + (H - 2.1) / 2, 0, wallMat);
    // trim stripes
    addBox(14, 0.25, 0.05, 0, 1.2, -4.98, trimMat, { body: false, blocker: false, shadow: false });
    addBox(14, 0.25, 0.05, 0, 1.2, 4.98, trimMat, { body: false, blocker: false, shadow: false });
    addBox(0.05, 0.25, 10, -6.98, 1.2, 0, trimMat, { body: false, blocker: false, shadow: false });
  } else {
    // BBQ: low wooden fences + invisible tall colliders so stuff stays in the yard
    const fence = mat(theme.wall);
    for (const [w, d, x, z] of [[14, 0.15, 0, -5.1], [14, 0.15, 0, 5.1], [0.15, 10.2, -7.1, 0], [0.15, 4.25, 7.1, -2.875], [0.15, 4.25, 7.1, 2.875]]) {
      addBox(w, 1.1, d, x, 0.55, z, fence, { body: false });
      addStatic(w, 6, d, x, 3, z);
    }
    for (let i = -7; i <= 7; i += 1) {
      addBox(0.12, 1.3, 0.12, i, 0.65, -5.1, mat(theme.wallTrim), { body: false, blocker: false });
      addBox(0.12, 1.3, 0.12, i, 0.65, 5.1, mat(theme.wallTrim), { body: false, blocker: false });
    }
    addStatic(0.15, 6, 1.5, 7.1, 3, 0); // behind the serving hatch (items going through still count)
    // trees
    const leaf = mat(0x2d6a4f), trunk = mat(0x6b4226);
    for (const [x, z, s] of [[-11, -9, 1.4], [-4, -12, 1.8], [6, -11, 1.5], [12, -4, 1.3], [11, 8, 1.6], [-12, 6, 1.5], [0, 13, 1.7]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * s, 0.3 * s, 2 * s, 6), trunk); t.position.set(x, s, z); scene.add(t);
      const l = new THREE.Mesh(new THREE.ConeGeometry(1.5 * s, 3 * s, 7), leaf); l.position.set(x, 3 * s, z); l.castShadow = true; scene.add(l);
    }
    // sun
    const sun = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 16), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }));
    sun.position.set(30, 30, -40); scene.add(sun);
  }
  if (theme.portholes) {
    const ringMat = mat(0xd4a017), seaMat = new THREE.MeshBasicMaterial({ color: 0x48cae4 });
    for (const [x, z, ry] of [[-4.5, 4.98, Math.PI], [-1.5, 4.98, Math.PI], [1.5, 4.98, Math.PI], [4.5, 4.98, Math.PI], [-6.98, -1, Math.PI / 2], [-6.98, 2, Math.PI / 2]]) {
      const g = new THREE.Group(); g.position.set(x, 2.2, z); g.rotation.y = ry; scene.add(g);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.08, 8, 20), ringMat); g.add(ring);
      const sea = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), seaMat); sea.position.z = -0.01; g.add(sea);
      const wave = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20, Math.PI, Math.PI), new THREE.MeshBasicMaterial({ color: 0x0077b6 }));
      wave.position.z = -0.005; g.add(wave); K.animated.push({ obj: wave, kind: 'wave' });
    }
  }

  // ---------- Back counter: counter / stove / counter / sink / counter ----------
  counter(-5.9, -3.7, -5, -4.2);
  // Stove block
  const stoveMat = mat(theme.stove);
  addBox(3.4, COUNTER_H, 0.8, -2.0, COUNTER_H / 2, -4.6, stoveMat);
  K.footprints.push({ x0: -3.7, x1: -0.3, z0: -5, z1: -4.2, h: COUNTER_H });
  // oven door
  addBox(2.6, 0.5, 0.03, -2.0, 0.42, -4.19, mat(0x111122), { body: false, blocker: false });
  addBox(2.0, 0.06, 0.06, -2.0, 0.72, -4.15, mat(0xcccccc), { body: false, blocker: false });
  K.burnerMeshes = [];
  BURNERS.forEach((p, i) => {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 20), mat(0x111111));
    ring.position.set(p.x, COUNTER_H + 0.015, p.z); scene.add(ring);
    const glowMat = new THREE.MeshLambertMaterial({ color: 0x552222, emissive: 0x000000 });
    const glow = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 20), glowMat);
    glow.rotation.x = -Math.PI / 2; glow.position.set(p.x, COUNTER_H + 0.035, p.z); scene.add(glow);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10), mat(0xeeeeee));
    knob.rotation.x = Math.PI / 2; knob.position.set(p.x, 0.8, -4.17); scene.add(knob);
    const pointer = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.06, 0.02), mat(0xe63946));
    pointer.position.set(0, 0.04, 0); knob.add(pointer);
    K.burnerMeshes.push({ glow, glowMat, knob });
    station('burner', [ring, glow, knob], { index: i, pos: p.clone() });
  });
  counter(-0.3, 1.4, -5, -4.2);
  // Sink
  counter(1.4, 2.8, -5, -4.2, theme.counter);
  const basin = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.02, 0.55), mat(0x8fa3b8));
  basin.position.set(2.1, COUNTER_H + 0.005, -4.6); scene.add(basin);
  const faucetMat = mat(0xd9d9d9);
  const faucet = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), faucetMat);
  faucet.position.set(2.1, COUNTER_H + 0.25, -4.9); scene.add(faucet);
  const spout = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.3), faucetMat);
  spout.position.set(2.1, COUNTER_H + 0.48, -4.78); scene.add(spout);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.45, 8), new THREE.MeshLambertMaterial({ color: 0x6ecbff, transparent: true, opacity: 0.7 }));
  water.position.set(2.1, COUNTER_H + 0.24, -4.66); water.visible = false; scene.add(water);
  K.sinkWater = water;
  station('sink', [basin, faucet, spout], { pos: SINK_POS.clone() });
  counter(2.8, 6.2, -5, -4.2);

  // Recipe card on the back wall
  const recipeTex = makeLabelTexture([
    { text: "📋 TODAY'S MENU", size: 46, y: 0.12, color: '#ff006e' },
    { text: '🍔 BURGER — on a plate', size: 30, y: 0.3 },
    { text: 'bun + cooked patty + lettuce + tomato', size: 24, y: 0.4, color: '#6b4f3a' },
    { text: '🥗 SALAD — in a bowl', size: 30, y: 0.54 },
    { text: 'chopped lettuce + tomato + cucumber', size: 24, y: 0.64, color: '#6b4f3a' },
    { text: '🍲 SOUP — pot → bowl', size: 30, y: 0.78 },
    { text: 'water + chopped carrot + onion, boiled', size: 24, y: 0.88, color: '#6b4f3a' },
  ], { w: 600, h: 520 });
  const card = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.47), new THREE.MeshBasicMaterial({ map: recipeTex }));
  card.position.set(4.4, 2.35, setId === 'bbq' ? -5.0 : -4.97);
  scene.add(card);
  if (setId === 'bbq') addBox(1.9, 2.6, 0.1, 4.4, 1.6, -5.08, mat(0x7a5230), { body: false });

  // ---------- Fridge (patties) ----------
  const fridgeMat = mat(0xf1faee);
  const fridge = addBox(0.9, 2.1, 1.0, -6.5, 1.05, -4.45, fridgeMat);
  addBox(0.04, 0.5, 0.05, -6.03, 1.4, -4.1, mat(0x999999), { body: false, blocker: false });
  addBox(0.03, 0.03, 0.95, -6.04, 1.15, -4.45, mat(0xbbbbbb), { body: false, blocker: false });
  const fridgeLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshBasicMaterial({ map: makeLabelTexture([{ text: '🥩 PATTIES', size: 70 }], { w: 400, h: 200 }) }));
  fridgeLabel.position.set(-6.04, 1.75, -4.45); fridgeLabel.rotation.y = Math.PI / 2; scene.add(fridgeLabel);
  station('crate', [fridge, fridgeLabel], { ing: 'patty', label: 'Fridge' });
  K.footprints.push({ x0: -6.95, x1: -6.05, z0: -4.95, z1: -3.95, h: 2.1 });

  // ---------- Left counter with ingredient crates ----------
  counter(-7, -6.2, -3.4, 3.4);
  const crateIngs = ['bun', 'lettuce', 'tomato', 'cucumber', 'carrot', 'onion'];
  const crateColors = { bun: 0xe9b872, lettuce: 0x70c040, tomato: 0xe63946, cucumber: 0x2d6a4f, carrot: 0xf77f00, onion: 0xc77dff };
  K.crateZ = {};
  crateIngs.forEach((ing, i) => {
    const z = -2.75 + i * 1.1;
    const crate = addBox(0.7, 0.26, 0.9, -6.6, COUNTER_H + 0.13, z, mat(0xb5835a), { body: true });
    const fill = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.8), mat(crateColors[ing]));
    fill.position.set(-6.6, COUNTER_H + 0.25, z); scene.add(fill);
    // bumpy pile on top
    for (let j = 0; j < 5; j++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), mat(crateColors[ing], { flatShading: true }));
      b.position.set(-6.6 + (Math.random() - 0.5) * 0.4, COUNTER_H + 0.29, z + (Math.random() - 0.5) * 0.6);
      b.scale.y = 0.7; scene.add(b);
      b.userData.station = null;
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.32), new THREE.MeshBasicMaterial({ map: makeLabelTexture([{ text: ing.toUpperCase(), size: 72 }], { w: 400, h: 170 }) }));
    sign.position.set(-6.97, 1.55, z); sign.rotation.y = Math.PI / 2; scene.add(sign);
    station('crate', [crate, fill, sign], { ing, label: `${ing} crate` });
    K.crateZ[ing] = z;
  });

  // ---------- Right counter: dispensers + serving window ----------
  counter(6.2, 7, -4.2, 1.4);
  const plateStack = new THREE.Group(); plateStack.position.set(6.6, COUNTER_H, -3.4); scene.add(plateStack);
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.03, 16), mat(0xffffff));
    p.position.y = 0.02 + i * 0.035; p.castShadow = true; plateStack.add(p);
  }
  const bowlStack = new THREE.Group(); bowlStack.position.set(6.6, COUNTER_H, -2.4); scene.add(bowlStack);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.1, 14, 1, true), mat(0x90e0ef, { side: THREE.DoubleSide }));
    b.position.y = 0.06 + i * 0.05; b.castShadow = true; bowlStack.add(b);
  }
  station('dispenser', plateStack.children, { item: 'plate', pos: new THREE.Vector3(6.6, 1.0, -3.4) });
  station('dispenser', bowlStack.children, { item: 'bowl', pos: new THREE.Vector3(6.6, 1.0, -2.4) });
  // pass / serving window
  const pass = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.04, 1.5), mat(0xd9d9d9, { emissive: 0x332200 }));
  pass.position.set(6.6, COUNTER_H + 0.02, 0); scene.add(pass);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffd166));
  bell.position.set(6.85, COUNTER_H + 0.04, 0.55); scene.add(bell);
  const serveSign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.4), new THREE.MeshBasicMaterial({ map: makeLabelTexture([{ text: '🛎 SERVE HERE', size: 80, color: '#fff' }], { w: 600, h: 170, bg: '#ff006e', border: '#fff' }) }));
  serveSign.position.set(6.95, 2.4, 0); serveSign.rotation.y = -Math.PI / 2; scene.add(serveSign);
  // window frame glow strip
  const frameMat = mat(0xffbe0b, { emissive: 0x664400 });
  addBox(0.1, 0.08, 1.6, 6.98, 2.12, 0, frameMat, { body: false, blocker: false });
  addBox(0.1, 1.2, 0.08, 6.98, 1.5, -0.78, frameMat, { body: false, blocker: false });
  addBox(0.1, 1.2, 0.08, 6.98, 1.5, 0.78, frameMat, { body: false, blocker: false });
  // judges' faces peeking through the window (cardboard cutouts)
  if (theme.walls) {
    const judge = new THREE.Group(); judge.position.set(7.6, 1.55, 0); scene.add(judge);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), mat(0xf4c095)); judge.add(head);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.35, 12), mat(0x222222)); hat.position.y = 0.38; judge.add(hat);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), mat(0x111111)); eye.position.set(-0.27, 0.06, s * 0.1); judge.add(eye);
    }
    const stache = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.25), mat(0x3d2c1e)); stache.position.set(-0.29, -0.06, 0); judge.add(stache);
    K.judge = judge;
  }
  station('window', [pass, bell], { pos: WINDOW_POS.clone() });

  // Trash can
  const trashMat = mat(0x6c757d);
  const trash = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.27, 0.8, 14, 1, true), new THREE.MeshLambertMaterial({ color: 0x6c757d, side: THREE.DoubleSide }));
  trash.position.set(TRASH_POS.x, 0.4, TRASH_POS.z); trash.castShadow = true; scene.add(trash);
  const trashInner = new THREE.Mesh(new THREE.CircleGeometry(0.3, 14), mat(0x222222));
  trashInner.rotation.x = -Math.PI / 2; trashInner.position.set(TRASH_POS.x, 0.55, TRASH_POS.z); scene.add(trashInner);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 6, 16), trashMat);
  rim.rotation.x = Math.PI / 2; rim.position.set(TRASH_POS.x, 0.8, TRASH_POS.z); scene.add(rim);
  addStatic(0.5, 0.55, 0.5, TRASH_POS.x, 0.275, TRASH_POS.z);
  station('trash', [trash, trashInner, rim], { pos: TRASH_POS.clone() });
  K.footprints.push({ x0: TRASH_POS.x - 0.3, x1: TRASH_POS.x + 0.3, z0: TRASH_POS.z - 0.3, z1: TRASH_POS.z + 0.3, h: 0.8 });

  // ---------- Island with cutting boards ----------
  counter(-2.1, 2.1, -0.1, 1.3, theme.island);
  BOARDS.forEach((p, i) => {
    const board = addBox(0.65, 0.04, 0.48, p.x, COUNTER_H + 0.02, p.z, mat(0xdda15e), { body: true });
    const knife = new THREE.Group(); knife.position.set(p.x + 0.42, COUNTER_H + 0.015, p.z); scene.add(knife);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 0.22), mat(0xe0e0e0)); blade.position.z = -0.06; knife.add(blade);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 0.11), mat(0x222222)); handle.position.z = 0.1; knife.add(handle);
    station('board', [board], { index: i, pos: p.clone() });
  });

  // ---------- Camera table ----------
  addBox(0.8, 0.8, 0.6, 0, 0.4, 3.6, mat(0x3d405b));
  K.footprints.push({ x0: -0.4, x1: 0.4, z0: 3.3, z1: 3.9, h: 0.8 });
  // tape "X" marks
  for (const s of [-1, 1]) {
    const tape = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.08), new THREE.MeshBasicMaterial({ color: 0xffbe0b }));
    tape.rotation.x = -Math.PI / 2; tape.rotation.z = s * Math.PI / 4; tape.position.set(0, 0.005, 1.8); scene.add(tape);
  }

  // ---------- Decor ----------
  if (theme.walls) {
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.1), new THREE.MeshBasicMaterial({ map: makeLabelTexture([
      { text: '🍳 COOKING SHOW CHAOS 🍳', size: 66, color: '#fff' }], { w: 1000, h: 260, bg: '#ff006e', border: '#ffbe0b' }) }));
    logo.position.set(0, 3.0, 4.97); logo.rotation.y = Math.PI; scene.add(logo);
    // Door (chicken entrance)
    addBox(1.1, 2.2, 0.06, DOOR_POS.x, 1.1, 4.98, mat(0x8d5524), { body: false, blocker: false });
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0xffd166)); knob.position.set(DOOR_POS.x + 0.4, 1.0, 4.93); scene.add(knob);
    // ON AIR sign
    const onAirMat = new THREE.MeshBasicMaterial({ map: makeLabelTexture([{ text: 'ON AIR', size: 110, color: '#fff' }], { w: 500, h: 180, bg: '#550000', border: '#222' }) });
    const onAir = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.43), onAirMat);
    onAir.position.set(-1.0, 3.2, -4.97); scene.add(onAir);
    K.onAirMat = onAirMat;
    // Studio light rigs
    const rigMat = mat(0x333333);
    addBox(14, 0.12, 0.12, 0, 3.85, 2.5, rigMat, { body: false, blocker: false });
    addBox(14, 0.12, 0.12, 0, 3.85, -2, rigMat, { body: false, blocker: false });
    for (const [x, z] of [[-4, 2.5], [0, 2.5], [4, 2.5], [-4, -2], [0, -2], [4, -2]]) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.4, 10), rigMat);
      can.position.set(x, 3.6, z); can.rotation.x = 0.4 * Math.sign(z); scene.add(can);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.2, 10), new THREE.MeshBasicMaterial({ color: 0xfff1c1 }));
      lens.position.set(0, -0.201, 0); lens.rotation.x = Math.PI / 2; can.add(lens);
    }
    // Hanging plants / shelf
    addBox(2.4, 0.06, 0.35, -4.6, 2.0, -4.82, mat(0x8d5524), { body: false, blocker: false });
    const jarColors = [0xe63946, 0xffbe0b, 0x2a9d8f, 0x9b5de5, 0xf15bb5];
    jarColors.forEach((c, i) => {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.25, 8), mat(c));
      jar.position.set(-5.5 + i * 0.45, 2.16, -4.82); scene.add(jar);
    });
    // Fire extinguisher wall sign
    const exSign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshBasicMaterial({ map: makeLabelTexture([{ text: '🧯 FIRE!', size: 90, color: '#fff' }], { w: 400, h: 200, bg: '#e63946', border: '#fff' }) }));
    exSign.position.set(-4.4, 1.5, -4.97); scene.add(exSign);
  }
  // Fake audience bleachers silhouettes (outside the front wall you can't see; so in BBQ we add a few lawn chairs instead)
  if (setId === 'bbq') {
    for (const [x, c] of [[-3, 0xe63946], [-1.5, 0x3a86ff], [3, 0xffbe0b]]) {
      addBox(0.6, 0.06, 0.6, x, 0.45, 6.5, mat(c), { body: false });
      addBox(0.6, 0.6, 0.06, x, 0.75, 6.8, mat(c), { body: false });
    }
  }

  // ---------- Lights ----------
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a6f9e, setId === 'bbq' ? 1.6 : 1.3);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xfff4e0, setId === 'bbq' ? 2.6 : 2.0);
  dir.position.set(4, 10, 6); dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  Object.assign(dir.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
  dir.shadow.bias = -0.0005; dir.shadow.normalBias = 0.02;
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0xc8b6ff, 0.6); fill.position.set(-5, 6, -4); scene.add(fill);
  K.lights = { hemi, dir, fill, base: { hemi: hemi.intensity, dir: dir.intensity, fill: fill.intensity } };

  K.groundHeightAt = (x, z) => {
    let h = 0;
    for (const f of K.footprints) if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1) h = Math.max(h, f.h);
    return h;
  };
  K.stationByType = (type, index = 0) => K.stations.filter((s) => s.type === type)[index];
  return K;
}
