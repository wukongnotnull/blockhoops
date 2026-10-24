// Game flow as a pure state machine. Every transition returns a new object, or the
// same object when the transition is not allowed in the current state.
import { TEAMS } from './config.js';
import { sanitizeRules } from './settings.js';

export const STATE = Object.freeze({
  INBOUND: 'inbound',
  LIVE: 'live',
  SHOT: 'shot',
  REBOUND: 'rebound',
  DEAD: 'dead',
  GAME_OVER: 'gameOver',
});

export const attackerOf = (hoopIndex) => TEAMS.findIndex((t) => t.attackHoop === hoopIndex);
export const defenderOf = (hoopIndex) => 1 - attackerOf(hoopIndex);

/** Each game opens with the first team inbounding from behind the basket it defends. */
export function createGame({ firstPossession = 0, wins = [0, 0], gameNumber = 1, rules } = {}) {
  const { winScore, insideValue, outsideValue } = sanitizeRules(rules);
  return {
    state: STATE.DEAD,
    winScore,
    values: { inside: insideValue, outside: outsideValue },
    score: [0, 0],
    wins,
    gameNumber,
    firstPossession,
    possession: firstPossession,
    pendingInbound: { team: firstPossession, kind: 'baseline', hoop: TEAMS[1 - firstPossession].attackHoop },
    shot: null,
    shotCount: 0,
    winner: null,
    lastChange: null,
  };
}

export function beginInbound(g) {
  if (g.state !== STATE.DEAD || !g.pendingInbound) return g;
  return { ...g, state: STATE.INBOUND, possession: g.pendingInbound.team };
}

export function completeInbound(g) {
  if (g.state !== STATE.INBOUND) return g;
  return {
    ...g,
    state: STATE.LIVE,
    pendingInbound: null,
    lastChange: { team: g.possession, cause: 'inbound', transition: true },
  };
}

export function releaseShot(g, { team, value }) {
  if (g.state !== STATE.LIVE || g.possession !== team) return g;
  const id = g.shotCount + 1;
  return {
    ...g,
    state: STATE.SHOT,
    shotCount: id,
    shot: { id, team, value, hoop: TEAMS[team].attackHoop, scored: false },
  };
}

export function shotMissed(g) {
  if (g.state !== STATE.SHOT) return g;
  return { ...g, state: STATE.REBOUND };
}

/** Award a downward crossing of a rim to the team attacking that rim, once per shot. */
export function scoreBasket(g, hoopIndex) {
  if (g.state !== STATE.SHOT || !g.shot || g.shot.scored) return g;
  const team = attackerOf(hoopIndex);
  const points = g.shot.hoop === hoopIndex ? g.shot.value : g.values.inside;
  const score = g.score.map((s, i) => (i === team ? s + points : s));
  const base = {
    ...g,
    score,
    shot: { ...g.shot, scored: true, points, scoredHoop: hoopIndex },
  };
  if (score[team] >= g.winScore) {
    return {
      ...base,
      state: STATE.GAME_OVER,
      winner: team,
      wins: g.wins.map((w, i) => (i === team ? w + 1 : w)),
      pendingInbound: null,
    };
  }
  return {
    ...base,
    state: STATE.DEAD,
    pendingInbound: { team: 1 - team, kind: 'baseline', hoop: hoopIndex },
  };
}

/** Rebounds, steals, loose balls and caught passes during live play. */
export function gainPossession(g, team, how) {
  if (g.state !== STATE.LIVE && g.state !== STATE.REBOUND) return g;
  const changed = team !== g.possession;
  let cause = how;
  if (how === 'rebound') cause = changed ? 'defensive_rebound' : 'offensive_rebound';
  if (how === 'loose') cause = changed ? 'loose_turnover' : 'loose_recovery';
  return {
    ...g,
    state: STATE.LIVE,
    possession: team,
    lastChange: { team, cause, transition: changed },
  };
}

export function outOfBounds(g, lastTouchTeam, spot) {
  if (g.state === STATE.DEAD || g.state === STATE.GAME_OVER || g.state === STATE.INBOUND) return g;
  return {
    ...g,
    state: STATE.DEAD,
    pendingInbound: { team: 1 - lastTouchTeam, kind: 'spot', spot },
  };
}

export function restartGame(g, rules) {
  return createGame({
    firstPossession: 1 - g.firstPossession,
    wins: g.wins,
    gameNumber: g.gameNumber + 1,
    rules,
  });
}

/** A live ball nobody controls (fumbled pass, poked dribble) is recovered like a rebound. */
export function looseBall(g) {
  if (g.state !== STATE.LIVE) return g;
  return { ...g, state: STATE.REBOUND };
}
