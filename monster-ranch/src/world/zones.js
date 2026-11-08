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
  meadow: {
    id: 'meadow', name: 'Breezy Meadow', subtitle: 'Rolling hills and wildflowers',
    angle: 0, rating: 0, color: '#9be15d',
  },
  forest: {
    id: 'forest', name: 'Whisperwood Forest', subtitle: 'Tall trees and old secrets',
    angle: Math.PI / 2, rating: 2, color: '#3fa34d',
  },
  lakeside: {
    id: 'lakeside', name: 'Glimmer Lakeside', subtitle: 'Cool water and soft sand',
    angle: Math.PI, rating: 4, color: '#4cc9f0',
  },
  volcano: {
    id: 'volcano', name: 'Cinder Hills', subtitle: 'Hot rocks and rumbling peaks',
    angle: -Math.PI / 2, rating: 6, color: '#f3722c',
  },
};

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
