// Spatial helpers for the full-court AI. All calculations are expressed in the local
// frame of the basket involved, so both ends of the floor behave identically.
import { OFFENSE_SPOTS } from './config.js';
import { toLocal, fromLocal, dist2 } from './geometry.js';

const MIN_RIM_GAP = 1.3;

function permutations(items, k) {
  if (k === 0) return [[]];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)], k - 1)
    .map((rest) => [item, ...rest]));
}

/** Unique man-to-man matchups with the smallest total distance. Returns { defenderId: attackerId }. */
export function assignDefenders(defenders, attackers) {
  let best = null;
  let bestCost = Infinity;
  for (const perm of permutations(attackers, Math.min(defenders.length, attackers.length))) {
    const cost = perm.reduce((sum, att, i) => sum + dist2(defenders[i].pos, att.pos), 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = perm;
    }
  }
  return Object.fromEntries(defenders.slice(0, best.length).map((d, i) => [d.id, best[i].id]));
}

/** Unique settled-offense spots for the off-ball players, skipping the area the handler occupies. */
export function assignSpots(hoop, handler, others) {
  const hl = toLocal(hoop, handler.pos.x, handler.pos.z);
  const free = OFFENSE_SPOTS.filter((s) => Math.hypot(s.u - hl.u, s.v - hl.v) > 2.6)
    .map((s) => fromLocal(hoop, s.u, s.v));
  let best = null;
  let bestCost = Infinity;
  for (const perm of permutations(free, others.length)) {
    const cost = perm.reduce((sum, spot, i) => sum + dist2(others[i].pos, spot), 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = perm;
    }
  }
  return Object.fromEntries(others.map((p, i) => [p.id, best[i]]));
}

const LANES = Object.freeze({
  left: { u: 2.4, v: -5.9 },
  right: { u: 2.4, v: 5.9 },
  trailer: { u: 8.2, v: -1.2 },
});

/** Fast-break lanes: the widest runners fill the wings, anyone in between trails. */
export function transitionLanes(hoop, runners) {
  const sorted = [...runners].sort((a, b) => toLocal(hoop, a.pos.x, a.pos.z).v - toLocal(hoop, b.pos.x, b.pos.z).v);
  let order;
  if (sorted.length === 1) order = ['trailer'];
  else if (sorted.length === 2) order = ['left', 'right'];
  else order = ['left', ...sorted.slice(1, -1).map(() => 'trailer'), 'right'];
  return Object.fromEntries(sorted.map((p, i) => {
    const lane = LANES[order[i]];
    const offset = order[i] === 'trailer' ? i - 1 : 0;
    return [p.id, fromLocal(hoop, lane.u + offset * 1.5, lane.v + offset * 2.4)];
  }));
}

/** Goal-side position on a man: tight on the ball, sagging toward help off the ball. */
export function manDefenseSpot(hoop, man, ballPos, onBall) {
  const m = toLocal(hoop, man.x, man.z);
  const len = Math.hypot(m.u, m.v) || 1;
  const fromBall = dist2(man, ballPos);
  const gap = Math.min(onBall ? 1.0 : Math.min(3.0, 1.4 + 0.16 * fromBall), len * 0.45);
  let u = m.u - (m.u / len) * gap;
  let v = m.v - (m.v / len) * gap;
  if (!onBall) {
    const b = toLocal(hoop, ballPos.x, ballPos.z);
    u += (b.u - u) * 0.12;
    v += (b.v - v) * 0.12;
  }
  const r = Math.hypot(u, v);
  if (r < MIN_RIM_GAP) {
    const k = MIN_RIM_GAP / (r || 1);
    u = r ? u * k : MIN_RIM_GAP;
    v *= r ? k : 1;
  }
  return fromLocal(hoop, u, v);
}

const RETREAT = Object.freeze([
  { u: 2.8, v: -2.3 }, { u: 2.8, v: 2.3 }, { u: 5.6, v: -1.4 }, { u: 5.6, v: 1.4 },
]);

/** Deep spots defenders sprint to while getting back, one per slot. */
export function retreatSpot(hoop, slot) {
  const s = RETREAT[slot % RETREAT.length];
  return fromLocal(hoop, s.u, s.v);
}

/** Distance from point p to segment a-b on the floor. */
export function distToSegment(p, a, b) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2));
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
}
