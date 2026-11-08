// Client-side battle visuals (runs on host and guest): partner creature models, attack
// lunges, type-coloured impact bursts, damage numbers, faints, and the Bond Orb catch
// sequence (orb drops, wobbles, then either sparkles or bursts open).
import * as THREE from 'three';
import { SPECIES_BY_ID } from '../data/creatures.js';
import { TYPES } from '../data/types.js';
import { buildCreatureModel } from '../creatures/model.js';
import { makeOrbMesh } from '../physics/projectiles.js';

function textSprite(text, color) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 96;
  const ctx = cv.getContext('2d');
  ctx.font = 'bold 64px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 10; ctx.strokeStyle = '#2b2d42'; ctx.lineJoin = 'round';
  ctx.strokeText(text, 128, 50);
  ctx.fillStyle = color; ctx.fillText(text, 128, 50);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.6, 0.6, 1);
  s.renderOrder = 30;
  return s;
}

export class BattleView {
  constructor(game) {
    this.game = game;
    this.allies = new Map();  // key -> { model, target: Vector3, yaw, species }
    this.state = [];
    this.anims = [];          // { obj (Object3D), kind, t, dir }
    this.texts = [];
    this.catches = [];
  }

  get scene() { return this.game.scene; }

  /** Battle list from the host. */
  apply(list) {
    this.state = list;
    const keep = new Set();
    for (const b of list) {
      for (const a of b.allies) {
        keep.add(a.key);
        let e = this.allies.get(a.key);
        if (!e) {
          const model = buildCreatureModel(SPECIES_BY_ID[a.sp], { shiny: a.shiny });
          model.root.position.set(a.x, a.y, a.z);
          model.root.rotation.y = a.yaw;
          this.scene.add(model.root);
          e = { model, target: new THREE.Vector3(a.x, a.y, a.z), yaw: a.yaw, off: new THREE.Vector3() };
          this.allies.set(a.key, e);
          this.game.fx.puff(e.target.clone().add(new THREE.Vector3(0, 0.6, 0)), 0xffffff, 16);
          this.game.fx.sparkle(e.target.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xfff3b0, 10);
        }
        e.target.set(a.x, a.y, a.z);
        e.yaw = a.yaw;
        e.chose = a.chose;
        e.hp = a.hp;
      }
    }
    for (const [key, e] of this.allies) {
      if (keep.has(key)) continue;
      this.game.fx.puff(e.model.root.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 0xffffff, 12);
      this.scene.remove(e.model.root);
      this.allies.delete(key);
    }
  }

  /** Find the Object3D + info for a battler key. */
  _find(key) {
    const a = this.allies.get(key);
    if (a) return { root: a.model.root, height: a.model.height, entry: a };
    for (const b of this.state) {
      const f = b.foes.find((x) => x.key === key);
      if (f) {
        const c = this.game.creatures.list.get(f.nid);
        if (c) return { root: c.root, height: c.view.height, wild: c };
      }
    }
    return null;
  }

