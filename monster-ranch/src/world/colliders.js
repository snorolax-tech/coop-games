// Simple 2.5D collision world: vertical cylinders, oriented boxes and fence segments,
// each with a top height so the player can jump onto and stand on them (climbable landmarks).
// Stored in a uniform spatial grid so queries stay cheap with thousands of trees.

const CELL = 12;

export class Colliders {
  constructor() {
    this.cells = new Map();
    this.all = [];
  }

  _key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }

  _insert(c) {
    this.all.push(c);
    const x0 = Math.floor((c.minX) / CELL), x1 = Math.floor((c.maxX) / CELL);
    const z0 = Math.floor((c.minZ) / CELL), z1 = Math.floor((c.maxZ) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const k = this._key(cx, cz);
      let list = this.cells.get(k);
      if (!list) this.cells.set(k, (list = []));
      list.push(c);
    }
    return c;
  }

  /** Vertical cylinder. top = world Y of its top surface; bottom defaults to -100. */
  circle(x, z, r, top, bottom = -100) {
    return this._insert({ type: 'circle', x, z, r, top, bottom, minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, active: true });
  }

  /** Box centered at (x, z) with half extents hw (local x) / hd (local z), rotated by rot (radians, around Y). */
  box(x, z, hw, hd, rot, top, bottom = -100) {
    const ext = Math.hypot(hw, hd);
    return this._insert({ type: 'box', x, z, hw, hd, rot, cos: Math.cos(rot), sin: Math.sin(rot), top, bottom,
      minX: x - ext, maxX: x + ext, minZ: z - ext, maxZ: z + ext, active: true });
  }

  /** Thick line segment (fences, walls). */
  segment(ax, az, bx, bz, r, top, bottom = -100) {
    return this._insert({ type: 'seg', ax, az, bx, bz, r, top, bottom,
      minX: Math.min(ax, bx) - r, maxX: Math.max(ax, bx) + r, minZ: Math.min(az, bz) - r, maxZ: Math.max(az, bz) + r, active: true });
  }

  query(x, z, r, out = []) {
    out.length = 0;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const list = this.cells.get(this._key(cx, cz));
      if (!list) continue;
      for (const c of list) if (c.active && !seen.has(c)) { seen.add(c); out.push(c); }
    }
    return out;
  }

  /**
   * Penetration of a circle (px, pz, pr) into collider c.
   * Returns null if not touching, else { nx, nz, depth } (push direction + amount).
   */
  static penetration(c, px, pz, pr) {
    if (c.type === 'circle') {
      const dx = px - c.x, dz = pz - c.z;
      const d = Math.hypot(dx, dz);
      const depth = c.r + pr - d;
      if (depth <= 0) return null;
      return d > 1e-5 ? { nx: dx / d, nz: dz / d, depth } : { nx: 1, nz: 0, depth };
    }
    if (c.type === 'box') {
      // to local space
      const dx = px - c.x, dz = pz - c.z;
      const lx = dx * c.cos - dz * c.sin;
      const lz = dx * c.sin + dz * c.cos;
      const qx = Math.max(-c.hw, Math.min(c.hw, lx));
      const qz = Math.max(-c.hd, Math.min(c.hd, lz));
      let ex = lx - qx, ez = lz - qz;
      const d = Math.hypot(ex, ez);
      let nlx, nlz, depth;
      if (d > 1e-5) {
        depth = pr - d;
        if (depth <= 0) return null;
        nlx = ex / d; nlz = ez / d;
      } else {
        // centre inside the box: push out through the nearest face
        const fx = c.hw - Math.abs(lx), fz = c.hd - Math.abs(lz);
        if (fx < fz) { nlx = Math.sign(lx) || 1; nlz = 0; depth = fx + pr; }
        else { nlx = 0; nlz = Math.sign(lz) || 1; depth = fz + pr; }
      }
      // back to world space (inverse rotation)
      return { nx: nlx * c.cos + nlz * c.sin, nz: -nlx * c.sin + nlz * c.cos, depth };
    }
    // segment
    const vx = c.bx - c.ax, vz = c.bz - c.az;
    const len2 = vx * vx + vz * vz;
    let t = len2 > 0 ? ((px - c.ax) * vx + (pz - c.az) * vz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = c.ax + vx * t, cz = c.az + vz * t;
    const dx = px - cx, dz = pz - cz;
    const d = Math.hypot(dx, dz);
    const depth = c.r + pr - d;
    if (depth <= 0) return null;
    return d > 1e-5 ? { nx: dx / d, nz: dz / d, depth } : { nx: -vz, nz: vx, depth };
  }

  /** True if point (px, pz) is over the collider's footprint (used for standing on top). */
  static covers(c, px, pz, pad = 0) {
    if (c.type === 'circle') return Math.hypot(px - c.x, pz - c.z) <= c.r + pad;
    if (c.type === 'box') {
      const dx = px - c.x, dz = pz - c.z;
      const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
      return Math.abs(lx) <= c.hw + pad && Math.abs(lz) <= c.hd + pad;
    }
    return !!Colliders.penetration(c, px, pz, pad + 0.001);
  }
}
