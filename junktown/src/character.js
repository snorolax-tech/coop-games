// Detailed survivor models: the friend you see in the world, and your own first-person arms.
import * as THREE from 'three';
import { itemMesh } from './items.js';

export const PLAYER_COLORS = [0xe76f2a, 0x2f80c4]; // host: orange jacket, guest: blue jacket
const SKIN = 0xe0ac82, JEANS = 0x34465e, BOOT = 0x4a3426, HAIR = 0x2b1d14;

const mats = new Map();
const mat = (c, o = {}) => { const k = c + JSON.stringify(o); if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.85, ...o })); return mats.get(k); };
function box(parent, w, h, d, c, x = 0, y = 0, z = 0, o) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o));
  m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
}
const darker = (c, k = 0.7) => new THREE.Color(c).multiplyScalar(k).getHex();

/** limb = pivot group with an upper part, a joint pivot and a lower part hanging down */
function limb(parent, x, y, upper, lower, cu, cl, end) {
  const top = new THREE.Group(); top.position.set(x, y, 0); parent.add(top);
  box(top, upper[0], upper[1], upper[2], cu, 0, -upper[1] / 2, 0);
  const joint = new THREE.Group(); joint.position.y = -upper[1]; top.add(joint);
  box(joint, lower[0], lower[1], lower[2], cl, 0, -lower[1] / 2, 0);
  let tip = null;
  if (end) { tip = new THREE.Group(); tip.position.y = -lower[1]; joint.add(tip); end(tip); }
  return { top, joint, tip };
}

export class Character {
  constructor(color, label = 'Friend') {
    const g = this.root = new THREE.Group();
    const body = this.body = new THREE.Group(); body.position.y = 0.98; g.add(body); // hips
    const jacket = color, trim = darker(color, 0.6);
    // legs (jeans + boots)
    const leg = (x) => limb(body, x, 0, [0.2, 0.46, 0.22], [0.18, 0.44, 0.2], JEANS, JEANS, (t) => {
      box(t, 0.2, 0.12, 0.32, BOOT, 0, -0.04, 0.05); box(t, 0.21, 0.04, 0.33, 0x1e1510, 0, -0.1, 0.05);
    });
    this.legL = leg(0.12); this.legR = leg(-0.12);
    // torso: jacket, zipper, pockets, collar, belt
    const torso = this.torso = new THREE.Group(); torso.position.y = 0.02; body.add(torso);
    box(torso, 0.56, 0.12, 0.3, 0x2a2018, 0, 0.04, 0);                  // belt
    box(torso, 0.08, 0.07, 0.02, 0xc9a227, 0, 0.04, 0.16);               // buckle
    box(torso, 0.6, 0.62, 0.34, jacket, 0, 0.4, 0);                      // jacket
    box(torso, 0.03, 0.56, 0.02, 0xd8d8d8, 0, 0.4, 0.175);               // zipper
    box(torso, 0.17, 0.12, 0.02, trim, -0.16, 0.24, 0.175); box(torso, 0.17, 0.12, 0.02, trim, 0.16, 0.24, 0.175); // pockets
    box(torso, 0.5, 0.08, 0.36, trim, 0, 0.71, 0);                       // collar
    box(torso, 0.62, 0.06, 0.36, trim, 0, 0.12, 0);                      // jacket hem
    // backpack with straps
    box(torso, 0.44, 0.48, 0.2, 0x55603a, 0, 0.42, -0.27);
    box(torso, 0.36, 0.14, 0.06, 0x434c2c, 0, 0.28, -0.39);
    box(torso, 0.06, 0.6, 0.02, 0x3a3226, 0.17, 0.42, 0.175); box(torso, 0.06, 0.6, 0.02, 0x3a3226, -0.17, 0.42, 0.175);
    box(torso, 0.48, 0.08, 0.16, 0x8a6a3a, 0, 0.7, -0.27);               // bedroll on top
    // head
    const head = this.head = new THREE.Group(); head.position.y = 0.88; torso.add(head);
    box(head, 0.14, 0.1, 0.14, SKIN, 0, -0.06, 0);                       // neck
    box(head, 0.34, 0.36, 0.32, SKIN, 0, 0.17, 0);
    box(head, 0.36, 0.1, 0.34, HAIR, 0, 0.36, -0.01);                    // hair top
    box(head, 0.36, 0.22, 0.06, HAIR, 0, 0.24, -0.15);                   // hair back
    box(head, 0.38, 0.08, 0.36, color, 0, 0.4, 0); box(head, 0.3, 0.03, 0.14, darker(color, 0.8), 0, 0.37, 0.23); // cap + brim
    for (const x of [-0.08, 0.08]) {
      box(head, 0.08, 0.06, 0.02, 0xffffff, x, 0.2, 0.165); box(head, 0.04, 0.05, 0.02, 0x2a1a10, x, 0.2, 0.172);
      box(head, 0.09, 0.025, 0.02, HAIR, x, 0.26, 0.166);                // eyebrows
      box(head, 0.03, 0.07, 0.06, darker(SKIN, 0.9), x * 2.2, 0.17, 0);  // ears
    }
    box(head, 0.06, 0.08, 0.06, darker(SKIN, 0.92), 0, 0.13, 0.18);      // nose
    box(head, 0.12, 0.025, 0.02, 0x8a4a3a, 0, 0.06, 0.165);              // mouth
    // arms: sleeve, forearm, hand
    const arm = (x) => limb(torso, x, 0.66, [0.15, 0.32, 0.17], [0.14, 0.3, 0.15], jacket, jacket, (t) => {
      box(t, 0.15, 0.05, 0.16, trim, 0, 0.02, 0);                        // cuff
      box(t, 0.12, 0.13, 0.12, SKIN, 0, -0.06, 0);                       // hand
    });
    this.armL = arm(0.38); this.armR = arm(-0.38);
    this.hold = new THREE.Group(); this.hold.position.set(0, -0.08, 0.04); this.armR.tip.add(this.hold);
    // name tag
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x2 = c.getContext('2d'); x2.font = 'bold 34px sans-serif'; x2.textAlign = 'center';
    x2.fillStyle = 'rgba(0,0,0,.5)'; x2.fillRect(28, 8, 200, 48); x2.fillStyle = '#' + new THREE.Color(color).getHexString(); x2.fillText(label, 128, 44);
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    this.tag.scale.set(1.2, 0.3, 1); this.tag.position.y = 2.35; g.add(this.tag);
    this.phase = 0; this.heldSig = null; this.swingT = 0;
    this.last = new THREE.Vector3();
  }

