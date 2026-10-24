// Player intents and ball-handler decisions for transition and settled offense,
// man-to-man defense, rebounding and dead-ball positioning.
import { TEAMS, SPEED, TIMING } from './config.js';
import { STATE } from './rules.js';
import { toLocal, fromLocal, distToHoop, shotValue, dist2, clampToCourt, hoopPosition } from './geometry.js';
import { transitionLanes, manDefenseSpot, retreatSpot, distToSegment } from './ai.js';

const NO_PRESS_U = 11.4;
const attackHoopOf = (team) => TEAMS[team].attackHoop;
const defendedHoopOf = (team) => TEAMS[1 - team].attackHoop;

export const opponents = (players, team) => players.filter((p) => p.team !== team);
export const teammates = (players, p) => players.filter((o) => o.team === p.team && o.id !== p.id);

export function openness(players, p) {
  return Math.min(...opponents(players, p.team).map((o) => dist2(o.pos, p.pos)));
}

export function laneClear(players, team, a, b, width) {
  return opponents(players, team).every((o) => distToSegment(o.pos, a, b) > width);
}

/** Contest level 0..1 from the closest defender. */
export const contestOf = (players, p) => Math.max(0, Math.min(1, (2.0 - openness(players, p)) / 1.4));

/** Rough make chance used only for decision making; real outcomes come from ball physics. */
export function makeChance(dist, contest) {
  return Math.max(0.18, Math.min(0.75, 0.8 - 0.07 * dist)) * (1 - 0.5 * contest);
}

const noPress = (hoop, spot) => {
  const l = toLocal(hoop, spot.x, spot.z);
  return l.u > NO_PRESS_U ? fromLocal(hoop, NO_PRESS_U, l.v) : spot;
};

function defenseIntents(sim, ballPos, sprint) {
  const { poss, players, time } = sim;
  const hoop = attackHoopOf(poss.team);
  const handlerId = sim.ball.holder;
  const intents = {};
  for (const d of opponents(players, poss.team)) {
    const manId = poss.assignments[d.id];
    const man = players.find((p) => p.id === manId) ?? d;
    const retreating = poss.phase === 'transition' && time < poss.retreatUntil
      && toLocal(hoop, d.pos.x, d.pos.z).u > toLocal(hoop, ballPos.x, ballPos.z).u - 1;
    const spot = retreating
      ? retreatSpot(hoop, d.slot)
      : noPress(hoop, manDefenseSpot(hoop, man.pos, ballPos, manId === handlerId));
    intents[d.id] = { target: spot, speed: retreating || sprint ? SPEED.sprint : SPEED.run, face: ballPos };
  }
  return intents;
}

function offenseIntents(sim) {
  const { poss, players, ball, time } = sim;
  const hoop = attackHoopOf(poss.team);
  const handler = players.find((p) => p.id === ball.holder);
  const others = players.filter((p) => p.team === poss.team && p.id !== ball.holder);
  const intents = {};
  const lanes = poss.phase === 'transition' ? transitionLanes(hoop, others) : {};
  for (const p of others) {
    if (ball.mode === 'pass' && ball.passTo === p.id) {
      intents[p.id] = { target: ball.passPoint, speed: SPEED.sprint, face: ball.pos };
    } else if (poss.cutter && poss.cutter.id === p.id) {
      intents[p.id] = { target: poss.cutter.target, speed: SPEED.run, face: ball.pos };
    } else {
      const target = lanes[p.id] ?? poss.spots[p.id] ?? p.pos;
      intents[p.id] = { target, speed: poss.phase === 'transition' ? SPEED.sprint : SPEED.jog, face: ball.pos };
    }
  }
  if (handler) {
    const plan = poss.plan ?? { target: handler.pos, speed: SPEED.dribble };
    intents[handler.id] = { target: plan.target, speed: plan.speed, face: hoopPosition(hoop) };
  }
  return intents;
}

