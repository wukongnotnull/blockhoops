// Full-court 4v4 simulation: ties rules, ball physics, players and AI together.
// stepSim returns a new sim object each tick; only the seeded RNG is shared.
import { TEAMS, TIMING, BALL, COURT, HOOP } from './config.js';
import {
  STATE, createGame, beginInbound, completeInbound, releaseShot, shotMissed, scoreBasket,
  gainPossession, outOfBounds, restartGame, attackerOf, looseBall,
} from './rules.js';
import {
  hoopPosition, toLocal, fromLocal, distToHoop, shotValue, isInBounds, inboundSpotFromExit, baselineInboundSpot, dist2,
} from './geometry.js';
import { createBall, stepBall, solveLaunch } from './physics.js';
import { createPlayers, movePlayer, startJump, jumpHeight } from './players.js';
import { assignDefenders, assignSpots } from './ai.js';
import { computeIntents, decideHandler, contestOf, openness, opponents } from './brain.js';
import { createRng } from './rng.js';
import { DEFAULT_TUNING, sanitizeRules, sanitizeTuning } from './settings.js';
import { emptyBox, tallyEvent } from './boxscore.js';

const STEAL_RANGE = 0.85;
const STEAL_RATE = 0.22;
const INTERCEPT_CHANCE = 0.4;
const CATCH_RANGE = 0.8;
const GRAB_RANGE = 0.75;
const GRAB_HEIGHT = 2.95;
const OUT_LIMIT = 3;

const blankContacts = () => ({ rim: 0, board: 0, net: 0 });

function emit(sim, event) {
  const seq = sim.eventSeq + 1;
  const stamped = { ...event, seq, time: sim.time };
  const events = [...sim.events, stamped];
  return {
    ...sim,
    eventSeq: seq,
    box: tallyEvent(sim.box, stamped),
    events: events.length > sim.maxEvents ? events.slice(-sim.maxEvents) : events,
  };
}

const playerById = (sim, id) => sim.players.find((p) => p.id === id);
const updatePlayer = (sim, id, fn) => ({ ...sim, players: sim.players.map((p) => (p.id === id ? fn(p) : p)) });

function newPossession(sim, team, phase) {
  const attackers = sim.players.filter((p) => p.team === team);
  const defenders = sim.players.filter((p) => p.team !== team);
  return {
    team,
    phase,
    since: sim.time,
    handlerSince: sim.time,
    retreatUntil: phase === 'transition' ? sim.time + 1.5 : sim.time,
    established: phase !== 'transition',
    assignments: assignDefenders(defenders, attackers),
    spots: {},
    handlerSpot: null,
    cutter: null,
    nextCutAt: sim.time + 2.5 + sim.rng.next() * 2,
    decisionAt: sim.time + 0.2,
    plan: null,
  };
}

/** Switch to settled offense: unique spots for off-ball players and fresh matchups. */
function settle(sim) {
  const handler = playerById(sim, sim.ball.holder);
  if (!handler) return sim;
  const hoop = TEAMS[sim.poss.team].attackHoop;
  const others = sim.players.filter((p) => p.team === sim.poss.team && p.id !== handler.id);
  const defenders = sim.players.filter((p) => p.team !== sim.poss.team);
  const attackers = sim.players.filter((p) => p.team === sim.poss.team);
  return {
    ...sim,
    poss: {
      ...sim.poss,
      phase: 'settled',
      established: true,
      spots: assignSpots(hoop, handler, others),
      handlerSpot: frontcourtSpot(hoop, handler.pos),
      assignments: assignDefenders(defenders, attackers),
    },
  };
}

/** Where a settled handler operates: their own spot, pulled into the frontcourt if needed. */
function frontcourtSpot(hoop, pos) {
  const l = toLocal(hoop, pos.x, pos.z);
  return l.u > 8 ? fromLocal(hoop, 7.6, Math.max(-4, Math.min(4, l.v))) : { ...pos };
}

