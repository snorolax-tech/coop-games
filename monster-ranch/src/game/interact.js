// What-am-I-looking-at system: raycasts from the camera centre against registered
// interactables, highlights the hit one, and dispatches E (use) / tool hits.
import * as THREE from 'three';

const ray = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);
const hlCache = new WeakMap();

function highlightMat(m) {
  let h = hlCache.get(m);
  if (!h) {
    h = m.clone();
    if (h.emissive) h.emissive = new THREE.Color(0x554422).add(m.emissive || new THREE.Color(0));
    hlCache.set(m, h);
  }
  return h;
}

export class Interactions {
  constructor(camera) {
    this.camera = camera;
    this.list = [];
    this.byId = new Map();
    this.target = null;
    this.range = 4.5;
    this.hitDist = Infinity;
    this._wp = new THREE.Vector3();
  }

  /**
   * def: { id (stable network id), root, name, color?, sub?: string|() => string,
   *        use?: (actor) => void, hit?: (actor, toolId) => void,
   *        enabled?: () => boolean, range?: number (look range), useRange?: number }
   * An "actor" is whoever performed the action (local player or the remote guest):
   *   { id, name, inventory, give(item, n, quiet), toast(msg, kind) }
   */
  add(def) {
    def.root.traverse((o) => { o.userData.interactable = def; });
    this.list.push(def);
    if (def.id) this.byId.set(def.id, def);
    return def;
  }

  remove(def) {
    const i = this.list.indexOf(def);
    if (i >= 0) this.list.splice(i, 1);
    if (def.id && this.byId.get(def.id) === def) this.byId.delete(def.id);
    if (this.target === def) this._setTarget(null);
  }

  _setTarget(t) {
    if (this.target === t) return;
    if (this.target) this._highlight(this.target, false);
    this.target = t;
    if (t) this._highlight(t, true);
  }

  _highlight(def, on) {
    def.root.traverse((o) => {
      if (!o.isMesh || o.userData.noHighlight) return;
      if (on) { o.userData.baseMat = o.material; o.material = Array.isArray(o.material) ? o.material.map(highlightMat) : highlightMat(o.material); }
      else if (o.userData.baseMat) { o.material = o.userData.baseMat; delete o.userData.baseMat; }
    });
  }

  update() {
    const camPos = this.camera.getWorldPosition(this._wp);
    const near = [];
    for (const d of this.list) {
      if (d.enabled && !d.enabled()) continue;
      if (!d.root.visible) continue;
      d.root.getWorldPosition(tmp);
      const r = (d.range || this.range) + 6;
      if (tmp.distanceToSquared(camPos) < r * r) near.push(d.root);
    }
    let found = null;
    this.hitDist = Infinity;
    if (near.length) {
      ray.setFromCamera(center, this.camera);
      ray.far = 50;
      const hits = ray.intersectObjects(near, true);
      for (const h of hits) {
        const def = h.object.userData.interactable;
        if (!def || !h.object.visible || h.object.isSprite) continue;
        if (h.distance <= (def.range || this.range)) { found = def; this.hitPoint = h.point; this.hitDist = h.distance; }
        break;
      }
    }
    this._setTarget(found);
    return found;
  }

  /** Close enough to press E / swing a tool at the current target? */
  inUseRange(def = this.target) {
    return !!def && this.hitDist <= (def.useRange || def.range || this.range);
  }

  subtitle(def) {
    if (!def) return '';
    return typeof def.sub === 'function' ? def.sub() : (def.sub || '');
  }
}
const tmp = new THREE.Vector3();