function deadBallIntents(sim) {
  const { dead, inbound, players, poss } = sim;
  const play = dead ?? inbound;
  const team = play.team;
  const attack = attackHoopOf(team);
  const intents = {};
  const spotLocal = toLocal(attack, play.spot.x, play.spot.z);
  const inCourt = play.spot.line === 'sideline'
    ? clampToCourt(play.spot.x, play.spot.z - Math.sign(play.spot.z) * 2.4, 0.6)
    : clampToCourt(play.spot.x - Math.sign(play.spot.x) * 2.4, play.spot.z * 1.3, 0.6);
  const runners = players.filter((p) => p.team === team && p.id !== play.inbounder && p.id !== play.receiver);
  const lanes = spotLocal.u > 12 ? transitionLanes(attack, runners) : {};
  for (const p of players.filter((o) => o.team === team)) {
    if (p.id === play.inbounder) intents[p.id] = { target: play.spot, speed: SPEED.run, allowOut: true, face: inCourt };
    else if (p.id === play.receiver) intents[p.id] = { target: inCourt, speed: SPEED.run, face: play.spot };
    else intents[p.id] = { target: lanes[p.id] ?? poss.spots[p.id] ?? p.pos, speed: SPEED.run, face: play.spot };
  }
  const ballRef = sim.ball.holder != null ? play.spot : sim.ball.pos;
  return { ...intents, ...defenseIntents({ ...sim, poss: { ...poss, phase: 'inbound' } }, ballRef, false) };
}

function shotIntents(sim) {
  const { players, game, ball } = sim;
  const shot = game.shot;
  const hoop = shot.hoop;
  const shooterTeam = shot.team;
  const intents = {};
  const crashers = players.filter((p) => p.team === shooterTeam)
    .sort((a, b) => distToHoop(hoop, a.pos.x, a.pos.z) - distToHoop(hoop, b.pos.x, b.pos.z))
    .slice(0, 2).map((p) => p.id);
  for (const p of players) {
    if (p.team === shooterTeam) {
      const idx = crashers.indexOf(p.id);
      const l = toLocal(hoop, p.pos.x, p.pos.z);
      const target = idx >= 0 ? fromLocal(hoop, 2.0, (idx === 0 ? -1 : 1) * 1.5 + l.v * 0.1) : p.pos;
      intents[p.id] = { target, speed: SPEED.run, face: ball.pos };
    } else {
      const man = players.find((o) => o.id === sim.poss.assignments[p.id]) ?? p;
      intents[p.id] = { target: manDefenseSpot(hoop, man.pos, man.pos, true), speed: SPEED.run, face: ball.pos };
    }
  }
  return intents;
}

function reboundIntents(sim) {
  const { players, ball } = sim;
  const landing = clampToCourt(ball.pos.x + ball.vel.x * 0.35, ball.pos.z + ball.vel.z * 0.35, 0.2);
  const intents = {};
  for (const team of [0, 1]) {
    const chasers = players.filter((p) => p.team === team)
      .sort((a, b) => dist2(a.pos, landing) - dist2(b.pos, landing)).slice(0, 2).map((p) => p.id);
    for (const p of players.filter((o) => o.team === team)) {
      intents[p.id] = chasers.includes(p.id)
        ? { target: landing, speed: SPEED.sprint }
        : { target: p.pos, speed: SPEED.jog, face: ball.pos };
    }
  }
  return intents;
}

function gameOverIntents(sim) {
  const { players, game } = sim;
  return Object.fromEntries(players.map((p) => {
    const target = p.team === game.winner
      ? { x: (p.slot - 1.5) * 1.6, z: 0.4 * (p.slot % 2 ? 1 : -1) }
      : { x: (p.slot - 1.5) * 2.2 + (p.team ? 6 : -6), z: 6.6 };
    return [p.id, { target, speed: SPEED.jog, face: { x: 0, z: 0 } }];
  }));
}

/** Movement intent for every player in the current game state. */
export function computeIntents(sim) {
  switch (sim.game.state) {
    case STATE.DEAD:
    case STATE.INBOUND:
      return sim.dead || sim.inbound ? deadBallIntents(sim) : {};
    case STATE.SHOT:
      return shotIntents(sim);
    case STATE.REBOUND:
      return reboundIntents(sim);
    case STATE.GAME_OVER:
      return gameOverIntents(sim);
    default: {
      const ballPos = sim.ball.mode === 'pass' ? sim.ball.passPoint : sim.ball.pos;
      return { ...offenseIntents(sim), ...defenseIntents(sim, ballPos, sim.poss.phase === 'transition') };
    }
  }
}

function bestPassTarget(sim, handler, hoop, filter) {
  const { players } = sim;
  const scored = teammates(players, handler).filter(filter).map((t) => {
    const open = openness(players, t);
    const d = distToHoop(hoop, t.pos.x, t.pos.z);
    const value = shotValue(hoop, t.pos.x, t.pos.z);
    return { t, open, score: Math.min(open, 4) * 0.5 + makeChance(d, contestOf(players, t)) * value };
  }).filter((c) => c.open > 1.4 && laneClear(players, handler.team, handler.pos, c.t.pos, 0.85));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.t ?? null;
}