function setupDead(sim, pending, delay) {
  const spot = pending.kind === 'baseline'
    ? baselineInboundSpot(pending.hoop, sim.rng.next() < 0.5 ? 1 : -1)
    : pending.spot;
  const team = pending.team;
  const mates = sim.players.filter((p) => p.team === team).sort((a, b) => dist2(a.pos, spot) - dist2(b.pos, spot));
  const withPoss = { ...sim, poss: newPossession(sim, team, 'inbound') };
  return {
    ...withPoss,
    inbound: null,
    dead: { until: sim.time + delay, spot, team, kind: pending.kind, inbounder: mates[0].id, receiver: mates[1].id },
    ball: { ...sim.ball, mode: 'dead', holder: null },
  };
}

export function createSim({
  seed = (Date.now() >>> 0), autoRestart, firstPossession = 0, maxEvents = Infinity, wins = [0, 0], rules, tuning,
} = {}) {
  const requested = sanitizeRules(rules);
  const ruleSet = typeof autoRestart === 'boolean' ? { ...requested, autoRestart } : requested;
  const game = createGame({ firstPossession, wins, rules: ruleSet });
  const base = {
    time: 0,
    rng: createRng(seed),
    rules: ruleSet,
    nextRules: null,
    tuning: [0, 1].map((t) => sanitizeTuning(tuning?.[t] ?? DEFAULT_TUNING)),
    maxEvents,
    events: [],
    eventSeq: 0,
    box: emptyBox(),
    stats: { contacts: [blankContacts(), blankContacts()], shots: [0, 0], makes: [0, 0] },
    players: createPlayers(),
    game,
    ball: { ...createBall({ x: 0, y: BALL.radius, z: 0 }), mode: 'dead', holder: null, lastTouchTeam: 0 },
    poss: null,
    dead: null,
    inbound: null,
    shotInfo: null,
    looseCause: 'loose',
    gameOverAt: null,
  };
  return setupDead(base, game.pendingInbound, 1.2);
}

/** Start the next game, optionally with new rules; the win record carries over. */
export function restartSim(sim, rules = sim.nextRules ?? sim.rules) {
  const ruleSet = sanitizeRules(rules);
  const game = restartGame(sim.game, ruleSet);
  const fresh = emit({ ...sim, game, rules: ruleSet, nextRules: null, gameOverAt: null, shotInfo: null, box: emptyBox() }, { type: 'restart', gameNumber: game.gameNumber });
  return setupDead(fresh, game.pendingInbound, 1.6);
}

/** Queue rules for the next game; the auto-restart switch takes effect immediately. */
export function setNextRules(sim, rules) {
  const next = sanitizeRules(rules);
  return { ...sim, nextRules: next, rules: { ...sim.rules, autoRestart: next.autoRestart } };
}

/** Live AI tuning for one team, applied from the next decision onward. */
export function setTuning(sim, team, patch) {
  const tuning = sim.tuning.map((t, i) => (i === team ? sanitizeTuning({ ...t, ...patch }) : t));
  return { ...sim, tuning };
}

function launchPass(sim, from, to, inboundPass) {
  const lead = { x: to.pos.x + to.vel.x * 0.35, z: to.pos.z + to.vel.z * 0.35 };
  const dist = dist2(from.pos, lead);
  const T = 0.22 + dist / 14;
  const start = { x: from.pos.x, y: 1.45, z: from.pos.z };
  const vel = solveLaunch(start, { x: lead.x, y: 1.35, z: lead.z }, T);
  const hoop = TEAMS[from.team].attackHoop;
  const ahead = !inboundPass && toLocal(hoop, to.pos.x, to.pos.z).u < toLocal(hoop, from.pos.x, from.pos.z).u - 3;
  const next = {
    ...sim,
    ball: {
      ...createBall(start, vel), mode: 'pass', holder: null, lastTouchTeam: from.team,
      passTo: to.id, passFrom: from.id, passPoint: lead, passEnd: sim.time + T + 0.9, inboundPass, tried: [],
    },
    poss: { ...sim.poss, plan: null },
  };
  return emit(next, { type: 'pass', team: from.team, from: from.id, to: to.id, ahead, inbound: inboundPass });
}