  setHeld(parts) {
    const sig = parts ? parts.join(',') : '';
    if (sig === this.heldSig) return;
    this.heldSig = sig;
    this.hold.clear();
    if (parts && parts.length) { const m = itemMesh(parts, 1.0); m.rotation.x = Math.PI / 2; this.hold.add(m); }
  }

  /** pose: {x,y,z,yaw,pitch,down,sw,fl,held,hp} */
  update(dt, p, t) {
    const speed = this.last.distanceTo(_v.set(p.x, 0, p.z)) / Math.max(dt, 1e-4);
    this.last.copy(_v);
    const run = Math.min(1.4, speed / 5.2);
    this.phase += dt * (2 + speed * 1.6);
    this.root.position.set(p.x, p.y, p.z);
    this.root.rotation.set(0, p.yaw + Math.PI, 0);
    this.setHeld(p.held ? p.held.split(',') : null);
    if (p.down) {
      // lying on the ground, reaching up
      this.body.rotation.set(-Math.PI / 2 + 0.1, 0, 0.2); this.body.position.y = 0.25;
      this.armL.top.rotation.set(-2.6 + Math.sin(t * 3) * 0.2, 0, 0); this.armR.top.rotation.set(-0.3, 0, 0);
      this.legL.top.rotation.x = 0.2; this.legR.top.rotation.x = -0.1; this.legL.joint.rotation.x = 0.4;
      this.head.rotation.set(0, 0.4, 0);
      return;
    }
    this.body.rotation.set(0, 0, 0);
    const s = Math.sin(this.phase);
    this.body.position.y = 0.98 + Math.abs(Math.cos(this.phase)) * 0.04 * run;
    this.torso.rotation.x = 0.06 * run + (p.sw ? 0.1 : 0);
    // legs: thigh swing + knee bend on the back swing
    this.legL.top.rotation.x = s * 0.7 * run; this.legR.top.rotation.x = -s * 0.7 * run;
    this.legL.joint.rotation.x = Math.max(0, -s) * 1.1 * run; this.legR.joint.rotation.x = Math.max(0, s) * 1.1 * run;
    // head looks where they aim
    this.head.rotation.x = -(p.pitch || 0) * 0.6;
    // left arm swings, right arm holds the item out front (or swings it)
    this.armL.top.rotation.set(-s * 0.6 * run, 0, 0.08); this.armL.joint.rotation.x = -0.3 - run * 0.3;
    if (p.sw) this.swingT += dt; else this.swingT = 0;
    const swing = p.sw ? Math.sin(Math.min(1, this.swingT / 0.3) * Math.PI) : 0;
    if (this.heldSig) {
      this.armR.top.rotation.set(-1.1 - (p.pitch || 0) * 0.7 - swing * 1.2, swing * 0.8, -0.1);
      this.armR.joint.rotation.x = -0.5 + swing * 0.4;
    } else {
      this.armR.top.rotation.set(s * 0.6 * run, 0, -0.08); this.armR.joint.rotation.x = -0.3 - run * 0.3;
    }
  }
}

/** first-person arms: a sleeve + hand that holds the item (and a support hand for two-handed things) */
export function buildFPArms(color) {
  const g = new THREE.Group();
  const trim = darker(color, 0.6);
  const right = new THREE.Group(); g.add(right);
  // forearm runs from the hand back towards the bottom-right of the screen
  const fore = new THREE.Group(); fore.rotation.set(0.95, 0.35, 0); right.add(fore);
  box(fore, 0.13, 0.13, 0.55, color, 0, 0, 0.32);
  box(fore, 0.145, 0.145, 0.07, trim, 0, 0, 0.06);
  const hand = box(right, 0.12, 0.14, 0.13, SKIN, 0, -0.01, 0.02);
  box(hand, 0.03, 0.08, 0.1, darker(SKIN, 0.9), 0.07, 0.02, 0);          // thumb
  const left = new THREE.Group(); left.visible = false; g.add(left);
  const lf = new THREE.Group(); lf.rotation.set(0.9, -0.5, 0); left.add(lf);
  box(lf, 0.12, 0.12, 0.5, color, 0, 0, 0.3); box(lf, 0.135, 0.135, 0.06, trim, 0, 0, 0.06);
  box(left, 0.11, 0.13, 0.12, SKIN, 0, 0, 0.02);
  return { root: g, right, left };
}
const _v = new THREE.Vector3();