const chance = (p, k) => Math.min(0.95, p * k);

function decideTransition(sim, handler, rng) {
  const { passing } = sim.tuning[handler.team];
  const hoop = attackHoopOf(handler.team);
  const hl = toLocal(hoop, handler.pos.x, handler.pos.z);
  const d = Math.hypot(hl.u, hl.v);
  if (d < 1.9) return { kind: 'shoot' };
  const ahead = !sim.poss.passedAhead && bestPassTarget(sim, handler, hoop, (t) => {
    const l = toLocal(hoop, t.pos.x, t.pos.z);
    return l.u < hl.u - 3.5 && Math.hypot(l.u, l.v) < 7 && openness(sim.players, t) > 2.4;
  });
  if (ahead && rng.next() < chance(0.5, passing)) return { kind: 'pass', to: ahead.id, ahead: true };
  const rim = fromLocal(hoop, 0.9, hl.v * 0.25);
  const blocked = !laneClear(sim.players, handler.team, handler.pos, rim, 0.9);
  if (blocked && d < 7.5) return { kind: 'settle' };
  return { kind: 'move', target: rim, speed: SPEED.dribbleFast };
}

function decideSettled(sim, handler, rng) {
  const { players, poss, time } = sim;
  const { shooting, passing } = sim.tuning[handler.team];
  const hoop = attackHoopOf(handler.team);
  const d = distToHoop(hoop, handler.pos.x, handler.pos.z);
  const contest = contestOf(players, handler);
  const value = shotValue(hoop, handler.pos.x, handler.pos.z);
  const patience = TIMING.possessionLimit / Math.max(1, shooting);
  const holding = time - poss.handlerSince;
  const rim = fromLocal(hoop, 0.9, 0);
  if (d < 1.8 || time - poss.since > patience) return { kind: 'shoot' };
  const guard = Object.keys(poss.assignments).find((k) => poss.assignments[k] === handler.id);
  const help = players.filter((p) => p.team !== handler.team && String(p.id) !== guard);
  const helpClear = help.every((o) => distToSegment(o.pos, handler.pos, rim) > 0.9);
  if (poss.plan?.drive) {
    if (helpClear && time - poss.plan.since < 2.2) return { kind: 'move', ...poss.plan };
    if (d < 4.5 && rng.next() < chance(0.5, shooting)) return { kind: 'shoot' };
  }
  const quality = makeChance(d, contest) * value;
  if (holding > 0.5 && contest < 0.8 && quality > 0.5 / shooting && rng.next() < chance(0.3, shooting)) return { kind: 'shoot' };
  const cutter = poss.cutter && players.find((p) => p.id === poss.cutter.id);
  if (cutter && distToHoop(hoop, cutter.pos.x, cutter.pos.z) < 2.6 && openness(players, cutter) > 1.6
    && laneClear(players, handler.team, handler.pos, cutter.pos, 0.8) && rng.next() < chance(0.7, passing)) {
    return { kind: 'pass', to: cutter.id, ahead: false };
  }
  if (d > 2.2 && d < 9 && helpClear && rng.next() < 0.3) {
    return { kind: 'move', target: rim, speed: SPEED.dribble + 1.4, drive: true, since: time };
  }
  if (holding > 1.4 / passing && (contest > 0.6 || rng.next() < chance(0.12, passing))) {
    const to = bestPassTarget(sim, handler, hoop, () => true);
    if (to) return { kind: 'pass', to: to.id, ahead: false };
  }
  if (holding > 2 / shooting && quality > 0.35 / shooting && rng.next() < chance(0.3, shooting)) return { kind: 'shoot' };
  const home = poss.handlerSpot ?? handler.pos;
  const jitter = { x: home.x + (rng.next() - 0.5) * 1.6, z: home.z + (rng.next() - 0.5) * 1.6 };
  return { kind: 'move', target: clampToCourt(jitter.x, jitter.z, 0.6), speed: SPEED.dribble * 0.7 };
}

/** What the ball handler does next: shoot, pass, keep dribbling toward a target, or settle. */
export function decideHandler(sim, handler, rng) {
  return sim.poss.phase === 'transition' ? decideTransition(sim, handler, rng) : decideSettled(sim, handler, rng);
}