function shoot(sim, shooter) {
  const hoop = TEAMS[shooter.team].attackHoop;
  const hp = hoopPosition(hoop);
  const dist = distToHoop(hoop, shooter.pos.x, shooter.pos.z);
  const deep = shotValue(hoop, shooter.pos.x, shooter.pos.z) === 2;
  const value = deep ? sim.game.values.outside : sim.game.values.inside;
  const contest = contestOf(sim.players, shooter);
  const sigma = (0.03 + 0.012 * dist + 0.07 * contest) / sim.tuning[shooter.team].accuracy;
  const dirX = (hp.x - shooter.pos.x) / (dist || 1);
  const dirZ = (hp.z - shooter.pos.z) / (dist || 1);
  const along = sim.rng.gauss() * sigma;
  const side = sim.rng.gauss() * sigma * 0.7;
  const aim = { x: hp.x + dirX * along - dirZ * side, y: hp.y, z: hp.z + dirZ * along + dirX * side };
  const from = { x: shooter.pos.x + dirX * 0.25, y: 2.35 + shooter.height * 0.05, z: shooter.pos.z + dirZ * 0.25 };
  const T = 0.55 + 0.08 * dist;
  const game = releaseShot(sim.game, { team: shooter.team, value });
  if (game === sim.game) return sim;
  let next = {
    ...sim,
    game,
    shotInfo: { id: game.shot.id, hoop, team: shooter.team, at: sim.time, touched: false, deep },
    ball: { ...createBall(from, solveLaunch(from, aim, T)), mode: 'shot', holder: null, lastTouchTeam: shooter.team },
    poss: { ...sim.poss, plan: null, cutter: null },
    stats: { ...sim.stats, shots: sim.stats.shots.map((s, i) => (i === shooter.team ? s + 1 : s)) },
  };
  next = updatePlayer(next, shooter.id, (p) => startJump({ ...p, facing: Math.atan2(dirZ, dirX) }));
  const closest = opponents(next.players, shooter.team).sort((a, b) => dist2(a.pos, shooter.pos) - dist2(b.pos, shooter.pos))[0];
  if (closest && dist2(closest.pos, shooter.pos) < 1.7) next = updatePlayer(next, closest.id, startJump);
  return emit(next, {
    type: 'shot', team: shooter.team, hoop, value, deep, dist, shotId: game.shot.id, shooter: shooter.id,
    from: { x: shooter.pos.x, z: shooter.pos.z },
    positions: next.players.map((p) => ({ id: p.id, team: p.team, x: p.pos.x, z: p.pos.z })),
  });
}

/** Give the ball to a player during live play and set up the resulting possession. */
function takePossession(sim, player, how) {
  const game = gainPossession(sim.game, player.team, how);
  if (game === sim.game) return sim;
  const { cause, transition } = game.lastChange;
  let next = { ...sim, game, ball: { ...sim.ball, mode: 'held', holder: player.id, lastTouchTeam: player.team } };
  next = { ...next, poss: newPossession(next, player.team, transition ? 'transition' : 'settled') };
  if (!transition) next = settle(next);
  return emit(next, { type: 'possession', team: player.team, cause, transition, handler: player.id });
}