  event(ev) {
    const g = this.game;
    if (ev.sendOut) g.audio.play('chime');
    if (ev.a && ev.t && ev.r) {
      const att = this._find(ev.a), tgt = this._find(ev.t);
      if (!att || !tgt) return;
      const dir = new THREE.Vector3().subVectors(tgt.root.position, att.root.position).setY(0).normalize();
      this.anims.push({ who: ev.a, kind: 'lunge', t: 0, dur: 0.45, dir });
      const r = ev.r;
      const color = new THREE.Color(TYPES[r.type].color).getHex();
      setTimeout(() => {
        const hit = tgt.root.position.clone().add(new THREE.Vector3(0, tgt.height * 0.55, 0));
        const self = att.root.position.clone().add(new THREE.Vector3(0, att.height * 0.6, 0));
        if (r.miss) { this._text(hit, 'MISS', '#ffffff'); g.audio.play('swing'); return; }
        if (r.dmg) {
          g.fx.puff(hit, color, 10 + Math.round(r.dmg / 3));
          if (r.crit || r.eff > 1) g.fx.sparkle(hit, 0xffffff, 16);
          this.anims.push({ who: ev.t, kind: 'hit', t: 0, dur: 0.4, dir });
          this._text(hit, String(r.dmg), r.eff > 1 ? '#ffd166' : r.eff < 1 ? '#b8c0cc' : '#ffffff');
          g.audio.play(r.eff > 1 ? 'knock' : 'bounce', 1);
          if (att.entry || tgt.entry) g.player.shake = Math.max(g.player.shake, r.eff > 1 ? 0.5 : 0.25);
        }
        if (r.heal) { g.fx.sparkle(self, 0x7dffb0, 14); this._text(self, '+' + r.heal, '#7dffb0'); }
        if (r.statMsg?.changed) g.fx.sparkle(r.statMsg.who === 'self' ? self : hit, r.statMsg.up ? 0xffe066 : 0x9aa5b1, 12);
        if (r.status) g.fx.puff(hit, color, 14);
      }, 230);
    }
    if (ev.combo) {
      const cols = ev.types.map((t) => new THREE.Color(TYPES[t].color).getHex());
      for (const k of ev.pair) this.anims.push({ who: k, kind: 'hit', t: 0, dur: 0.5, dir: new THREE.Vector3(0, 0, 0) });
      g.hud.banner(`💥 ${ev.combo}!`, 'Co-op combo attack', TYPES[ev.types[0]].color);
      g.audio.play('chime'); g.audio.play('knock');
      g.player.shake = 1.2;
      ev.hits.forEach((h, i) => {
        const tgt = this._find(h.t);
        if (!tgt) return;
        const base = tgt.root.position.clone().add(new THREE.Vector3(0, tgt.height * 0.55, 0));
        for (let w = 0; w < 4; w++) {
          setTimeout(() => {
            g.fx.puff(base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2)), cols[w % 2], 22);
            g.fx.sparkle(base, cols[(w + 1) % 2], 18);
          }, 120 * w + i * 60);
        }
        setTimeout(() => {
          this.anims.push({ who: h.t, kind: 'hit', t: 0, dur: 0.6, dir: new THREE.Vector3(1, 0, 0) });
          this._text(base.clone().add(new THREE.Vector3(0, 0.5, 0)), String(h.dmg), '#ffd166');
          g.audio.play('splash');
        }, 450);
      });
    }
    if (ev.burn) {
      const t = this._find(ev.a);
      if (t) { const p = t.root.position.clone().add(new THREE.Vector3(0, t.height * 0.6, 0)); g.fx.puff(p, 0xff6b1a, 10); this._text(p, String(ev.burn), '#ff9b5a'); }
    }
    if (ev.skip) {
      const t = this._find(ev.a);
      if (t) this._text(t.root.position.clone().add(new THREE.Vector3(0, t.height + 0.2, 0)), ev.skip === 'sleep' ? 'Zz' : '⚡', '#ffffff');
    }
    if (ev.faint) {
      const t = this._find(ev.faint);
      if (t?.entry) this.anims.push({ who: ev.faint, kind: 'faint', t: 0, dur: 0.8 });
      g.audio.play('land');
    }
    if (ev.end === 'win') g.audio.play('chime');
  }

  _text(pos, text, color) {
    const s = textSprite(text, color);
    s.position.copy(pos);
    this.scene.add(s);
    this.texts.push({ s, t: 0 });
  }

  // ---------- catching ----------

  /** ev: { nid, p: [x,y,z], shakes, ok } */
  playCatch(ev) {
    const c = this.game.creatures.list.get(ev.nid);
    const orb = makeOrbMesh(1.4);
    const p = new THREE.Vector3(...ev.p);
    orb.position.copy(p);
    this.scene.add(orb);
    if (c) { c.captured = true; this.game.fx.sparkle(c.center.clone(), 0xffffff, 18); }
    this.game.audio.play('open');
    const ground = this.game.world.groundY(p.x, p.z) + 0.2;
    this.catches.push({ orb, c, ev, t: 0, ground, start: p.clone(), done: false, dur: 0.7 + ev.shakes * 0.75 + 0.3 });
  }

  _updateCatch(k, dt) {
    k.t += dt;
    const { orb, ev } = k;
    if (k.t < 0.6) {
      const f = k.t / 0.6;
      orb.position.y = k.start.y + (k.ground - k.start.y) * f * f;
      orb.rotation.y += dt * 10;
    } else {
      const st = k.t - 0.7;
      const i = Math.floor(st / 0.75);
      const local = st - i * 0.75;
      orb.position.y = k.ground;
      if (st > 0 && i < ev.shakes) {
        orb.rotation.z = local < 0.4 ? Math.sin(local / 0.4 * Math.PI * 2) * 0.45 : 0;
        if (local < dt * 1.5) this.game.audio.play('bounce', 0.7);
      }
    }
    if (k.t >= k.dur && !k.done) {
      k.done = true;
      const pos = orb.position.clone();
      if (ev.ok) {
        this.game.fx.sparkle(pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 0xffe066, 30);
        this.game.audio.play('chime');
        k.linger = 1.2;
      } else {
        this.game.fx.puff(pos, 0xffffff, 18);
        this.game.audio.play('splash');
        if (k.c) k.c.captured = false;
        k.linger = 0;
      }
    }
    if (k.done) {
      k.linger -= dt;
      if (ev.ok) orb.scale.setScalar(Math.max(0.01, 1.4 * Math.min(1, k.linger)));
      if (k.linger <= 0) { this.scene.remove(orb); return false; }
    }
    return true;
  }

  update(dt) {
    // partner models
    for (const e of this.allies.values()) {
      const r = e.model.root;
      const before = r.position.clone();
      r.position.lerp(e.target, 1 - Math.exp(-8 * dt));
      r.rotation.y += ((((e.yaw - r.rotation.y) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 8);
      const speed = before.distanceTo(r.position) / Math.max(dt, 1e-4);
      e.model.update(dt, { speed, excited: e.chose ? 0.6 : 0.2 });
    }
    // attack / hit / faint animations (applied as offsets after normal positioning)
    this.anims = this.anims.filter((a) => {
      a.t += dt;
      const f = this._find(a.who);
      if (!f) return false;
      const k = Math.min(1, a.t / a.dur);
      if (a.kind === 'lunge') f.root.position.addScaledVector(a.dir, Math.sin(k * Math.PI) * 1.2);
      else if (a.kind === 'hit') { f.root.position.addScaledVector(a.dir, Math.sin(k * Math.PI) * 0.35); f.root.position.x += Math.sin(a.t * 60) * 0.06 * (1 - k); }
      else if (a.kind === 'faint') { f.root.rotation.z = k * 1.4; f.root.position.y -= k * 0.2; }
      return a.t < a.dur || a.kind === 'faint';
    });
    this.texts = this.texts.filter((x) => {
      x.t += dt;
      x.s.position.y += dt * 0.9;
      x.s.material.opacity = Math.max(0, 1 - x.t / 1.1);
      if (x.t > 1.1) { this.scene.remove(x.s); x.s.material.map.dispose(); return false; }
      return true;
    });
    this.catches = this.catches.filter((k) => this._updateCatch(k, dt));
  }

  /** The battle I'm in (by owner id), if any. */
  mine(ownerId) { return this.state.find((b) => b.allies.some((a) => a.owner === ownerId)) || null; }

  clear() { this.apply([]); for (const k of this.catches) this.scene.remove(k.orb); this.catches = []; }
}
