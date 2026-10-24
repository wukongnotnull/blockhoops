// Ball flight with independent rim, backboard and net interactions for both hoops.
import { BALL, GRAVITY, HOOP, COURT } from './config.js';
import { hoopPosition, hoopSide } from './geometry.js';

const SUBSTEPS = 4;
const HOOPS = [0, 1].map((h) => ({ index: h, side: hoopSide(h), ...hoopPosition(h) }));
const BOARD_FACE_X = COURT.halfL - HOOP.boardFromBaseline;
const RIM_CONTACT = BALL.radius + HOOP.rimTube;
const MIN_BOUNCE = 0.35;

export function createBall(pos, vel = { x: 0, y: 0, z: 0 }) {
  return { pos: { ...pos }, vel: { ...vel }, inNet: [false, false] };
}

/** Initial velocity that carries a ball from `from` to `to` in `flightTime` seconds. */
export function solveLaunch(from, to, flightTime) {
  const T = flightTime;
  return {
    x: (to.x - from.x) / T,
    y: (to.y - from.y + 0.5 * GRAVITY * T * T) / T,
    z: (to.z - from.z) / T,
  };
}

function bounce(p, v, nx, ny, nz, depth, restitution, friction) {
  const pos = { x: p.x + nx * depth, y: p.y + ny * depth, z: p.z + nz * depth };
  const vn = v.x * nx + v.y * ny + v.z * nz;
  if (vn >= 0) return { pos, vel: v, hit: false };
  const t = { x: v.x - vn * nx, y: v.y - vn * ny, z: v.z - vn * nz };
  const out = -vn * restitution;
  return {
    pos,
    vel: { x: t.x * friction + nx * out, y: t.y * friction + ny * out, z: t.z * friction + nz * out },
    hit: true,
  };
}

function collideRim(p, v, hoop) {
  const dx = p.x - hoop.x;
  const dz = p.z - hoop.z;
  const hr = Math.hypot(dx, dz);
  if (hr < 1e-6) return null;
  const q = { x: hoop.x + (HOOP.rimRadius * dx) / hr, y: hoop.y, z: hoop.z + (HOOP.rimRadius * dz) / hr };
  const n = { x: p.x - q.x, y: p.y - q.y, z: p.z - q.z };
  const d = Math.hypot(n.x, n.y, n.z);
  if (d >= RIM_CONTACT || d < 1e-9) return null;
  return bounce(p, v, n.x / d, n.y / d, n.z / d, RIM_CONTACT - d, BALL.rimRestitution, 0.88);
}

function collideBoard(p, v, hoop) {
  const face = hoop.side * BOARD_FACE_X;
  const back = face + hoop.side * HOOP.boardThickness;
  const cx = Math.min(Math.max(p.x, Math.min(face, back)), Math.max(face, back));
  const cy = Math.min(Math.max(p.y, HOOP.boardBottom), HOOP.boardTop);
  const cz = Math.min(Math.max(p.z, -HOOP.boardHalfWidth), HOOP.boardHalfWidth);
  const n = { x: p.x - cx, y: p.y - cy, z: p.z - cz };
  const d = Math.hypot(n.x, n.y, n.z);
  if (d >= BALL.radius) return null;
  if (d < 1e-9) return bounce(p, v, -hoop.side, 0, 0, BALL.radius, BALL.boardRestitution, 0.9);
  return bounce(p, v, n.x / d, n.y / d, n.z / d, BALL.radius - d, BALL.boardRestitution, 0.9);
}

function insideNet(p, hoop) {
  const r = Math.hypot(p.x - hoop.x, p.z - hoop.z);
  return r < HOOP.rimRadius && p.y < hoop.y && p.y > hoop.y - HOOP.netDepth;
}

function netDrag(p, v, h, hoop) {
  const k = 1 - 6 * h;
  return {
    x: v.x * k - (p.x - hoop.x) * 10 * h,
    y: v.y * (1 - 2.2 * h),
    z: v.z * k - (p.z - hoop.z) * 10 * h,
  };
}

function collideFloor(p, v, h) {
  if (p.y >= BALL.radius) return null;
  const pos = { ...p, y: BALL.radius };
  if (v.y >= 0) return { pos, vel: v, impact: false };
  const vy = -v.y * BALL.restitution;
  const rolling = vy < MIN_BOUNCE;
  const fr = rolling ? 1 - 1.8 * h : 0.9;
  return { pos, vel: { x: v.x * fr, y: rolling ? 0 : vy, z: v.z * fr }, impact: -v.y > 0.6 };
}

/**
 * Advance a free ball by dt. Returns a new ball, contact events tagged by hoop, and
 * the hoops whose rim plane the ball crossed downward through the hoop opening.
 */
export function stepBall(ball, dt) {
  let p = { ...ball.pos };
  let v = { ...ball.vel };
  const inNet = [...ball.inNet];
  const contacts = [];
  const baskets = [];
  const h = dt / SUBSTEPS;

  for (let i = 0; i < SUBSTEPS; i += 1) {
    const prev = p;
    v = { ...v, y: v.y - GRAVITY * h };
    p = { x: p.x + v.x * h, y: p.y + v.y * h, z: p.z + v.z * h };

    for (const hoop of HOOPS) {
      if (prev.y >= hoop.y && p.y < hoop.y && v.y < 0) {
        const t = (prev.y - hoop.y) / (prev.y - p.y);
        const cx = prev.x + (p.x - prev.x) * t;
        const cz = prev.z + (p.z - prev.z) * t;
        if (Math.hypot(cx - hoop.x, cz - hoop.z) < HOOP.rimRadius) baskets.push(hoop.index);
      }
      const rim = collideRim(p, v, hoop);
      if (rim) {
        ({ pos: p, vel: v } = rim);
        if (rim.hit) contacts.push({ type: 'rim', hoop: hoop.index });
      }
      const board = collideBoard(p, v, hoop);
      if (board) {
        ({ pos: p, vel: v } = board);
        if (board.hit) contacts.push({ type: 'board', hoop: hoop.index });
      }
      const nowInNet = insideNet(p, hoop);
      if (nowInNet) {
        v = netDrag(p, v, h, hoop);
        if (!inNet[hoop.index]) contacts.push({ type: 'net', hoop: hoop.index });
      }
      inNet[hoop.index] = nowInNet;
    }

    const floor = collideFloor(p, v, h);
    if (floor) {
      ({ pos: p, vel: v } = floor);
      if (floor.impact) contacts.push({ type: 'floor', hoop: -1 });
    }
  }
  return { ball: { pos: p, vel: v, inNet }, contacts, baskets };
}