function attemptOnBallSteal(sim, handler, dt) {
  const near = opponents(sim.players, handler.team).filter((d) => dist2(d.pos, handler.pos) < STEAL_RANGE);
  const rate = STEAL_RATE * sim.tuning[1 - handler.team].defense;
  if (near.length === 0 || sim.rng.next() > rate * dt * near.length) return sim;
  const thief = near[0];
  if (sim.rng.next() < 0.6) {
    const stolen = takePossession(sim, thief, 'steal');
    return emit(stolen, { type: 'steal', team: thief.team, by: thief.id, from: handler.id });
  }
  const angle = sim.rng.next() * Math.PI * 2;
  const ball = {
    ...createBall({ x: handler.pos.x, y: 0.7, z: handler.pos.z }, { x: Math.cos(angle) * 3.5, y: 1.5, z: Math.sin(angle) * 3.5 }),
    mode: 'loose', holder: null, lastTouchTeam: thief.team,
  };
  return emit({ ...sim, ball, game: looseBall(sim.game), looseCause: 'loose' }, { type: 'deflection', team: thief.team, by: thief.id });
}

function runHandler(sim, dt) {
  const handler = playerById(sim, sim.ball.holder);
  let next = attemptOnBallSteal(sim, handler, dt);
  if (next.ball.holder !== handler.id) return next;
  const { poss, time } = next;
  if (poss.phase === 'transition') {
    const d = distToHoop(TEAMS[poss.team].attackHoop, handler.pos.x, handler.pos.z);
    if (time - poss.since > TIMING.transitionMax || (d < 7.5 && time - poss.since > 2.2)) next = settle(next);
    else if (!poss.established && time >= poss.retreatUntil) {
      const defenders = next.players.filter((p) => p.team !== poss.team);
      const attackers = next.players.filter((p) => p.team === poss.team);
      next = { ...next, poss: { ...poss, established: true, assignments: assignDefenders(defenders, attackers) } };
    }
  } else if (!poss.cutter && time >= poss.nextCutAt) {
    const offBall = next.players.filter((p) => p.team === poss.team && p.id !== handler.id);
    const cutter = next.rng.pick(offBall);
    const hoop = TEAMS[poss.team].attackHoop;
    const side = Math.sign(toLocal(hoop, cutter.pos.x, cutter.pos.z).v) || 1;
    const target = fromLocal(hoop, 1.5, side * 1.1);
    next = { ...next, poss: { ...poss, cutter: { id: cutter.id, until: time + 1.7, target } } };
  } else if (poss.cutter && time >= poss.cutter.until) {
    next = { ...next, poss: { ...poss, cutter: null, nextCutAt: time + 2.5 + next.rng.next() * 2.5 } };
  }
  if (time < next.poss.decisionAt) return next;
  const action = decideHandler(next, handler, next.rng);
  const cadence = next.poss.phase === 'transition' ? 0.2 : 0.3;
  next = { ...next, poss: { ...next.poss, decisionAt: time + cadence } };
  if (action.kind === 'shoot') return shoot(next, handler);
  if (action.kind === 'pass') {
    const passed = { ...next, poss: { ...next.poss, passedAhead: next.poss.passedAhead || action.ahead } };
    return launchPass(passed, handler, playerById(next, action.to), false);
  }
  if (action.kind === 'settle') return settle(next);
  return { ...next, poss: { ...next.poss, plan: { target: action.target, speed: action.speed, drive: Boolean(action.drive), since: action.since ?? time } } };
}

