import { COURT, HOOP, ARC_RADIUS, BEHIND_BOARD_HALF, INBOUND_OFFSET } from './config.js';

const RIM_X = COURT.halfL - HOOP.fromBaseline;

/** Sign of the hoop's end of the court: -1 for the west hoop (0), +1 for the east hoop (1). */
export const hoopSide = (hoopIndex) => (hoopIndex === 0 ? -1 : 1);

/** @returns {{x:number,y:number,z:number}} rim centre in world space */
export function hoopPosition(hoopIndex) {
  return { x: hoopSide(hoopIndex) * RIM_X, y: HOOP.rimHeight, z: 0 };
}

/**
 * World (x,z) to a hoop's local floor frame. Origin under the rim, u points out
 * toward centre court, v is lateral. Both hoops share the same frame up to a 180° turn.
 */
export function toLocal(hoopIndex, x, z) {
  const s = hoopSide(hoopIndex);
  return { u: RIM_X - s * x, v: s * z };
}

export function fromLocal(hoopIndex, u, v) {
  const s = hoopSide(hoopIndex);
  return { x: s * (RIM_X - u), z: s * v };
}

export const distToHoop = (hoopIndex, x, z) => {
  const l = toLocal(hoopIndex, x, z);
  return Math.hypot(l.u, l.v);
};

/** 2 points from beyond the 6 m arc of the given basket, otherwise 1. */
export function shotValue(hoopIndex, x, z) {
  return distToHoop(hoopIndex, x, z) > ARC_RADIUS ? 2 : 1;
}

export function isInBounds(x, z, margin = 0) {
  return Math.abs(x) <= COURT.halfL - margin && Math.abs(z) <= COURT.halfW - margin;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Keep a baseline spot out of the strip behind the backboard. */
function clearOfBoard(z) {
  if (Math.abs(z) >= BEHIND_BOARD_HALF) return z;
  return (z < 0 ? -1 : 1) * BEHIND_BOARD_HALF;
}

/** Inbound spot just outside the line the ball crossed, near where it left the court. */
export function inboundSpotFromExit(x, z) {
  const overL = Math.abs(x) - COURT.halfL;
  const overW = Math.abs(z) - COURT.halfW;
  if (overW >= overL) {
    return {
      x: clamp(x, -COURT.halfL + 1, COURT.halfL - 1),
      z: Math.sign(z || 1) * (COURT.halfW + INBOUND_OFFSET),
      line: 'sideline',
    };
  }
  return {
    x: Math.sign(x || 1) * (COURT.halfL + INBOUND_OFFSET),
    z: clearOfBoard(clamp(z, -COURT.halfW + 0.8, COURT.halfW - 0.8)),
    line: 'baseline',
  };
}

/** Spot behind the baseline of the given basket, on the chosen side (+1/-1) of the board. */
export function baselineInboundSpot(hoopIndex, side) {
  const p = fromLocal(hoopIndex, -(HOOP.fromBaseline + INBOUND_OFFSET), side * (BEHIND_BOARD_HALF + 0.6));
  return { ...p, line: 'baseline' };
}

export const clampToCourt = (x, z, margin = 0.3) => ({
  x: clamp(x, -COURT.halfL + margin, COURT.halfL - margin),
  z: clamp(z, -COURT.halfW + margin, COURT.halfW - margin),
});

export const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
