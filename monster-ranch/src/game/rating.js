// Ranch Rating: a shared score that grows as the two ranchers explore and befriend
// creatures. Each rating level unlocks more of the world (zones list their required
// rating in world/zones.js). Stage 4+ will add ranch buildings and happiness as sources.

// Points needed to reach rating 1, 2, 3, ...
export const THRESHOLDS = [10, 22, 36, 52, 70, 90, 115, 145, 180, 220];
export const MAX_RATING = THRESHOLDS.length;

export const SOURCES = {
  seen:      { label: 'Dex species seen',        pts: 1 },
  caught:    { label: 'Dex species befriended',  pts: 3 },
  creatures: { label: 'Creatures befriended',    pts: 1 },
  landmarks: { label: 'Landmarks discovered',    pts: 5 },
  wins:      { label: 'Battles won',             pts: 1, cap: 30 },
};

/** counts: { seen, caught, creatures, landmarks, wins } -> { points, breakdown } */
export function ratingPoints(counts) {
  let points = 0;
  const breakdown = [];
  for (const [k, s] of Object.entries(SOURCES)) {
    const n = Math.min(counts[k] || 0, s.cap ?? Infinity);
    points += n * s.pts;
    breakdown.push({ key: k, label: s.label, count: counts[k] || 0, pts: n * s.pts, each: s.pts, cap: s.cap });
  }
  return { points, breakdown };
}

export function ratingLevel(points) {
  let lvl = 0;
  while (lvl < THRESHOLDS.length && points >= THRESHOLDS[lvl]) lvl++;
  return lvl;
}

/** { level, points, prev (points at this level), next (points for next level or null) } */
export function ratingInfo(points) {
  const level = ratingLevel(points);
  return { level, points, prev: level ? THRESHOLDS[level - 1] : 0, next: level < MAX_RATING ? THRESHOLDS[level] : null };
}