function runFlow(sim, dt) {
  const { game, time } = sim;
  if (game.state === STATE.DEAD && sim.dead) {
    const { dead } = sim;
    const inbounder = playerById(sim, dead.inbounder);
    const ready = time >= dead.until && (dist2(inbounder.pos, dead.spot) < 0.45 || time > dead.until + 2);
    if (!ready) return sim;
    let next = updatePlayer(sim, inbounder.id, (p) => ({ ...p, pos: { x: dead.spot.x, z: dead.spot.z }, vel: { x: 0, z: 0 } }));
    next = {
      ...next,
      game: beginInbound(game),
      dead: null,
      inbound: { ...dead, passAt: time + TIMING.inboundHold },
      ball: { ...next.ball, mode: 'held', holder: inbounder.id, lastTouchTeam: dead.team, vel: { x: 0, y: 0, z: 0 } },
    };
    return emit(next, { type: 'inbound', team: dead.team, spot: dead.spot, kind: dead.kind });
  }
  if (game.state === STATE.INBOUND && sim.ball.mode === 'held' && time >= sim.inbound.passAt) {
    const passer = playerById(sim, sim.ball.holder);
    const options = sim.players.filter((p) => p.team === passer.team && p.id !== passer.id && isInBounds(p.pos.x, p.pos.z));
    const ranked = options.map((p) => ({ p, s: Math.min(openness(sim.players, p), 4) - 0.2 * dist2(p.pos, passer.pos) }))
      .sort((a, b) => b.s - a.s);
    return ranked.length ? launchPass(sim, passer, ranked[0].p, true) : sim;
  }
  if (game.state === STATE.LIVE && sim.ball.mode === 'held') return runHandler(sim, dt);
  if (game.state === STATE.GAME_OVER) {
    let next = sim;
    for (const p of sim.players) {
      if (p.team === game.winner && p.jump === 0 && sim.rng.next() < dt * 1.4) next = updatePlayer(next, p.id, startJump);
    }
    if (sim.rules.autoRestart && time - sim.gameOverAt > TIMING.gameOverRestart) return restartSim(next);
    return next;
  }
  return sim;
}

function moveAll(sim, dt) {
  const intents = computeIntents(sim);
  const players = sim.players.map((p) => (intents[p.id] ? movePlayer(p, intents[p.id], sim.players, dt) : movePlayer(p, { target: p.pos, speed: 0 }, sim.players, dt)));
  return { ...sim, players };
}

function heldBallPosition(sim, holder) {
  const fx = Math.cos(holder.facing);
  const fz = Math.sin(holder.facing);
  if (sim.game.state === STATE.INBOUND || sim.game.state === STATE.DEAD) {
    return { x: holder.pos.x + fx * 0.35, y: 1.3 + jumpHeight(holder), z: holder.pos.z + fz * 0.35 };
  }
  const bounceY = BALL.radius + Math.abs(Math.sin(sim.time * 8.5)) * 0.75;
  return { x: holder.pos.x + fx * 0.3 - fz * 0.32, y: bounceY, z: holder.pos.z + fz * 0.3 + fx * 0.32 };
}

function scoreAt(sim, hoop) {
  const game = scoreBasket(sim.game, hoop);
  if (game === sim.game) return sim;
  const team = attackerOf(hoop);
  let next = {
    ...sim,
    game,
    ball: { ...sim.ball, mode: 'dead' },
    stats: { ...sim.stats, makes: sim.stats.makes.map((m, i) => (i === team ? m + 1 : m)) },
  };
  next = emit(next, {
    type: 'score', team, hoop, value: game.shot.points, score: game.score, shotId: game.shot.id, gameNumber: game.gameNumber, winScore: game.winScore,
    swish: !sim.shotInfo?.touched,
    deep: Boolean(sim.shotInfo?.deep) && sim.shotInfo.hoop === hoop,
  });
  if (game.state === STATE.GAME_OVER) {
    return emit({ ...next, gameOverAt: next.time, poss: { ...next.poss, plan: null } }, {
      type: 'gameOver', winner: game.winner, score: game.score, wins: game.wins, box: next.box,
    });
  }
  return setupDead(next, game.pendingInbound, TIMING.deadAfterScore);
}

function checkOutOfBounds(sim) {
  const { pos } = sim.ball;
  const onFloor = pos.y <= BALL.radius + 0.02;
  const far = Math.abs(pos.x) > COURT.halfL + OUT_LIMIT || Math.abs(pos.z) > COURT.halfW + OUT_LIMIT;
  if (!far && !(onFloor && !isInBounds(pos.x, pos.z))) return sim;
  const exit = {
    x: Math.max(-COURT.halfL - 1.5, Math.min(COURT.halfL + 1.5, pos.x)),
    z: Math.max(-COURT.halfW - 1.5, Math.min(COURT.halfW + 1.5, pos.z)),
  };
  const spot = inboundSpotFromExit(exit.x, exit.z);
  const lastTouch = sim.ball.lastTouchTeam;
  const game = outOfBounds(sim.game, lastTouch, spot);
  if (game === sim.game) return sim;
  const next = emit({ ...sim, game }, { type: 'outOfBounds', team: 1 - lastTouch, lastTouch, spot, exit });
  return setupDead(next, game.pendingInbound, TIMING.deadAfterOut);
}

