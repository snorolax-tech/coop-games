// Zone definitions. The ranch hub sits in the middle; four wild zones surround it,
// one per compass direction. Angle convention: 0 = north (-z), PI/2 = east (+x).

export const HUB_R = 64;      // radius of the flat ranch hub (fence ring)
export const ZONE_R = 80;     // past this radius you're in a wild zone
export const WORLD_R = 345;   // walkable world edge

export const ZONES = {
  ranch: {
    id: 'ranch', name: 'Sunny Ranch', subtitle: 'Home sweet home',
    color: '#ffd166',
  },
  // order = which zone this is in the adventure (1 first, 4 last); levels = wild creature levels
  meadow: {
    id: 'meadow', name: 'Breezy Meadow', subtitle: 'Rolling hills and wildflowers',
    angle: 0, rating: 0, color: '#9be15d', order: 1, levels: '2–7',
  },
  forest: {
    id: 'forest', name: 'Whisperwood Forest', subtitle: 'Tall trees and old secrets',
    angle: Math.PI / 2, rating: 2, color: '#3fa34d', order: 2, levels: '8–14',
  },
  lakeside: {
    id: 'lakeside', name: 'Glimmer Lakeside', subtitle: 'Cool water and soft sand',
    angle: Math.PI, rating: 4, color: '#4cc9f0', order: 3, levels: '13–20',
  },
  volcano: {
    id: 'volcano', name: 'Cinder Hills', subtitle: 'Hot rocks and rumbling peaks',
    angle: -Math.PI / 2, rating: 6, color: '#f3722c', order: 4, levels: '19–28',
  },
};

/** "Zone 2 · Whisperwood Forest" (the ranch is just its name). */
export function zoneTitle(id) {
  const z = ZONES[id];
  return z.order ? `Zone ${z.order} · ${z.name}` : z.name;
}

export const WILD_ZONES = ['meadow', 'forest', 'lakeside', 'volcano'];

/** Unit direction (x, z) pointing from the hub toward a zone. */
export function zoneDir(id) {
  const a = ZONES[id].angle;
  return { x: Math.sin(a), z: -Math.cos(a) };
}

/** Which zone a world position belongs to. */
export function zoneAt(x, z) {
  if (Math.hypot(x, z) < ZONE_R) return 'ranch';
  const a = Math.atan2(x, -z);
  if (Math.abs(a) <= Math.PI / 4) return 'meadow';
  if (a > Math.PI / 4 && a <= (3 * Math.PI) / 4) return 'forest';
  if (a < -Math.PI / 4 && a >= (-3 * Math.PI) / 4) return 'volcano';
  return 'lakeside';
}
