// Minimap (top-right, follows you, north is up) and a full world map (press M).
// Shows zones in their colours with names and lock status, you and your friend as arrows,
// landmarks, guardian lairs and the ranch.
import { ZONES, WILD_ZONES, HUB_R, zoneAt, zoneTitle } from '../world/zones.js';
import { LAKE, VOLCANO, WATER_Y, groundY } from '../world/terrain.js';
import { GUARDIANS, SPECIES_BY_ID } from '../data/creatures.js';

const WORLD = 380;          // world half-size covered by the background image
const BG = 512;             // background image resolution
const MINI_R = 110;         // metres shown from the centre of the minimap
const LANDMARKS = [
  { id: 'spire', name: 'Sunstone Spire', x: 46, z: -205 },
  { id: 'arch', name: 'Rune Stone', x: -70, z: -150 },
  { id: 'stump', name: 'Elder Stump', x: 215, z: 32 },
  { id: 'dock', name: 'Old Dock', x: 0, z: 171 },
  { id: 'crater', name: 'Obsidian Shrine', x: -208, z: 0 },
];

const toBg = (w) => ((w + WORLD) / (WORLD * 2)) * BG;

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * k), g = Math.min(255, ((n >> 8) & 255) * k), b = Math.min(255, (n & 255) * k);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export class Minimap {
  constructor(root, game) {
    this.game = game;
    this.bg = document.createElement('canvas');
    this.bg.width = this.bg.height = BG;
    this._bgKey = '';

    this.mini = document.createElement('canvas');
    this.mini.width = this.mini.height = 180;
    this.mini.className = 'minimap';
    this.miniWrap = document.createElement('div');
    this.miniWrap.className = 'minimap-wrap hidden';
    this.miniLabel = document.createElement('div');
    this.miniLabel.className = 'minimap-label';
    this.miniWrap.append(this.mini, this.miniLabel);
    root.appendChild(this.miniWrap);

    this.full = document.createElement('div');
    this.full.className = 'bigmap hidden';
    this.full.innerHTML = `<div class="bigmap-card"><div class="bigmap-title">🗺️ World Map <small>— press M to close</small></div>
      <canvas width="640" height="640"></canvas>
      <div class="bigmap-legend">▲ You · <span class="lg-friend">▲ Friend</span> · ★ landmark found · ☆ landmark not found · 👑 guardian (♥ = calmed) · 🏡 your ranch · 🔒 locked zone</div></div>`;
    root.appendChild(this.full);
    this.bigCanvas = this.full.querySelector('canvas');
    this.open = false;
    this._t = 0;
  }

  show(v) { this.miniWrap.classList.toggle('hidden', !v); if (!v) this.toggleFull(false); }

  toggleFull(v = !this.open) {
    this.open = v;
    this.full.classList.toggle('hidden', !v);
    if (v) this.drawFull();
  }

  /** Paint the terrain/zone background once (again when zones unlock). */
  _paintBg() {
    const g = this.game;
    const key = [...g.unlocked].sort().join(',');
    if (key === this._bgKey) return;
    this._bgKey = key;
    const ctx = this.bg.getContext('2d');
    const img = ctx.createImageData(BG, BG);
    const colors = {};
    for (const id of Object.keys(ZONES)) {
      const locked = id !== 'ranch' && !g.unlocked.has(id);
      const hex = id === 'ranch' ? '#8fd16b' : ZONES[id].color;
      colors[id] = locked ? shade(hex, 0.45) : shade(hex, 0.85);
    }
    const parse = (s) => s.match(/\d+/g).map(Number);
    const parsed = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, parse(v)]));
    for (let py = 0; py < BG; py++) {
      for (let px = 0; px < BG; px++) {
        const x = (px / BG) * WORLD * 2 - WORLD, z = (py / BG) * WORLD * 2 - WORLD;
        const r = Math.hypot(x, z);
        let c;
        if (r > 335) c = [140, 140, 150];
        else {
          const zone = zoneAt(x, z);
          c = parsed[zone].slice();
          const h = groundY(x, z);
          if (h < WATER_Y) c = [76, 160, 220];
          else if (h > 18) { const k = Math.min(1, (h - 18) / 30); c = c.map((v) => v * (1 - k) + 170 * k); }
          if (Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.crater) c = [255, 110, 40];
          if (r < 125 && r > 9 && Math.min(Math.abs(x), Math.abs(z)) < 2.6) c = [217, 183, 122]; // paths
        }
        const i = (py * BG + px) * 4;
        img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // ranch fence ring
    ctx.strokeStyle = '#7a4a26'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(toBg(0), toBg(0), (HUB_R / (WORLD * 2)) * BG, 0, Math.PI * 2); ctx.stroke();
  }

  _markers() {
    const g = this.game;
    const list = [];
    list.push({ kind: 'ranch', x: 0, z: 0 });
    for (const l of LANDMARKS) list.push({ kind: 'landmark', x: l.x, z: l.z, found: g.landmarks.has(l.id), name: l.name });
    for (const [zone, gd] of Object.entries(GUARDIANS)) list.push({ kind: 'guardian', x: gd.x, z: gd.z, calm: g.guardiansCalmed.has(zone), name: SPECIES_BY_ID[gd.species].name, zone });
    return list;
  }

  /** Draw arrow (pointing along the camera yaw; north/up when yaw = 0). */
  _arrow(ctx, x, y, yaw, color, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-yaw);
    ctx.beginPath();
    ctx.moveTo(0, -size); ctx.lineTo(size * 0.75, size * 0.8); ctx.lineTo(0, size * 0.35); ctx.lineTo(-size * 0.75, size * 0.8); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.restore();
  }

  _icon(ctx, m, x, y, big) {
    ctx.font = `${big ? 18 : 13}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (m.kind === 'ranch') ctx.fillText('🏡', x, y);
    else if (m.kind === 'landmark') { ctx.fillStyle = m.found ? '#ffe066' : '#ffffff'; ctx.strokeStyle = '#2b2d42'; ctx.lineWidth = 3; ctx.strokeText(m.found ? '★' : '☆', x, y); ctx.fillText(m.found ? '★' : '☆', x, y); }
    else if (m.kind === 'guardian') ctx.fillText(m.calm ? '💖' : '👑', x, y);
  }

  update(dt) {
    const g = this.game;
    if (g.state === 'menu') return;
    this._t += dt;
    if (this._t < 0.1) return; // 10 fps is plenty
    this._t = 0;
    this._paintBg();
    this.drawMini();
    if (this.open) this.drawFull();
  }

  drawMini() {
    const g = this.game;
    const ctx = this.mini.getContext('2d');
    const S = this.mini.width, half = S / 2;
    const p = g.player.pos;
    const scale = half / MINI_R; // px per metre
    const toMini = (x, z) => [half + (x - p.x) * scale, half + (z - p.z) * scale];
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(half, half, half - 2, 0, Math.PI * 2); ctx.clip();
    const srcSize = (MINI_R * 2 / (WORLD * 2)) * BG;
    ctx.drawImage(this.bg, toBg(p.x) - srcSize / 2, toBg(p.z) - srcSize / 2, srcSize, srcSize, 0, 0, S, S);
    for (const m of this._markers()) {
      const [x, y] = toMini(m.x, m.z);
      if (x < -10 || y < -10 || x > S + 10 || y > S + 10) continue;
      this._icon(ctx, m, x, y, false);
    }
    // friend
    if (g.remote) {
      const t = g.remote.target;
      let [x, y] = toMini(t.x, t.z);
      const d = Math.hypot(x - half, y - half), maxD = half - 12;
      if (d > maxD) { x = half + (x - half) / d * maxD; y = half + (y - half) / d * maxD; } // pin to the edge
      this._arrow(ctx, x, y, g.remote.targetYaw, g.remote.color || '#06d6a0', 7);
    }
    ctx.restore();
    // frame + north marker
    ctx.lineWidth = 4; ctx.strokeStyle = '#2b2d42'; ctx.beginPath(); ctx.arc(half, half, half - 2, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('N', half, 12);
    this._arrow(ctx, half, half, g.player.yaw, g.profile.color || '#ef476f', 8);
    const z = ZONES[g.player.zone];
    this.miniLabel.textContent = zoneTitle(g.player.zone);
    this.miniLabel.style.background = z.color;
  }

  drawFull() {
    const g = this.game;
    const ctx = this.bigCanvas.getContext('2d');
    const S = this.bigCanvas.width;
    const k = S / BG;
    const toBig = (x, z) => [toBg(x) * k, toBg(z) * k];
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(this.bg, 0, 0, S, S);
    // zone names + lock status
    const label = (text, sub, x, y, color) => {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 17px "Trebuchet MS", sans-serif';
      ctx.lineWidth = 5; ctx.strokeStyle = '#2b2d42'; ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
      if (sub) { ctx.font = 'bold 14px "Trebuchet MS", sans-serif'; ctx.lineWidth = 4; ctx.strokeText(sub, x, y + 20); ctx.fillStyle = '#ffffff'; ctx.fillText(sub, x, y + 20); }
    };
    for (const id of WILD_ZONES) {
      const z = ZONES[id];
      const [x, y] = toBig(Math.sin(z.angle) * 118, -Math.cos(z.angle) * 118);
      const open = g.unlocked.has(id);
      label(`${z.order}. ${z.name}`, open ? (g.guardiansCalmed.has(id) ? '💖 guardian calmed' : '🔓 open') : `🔒 Ranch Rating ${z.rating}`, x, y, z.color);
    }
    label('Sunny Ranch', '', ...toBig(0, 40), '#ffd166');
    for (const m of this._markers()) {
      const [x, y] = toBig(m.x, m.z);
      this._icon(ctx, m, x, y, true);
    }
    if (g.remote) {
      const [x, y] = toBig(g.remote.target.x, g.remote.target.z);
      this._arrow(ctx, x, y, g.remote.targetYaw, g.remote.color || '#06d6a0', 11);
      ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2b2d42'; ctx.lineWidth = 3;
      ctx.strokeText(g.remote.name, x, y - 18); ctx.fillText(g.remote.name, x, y - 18);
    }
    const [px, py] = toBig(g.player.pos.x, g.player.pos.z);
    this._arrow(ctx, px, py, g.player.yaw, g.profile.color || '#ef476f', 12);
    ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2b2d42'; ctx.lineWidth = 3;
    ctx.strokeText('You', px, py - 19); ctx.fillText('You', px, py - 19);
    const friend = this.full.querySelector('.lg-friend');
    friend.style.display = g.remote ? '' : 'none';
    void LAKE;
  }
}