function grabLooseBall(sim) {
  const { pos } = sim.ball;
  if (pos.y > GRAB_HEIGHT) return sim;
  const nearRim = [0, 1].some((h) => {
    const hp = hoopPosition(h);
    return Math.hypot(pos.x - hp.x, pos.z - hp.z) < HOOP.rimRadius + 0.35 && pos.y > hp.y - 0.5;
  });
  if (nearRim) return sim;
  const grabber = sim.players.map((p) => ({ p, d: dist2(p.pos, pos) })).filter((c) => c.d < GRAB_RANGE)
    .sort((a, b) => a.d - b.d)[0]?.p;
  if (!grabber) return sim;
  let next = takePossession(sim, grabber, sim.looseCause);
  if (pos.y > 2.0) next = updatePlayer(next, grabber.id, startJump);
  return next.game.lastChange?.cause === 'defensive_rebound'
    ? emit(next, { type: 'rebound', team: grabber.team, by: grabber.id })
    : next;
}

/** The intended (or a nearby) teammate catches a pass or inbound. */
function completePass(sim, receiver) {
  const { ball, time } = sim;
  if (ball.inboundPass) {
    const game = completeInbound(sim.game);
    const hoop = TEAMS[receiver.team].attackHoop;
    const phase = toLocal(hoop, receiver.pos.x, receiver.pos.z).u > 9.5 ? 'transition' : 'settled';
    let next = { ...sim, game, inbound: null, ball: { ...ball, mode: 'held', holder: receiver.id } };
    next = { ...next, poss: { ...newPossession(next, receiver.team, phase), assignments: sim.poss.assignments } };
    if (phase === 'settled') next = settle(next);
    return emit(next, { type: 'possession', team: receiver.team, cause: 'inbound', transition: phase === 'transition', handler: receiver.id });
  }
  let next = { ...sim, ball: { ...ball, mode: 'held', holder: receiver.id } };
  next = { ...next, poss: { ...next.poss, handlerSince: time, decisionAt: time + 0.25, plan: null } };
  if (next.poss.phase !== 'settled') return next;
  const hoop = TEAMS[receiver.team].attackHoop;
  const others = next.players.filter((p) => p.team === receiver.team && p.id !== receiver.id);
  return { ...next, poss: { ...next.poss, spots: assignSpots(hoop, receiver, others), handlerSpot: frontcourtSpot(hoop, receiver.pos), cutter: null } };
}

function updatePass(sim) {
  const { ball, time } = sim;
  if (!ball.inboundPass) {
    for (const d of opponents(sim.players, ball.lastTouchTeam)) {
      if (ball.tried.includes(d.id) || dist2(d.pos, ball.pos) > 0.65 || ball.pos.y > 2.4) continue;
      const tried = { ...sim, ball: { ...ball, tried: [...ball.tried, d.id] } };
      if (sim.rng.next() < Math.min(0.9, INTERCEPT_CHANCE * sim.tuning[d.team].defense)) {
        const stolen = takePossession(tried, d, 'steal');
        return emit(stolen, { type: 'steal', team: d.team, by: d.id, from: ball.passFrom, interception: true });
      }
      return tried;
    }
  }
  const receiver = sim.players.filter((p) => p.team === ball.lastTouchTeam && p.id !== ball.passFrom)
    .filter((p) => !ball.inboundPass || isInBounds(p.pos.x, p.pos.z))
    .find((p) => dist2(p.pos, ball.pos) < CATCH_RANGE && ball.pos.y > 0.4 && ball.pos.y < 2.5
      && (p.id === ball.passTo || dist2(p.pos, ball.pos) < 0.5));
  if (receiver) {
    const caught = emit(sim, {
      type: 'catch', by: receiver.id, passer: ball.passFrom, inbound: Boolean(ball.inboundPass),
      at: { x: receiver.pos.x, z: receiver.pos.z },
    });
    return completePass(caught, receiver);
  }
  if (time > ball.passEnd || ball.pos.y < 0.3) {
    const game = sim.game.state === STATE.INBOUND ? looseBall(completeInbound(sim.game)) : looseBall(sim.game);
    return emit({ ...sim, game, inbound: null, ball: { ...ball, mode: 'loose' }, looseCause: 'loose' }, { type: 'loose', team: ball.lastTouchTeam });
  }
  return sim;
}

