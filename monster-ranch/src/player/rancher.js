// The other player's rancher avatar: simple body/head/hat in their colour, holding their
// equipped item, with a name tag and chat bubbles. Movement is smoothed between snapshots.
import * as THREE from 'three';
import { makeViewModel } from './items.js';
import { HOTBAR } from '../data/items.js';

const M = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });

function textSprite(text, { bg = 'rgba(43,45,66,0.85)', fg = '#ffffff', size = 40, maxW = 520 } = {}) {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  ctx.font = `bold ${size}px "Trebuchet MS", sans-serif`;
  // word wrap
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  lines.push(line);
  const w = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width))) + 36;
  const h = lines.length * size * 1.2 + 24;
  cv.width = Math.ceil(w); cv.height = Math.ceil(h);
  ctx.font = `bold ${size}px "Trebuchet MS", sans-serif`;
  ctx.fillStyle = bg;
  const r = 18;
  ctx.beginPath(); ctx.roundRect(0, 0, cv.width, cv.height, r); ctx.fill();
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, cv.width / 2, 12 + size * 0.6 + i * size * 1.2));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.renderOrder = 20;
  const scale = 0.0045;
  sp.scale.set(cv.width * scale, cv.height * scale, 1);
  return sp;
}

export class Rancher {
  constructor(scene, { name, color }) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.name = name;
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.yaw = 0; this.targetYaw = 0;
    this.pitch = 0;
    this.walk = 0;
    this.item = -1;
    this.hasPose = false;

    const skin = M('#f1c27d'), shirt = M(color), pants = M('#3d5a80'), boots = M('#5e3b1c');
    this.legs = [-1, 1].map((s) => {
      const g = new THREE.Group(); g.position.set(s * 0.15, 0.8, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.24), pants); leg.position.y = -0.35;
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.34), boots); boot.position.set(0, -0.74, 0.04);
      g.add(leg, boot); this.root.add(g); return g;
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.32), shirt); body.position.y = 1.12; this.root.add(body);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.34), pants); strap.position.y = 0.95; this.root.add(strap);
    this.arms = [-1, 1].map((s) => {
      const g = new THREE.Group(); g.position.set(s * 0.37, 1.38, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.58, 0.2), shirt); arm.position.y = -0.27;
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), skin); hand.position.y = -0.6;
      g.add(arm, hand); this.root.add(g); return g;
    });
    this.head = new THREE.Group(); this.head.position.y = 1.62; this.root.add(this.head);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin); face.position.y = 0.06; this.head.add(face);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.02), M('#2b2d42')); eye.position.set(s * 0.1, 0.1, 0.215); this.head.add(eye);
    }
    const blush = M('#ff9e9e');
    for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.02), blush); b.position.set(s * 0.15, 0.0, 0.215); this.head.add(b); }
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 14), M(color)); brim.position.y = 0.28; this.head.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.24, 12), M(color)); crown.position.y = 0.4; this.head.add(crown);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.06, 12), M('#fff7e6')); band.position.y = 0.31; this.head.add(band);

    this.hand = new THREE.Group(); this.hand.position.set(0, -0.62, 0.12);
    this.arms[1].add(this.hand);
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    this.tag = textSprite(name, { size: 36 });
    this.tag.position.y = 2.35;
    this.root.add(this.tag);
    this.bubble = null;
    this.bubbleT = 0;
    scene.add(this.root);
  }

  setItem(index) {
    if (index === this.item) return;
    this.item = index;
    this.hand.clear();
    if (index >= 0) {
      const m = HOTBAR[index] && makeViewModel(HOTBAR[index].id);
      if (m) { m.scale.setScalar(1.6); m.rotation.x = -Math.PI / 2; this.hand.add(m); }
    }
  }

  setPose(x, y, z, yaw, pitch, item) {
    this.target.set(x, y, z);
    this.targetYaw = yaw; this.pitch = pitch;
    if (!this.hasPose) { this.pos.copy(this.target); this.yaw = yaw; this.hasPose = true; }
    this.setItem(item);
  }

  say(text) {
    if (this.bubble) { this.root.remove(this.bubble); this.bubble.material.map.dispose(); }
    this.bubble = textSprite(text, { bg: 'rgba(255,247,230,0.95)', fg: '#2b2d42', size: 38 });
    this.bubble.position.y = 2.85;
    this.root.add(this.bubble);
    this.bubbleT = 6;
  }

  swing() { this.swingT = 0.35; }

  update(dt) {
    const prev = this.pos.clone();
    this.pos.lerp(this.target, 1 - Math.exp(-14 * dt));
    if (this.pos.distanceTo(this.target) > 8) this.pos.copy(this.target); // teleport
    let d = this.targetYaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * (1 - Math.exp(-14 * dt));
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw + Math.PI; // avatar model faces +z, camera yaw 0 looks -z
    this.head.rotation.x = -this.pitch * 0.6;

    const speed = Math.hypot(this.pos.x - prev.x, this.pos.z - prev.z) / Math.max(dt, 1e-4);
    this.walk += dt * Math.min(speed, 11) * 1.4;
    const amp = Math.min(1, speed / 5) * 0.7;
    this.legs[0].rotation.x = Math.sin(this.walk) * amp;
    this.legs[1].rotation.x = -Math.sin(this.walk) * amp;
    this.arms[0].rotation.x = -Math.sin(this.walk) * amp * 0.8;
    let armR = Math.sin(this.walk) * amp * 0.8 - 0.5;
    if (this.swingT > 0) { this.swingT -= dt; armR = -2.2 + (this.swingT / 0.35) * 0.5; }
    this.arms[1].rotation.x = armR;

    if (this.bubble) {
      this.bubbleT -= dt;
      this.bubble.material.opacity = Math.min(1, this.bubbleT);
      if (this.bubbleT <= 0) { this.root.remove(this.bubble); this.bubble.material.map.dispose(); this.bubble = null; }
    }
  }

  dispose() {
    this.scene.remove(this.root);
  }
}
