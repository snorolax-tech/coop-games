// Little pop-up icons above creatures: ! ? ♥ Zz 💢 ♪
import * as THREE from 'three';

const cache = new Map();
function texFor(sym) {
  let t = cache.get(sym);
  if (t) return t;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath(); ctx.arc(64, 58, 50, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(50, 100); ctx.lineTo(64, 124); ctx.lineTo(78, 100); ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = '#2b2d42';
  ctx.beginPath(); ctx.arc(64, 58, 50, 0.6 * Math.PI, 0.4 * Math.PI); ctx.stroke();
  const colors = { '!': '#ef476f', '?': '#118ab2', '♥': '#ff4d8d', 'Zz': '#6a4c93', '💢': '#ef476f', '♪': '#06d6a0', '…': '#2b2d42' };
  ctx.fillStyle = colors[sym] || '#2b2d42';
  ctx.font = `bold ${sym.length > 1 && sym !== '💢' ? 50 : 70}px "Trebuchet MS", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(sym, 64, 62);
  t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(sym, t);
  return t;
}

export const EMOTES = ['!', '?', '♥', 'Zz', '💢', '♪', '…'];

export class Emote {
  constructor(parent, height) {
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texFor('!'), transparent: true, depthWrite: false }));
    this.sprite.scale.setScalar(0.6);
    this.sprite.position.y = height + 0.45;
    this.sprite.visible = false;
    this.sprite.renderOrder = 15;
    this.height = height;
    this.t = 0;
    parent.add(this.sprite);
  }

  show(sym, duration = 1.5) {
    this.sprite.material.map = texFor(sym);
    this.sprite.material.needsUpdate = true;
    this.sprite.visible = true;
    this.t = duration;
    this.max = duration;
    this.sym = sym;
  }

  update(dt) {
    if (!this.sprite.visible) return;
    this.t -= dt;
    if (this.t <= 0) { this.sprite.visible = false; return; }
    const age = this.max - this.t;
    const pop = Math.min(1, age * 8);
    const s = 0.6 * (0.6 + 0.4 * pop) * (1 + Math.sin(age * 6) * 0.04);
    this.sprite.scale.setScalar(s);
    this.sprite.position.y = this.height + 0.45 + Math.sin(age * 3) * 0.06 + (this.sym === 'Zz' ? age * 0.1 : 0);
    this.sprite.material.opacity = Math.min(1, this.t * 3);
  }
}