/** A ball resting on a rim or wedged against a board gets nudged back toward the court. */
function unstick(ball) {
  const speed = Math.hypot(ball.vel.x, ball.vel.y, ball.vel.z);
  if (speed > 0.6 || ball.pos.y < HOOP.rimHeight - 0.3) return ball;
  const side = Math.sign(ball.pos.x) || 1;
  if (Math.abs(ball.pos.x) < COURT.halfL - HOOP.fromBaseline - 0.6) return ball;
  return { ...ball, vel: { x: -side * 1.4, y: 1.2, z: ball.vel.z } };
}

function updateBall(sim, dt) {
  const { ball } = sim;
  if (ball.mode === 'held') {
    const holder = playerById(sim, ball.holder);
    return { ...sim, ball: { ...ball, pos: heldBallPosition(sim, holder), vel: { x: holder.vel.x, y: 0, z: holder.vel.z } } };
  }
  const r = stepBall(unstick(ball), dt);
  const contacts = sim.stats.contacts.map((c, h) => {
    const mine = r.contacts.filter((x) => x.hoop === h);
    return mine.length ? { ...c, ...Object.fromEntries(['rim', 'board', 'net'].map((t) => [t, c[t] + mine.filter((x) => x.type === t).length])) } : c;
  });
  const touched = r.contacts.some((c) => c.type === 'rim' || c.type === 'board');
  let next = {
    ...sim,
    ball: { ...ball, ...r.ball },
    stats: { ...sim.stats, contacts },
    shotInfo: sim.shotInfo && touched ? { ...sim.shotInfo, touched: true } : sim.shotInfo,
  };
  if (r.contacts.length) next = { ...next, lastContacts: r.contacts };
  for (const h of r.baskets) {
    if (next.game.state === STATE.SHOT) next = scoreAt(next, h);
  }
  const { state } = next.game;
  if (state === STATE.DEAD || state === STATE.GAME_OVER) return next;
  if (state === STATE.SHOT) {
    const hp = hoopPosition(next.shotInfo.hoop);
    const p = next.ball.pos;
    const below = p.y < hp.y - 0.6 && next.ball.vel.y < 0;
    const away = Math.hypot(p.x - hp.x, p.z - hp.z) > 1.2 && p.y < hp.y - 0.2 && next.ball.vel.y < 0;
    if (below || away || next.time - next.shotInfo.at > 4) {
      next = emit({ ...next, game: shotMissed(next.game), ball: { ...next.ball, mode: 'loose' }, looseCause: 'rebound' }, { type: 'miss', team: next.shotInfo.team, hoop: next.shotInfo.hoop });
    }
  }
  const afterOut = checkOutOfBounds(next);
  if (afterOut !== next) return afterOut;
  if (next.ball.mode === 'pass') return updatePass(next);
  if (next.game.state === STATE.REBOUND) return grabLooseBall(next);
  return next;
}

/** Advance the whole simulation by dt seconds. */
export function stepSim(sim, dt) {
  let next = { ...sim, time: sim.time + dt, lastContacts: null };
  next = runFlow(next, dt);
  next = moveAll(next, dt);
  return updateBall(next, dt);
}
