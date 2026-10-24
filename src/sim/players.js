// Player bodies: creation, steering and separation. Pure functions over plain objects.
import { TEAMS, TEAM_SIZE, PLAYER_RADIUS, COURT } from './config.js';
import { fromLocal, clampToCourt } from './geometry.js';

const ACCEL = 16;
const SEPARATION = PLAYER_RADIUS * 2.1;
const JUMP_TIME = 0.55;
const HEIGHTS = [1.88, 1.95, 2.02, 1.84];

/** Tip-off formation: each team spread in the half it defends. */
export function createPlayers() {
  return TEAMS.flatMap((team) => Array.from({ length: TEAM_SIZE }, (_, slot) => {
    const defended = 1 - team.attackHoop;
    const spot = fromLocal(defended, 6 + (slot % 2) * 3, (slot - 1.5) * 3);
    return {
      id: team.id * TEAM_SIZE + slot,
      team: team.id,
      slot,
      number: [3, 7, 11, 23, 0, 5, 12, 33][team.id * TEAM_SIZE + slot],
      height: HEIGHTS[slot],
      pos: spot,
      vel: { x: 0, z: 0 },
      facing: team.attackHoop === 1 ? 0 : Math.PI,
      jump: 0,
    };
  }));
}

export const jumpHeight = (p) => (p.jump > 0 ? Math.sin(Math.PI * (1 - p.jump / JUMP_TIME)) * 0.45 : 0);
export const startJump = (p) => ({ ...p, jump: JUMP_TIME });

/**
 * Move a player toward an intent { target, speed, allowOut, face }. Others are used for
 * separation so bodies do not stack on top of each other.
 */
export function movePlayer(p, intent, others, dt) {
  const dx = intent.target.x - p.pos.x;
  const dz = intent.target.z - p.pos.z;
  const d = Math.hypot(dx, dz);
  const speed = intent.speed * Math.min(1, d / 0.9);
  let wantX = d > 0.02 ? (dx / d) * speed : 0;
  let wantZ = d > 0.02 ? (dz / d) * speed : 0;
  for (const o of others) {
    if (o.id === p.id) continue;
    const ox = p.pos.x - o.pos.x;
    const oz = p.pos.z - o.pos.z;
    const od = Math.hypot(ox, oz);
    if (od < SEPARATION && od > 1e-4) {
      const push = ((SEPARATION - od) / SEPARATION) * 4.5;
      wantX += (ox / od) * push;
      wantZ += (oz / od) * push;
    }
  }
  const ax = wantX - p.vel.x;
  const az = wantZ - p.vel.z;
  const a = Math.hypot(ax, az);
  const k = a > ACCEL * dt ? (ACCEL * dt) / a : 1;
  const vel = { x: p.vel.x + ax * k, z: p.vel.z + az * k };
  const raw = { x: p.pos.x + vel.x * dt, z: p.pos.z + vel.z * dt };
  const pos = intent.allowOut
    ? { x: Math.max(-COURT.halfL - 1.6, Math.min(COURT.halfL + 1.6, raw.x)), z: Math.max(-COURT.halfW - 1.6, Math.min(COURT.halfW + 1.6, raw.z)) }
    : clampToCourt(raw.x, raw.z);
  const moving = Math.hypot(vel.x, vel.z) > 0.6;
  const facing = intent.face
    ? Math.atan2(intent.face.z - pos.z, intent.face.x - pos.x)
    : moving ? Math.atan2(vel.z, vel.x) : p.facing;
  return { ...p, pos, vel, facing, jump: Math.max(0, p.jump - dt) };
}
