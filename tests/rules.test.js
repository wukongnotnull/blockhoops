import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATE, createGame, beginInbound, completeInbound, releaseShot, shotMissed, scoreBasket,
  gainPossession, outOfBounds, restartGame, attackerOf, defenderOf, looseBall,
} from '../src/sim/rules.js';
import { TEAMS, WIN_SCORE } from '../src/sim/config.js';

const live = (team = 0) => completeInbound(beginInbound(createGame({ firstPossession: team })));

test('teams attack fixed, opposite baskets', () => {
  assert.notEqual(TEAMS[0].attackHoop, TEAMS[1].attackHoop);
  assert.equal(attackerOf(TEAMS[0].attackHoop), 0);
  assert.equal(defenderOf(TEAMS[0].attackHoop), 1);
});

test('a new game starts dead with a baseline inbound pending, then inbounds into live play', () => {
  const g = createGame({ firstPossession: 1 });
  assert.equal(g.state, STATE.DEAD);
  assert.equal(g.pendingInbound.team, 1);
  const inb = beginInbound(g);
  assert.equal(inb.state, STATE.INBOUND);
  assert.equal(inb.possession, 1);
  assert.equal(completeInbound(inb).state, STATE.LIVE);
});

test('releasing a shot records value and the shooter team basket', () => {
  const g = releaseShot(live(0), { team: 0, value: 2 });
  assert.equal(g.state, STATE.SHOT);
  assert.deepEqual({ team: g.shot.team, value: g.shot.value, hoop: g.shot.hoop }, { team: 0, value: 2, hoop: TEAMS[0].attackHoop });
});

test('the defense cannot release a shot', () => {
  const g = live(0);
  assert.equal(releaseShot(g, { team: 1, value: 1 }), g);
});

test('made basket awards the attacking team, then the conceding team inbounds behind that baseline', () => {
  const shot = releaseShot(live(0), { team: 0, value: 2 });
  const made = scoreBasket(shot, TEAMS[0].attackHoop);
  assert.deepEqual(made.score, [2, 0]);
  assert.equal(made.state, STATE.DEAD);
  assert.deepEqual(made.pendingInbound, { team: 1, kind: 'baseline', hoop: TEAMS[0].attackHoop });
});

test('a basket is counted at most once', () => {
  const made = scoreBasket(releaseShot(live(0), { team: 0, value: 1 }), TEAMS[0].attackHoop);
  const again = scoreBasket(made, TEAMS[0].attackHoop);
  assert.deepEqual(again.score, [1, 0]);
  assert.equal(again, made);
});

test('a ball through the other rim scores for the team attacking that rim', () => {
  const g = releaseShot(live(0), { team: 0, value: 2 });
  const made = scoreBasket(g, TEAMS[1].attackHoop);
  assert.deepEqual(made.score, [0, 1]);
  assert.equal(made.pendingInbound.team, 0);
});

test('missed shot becomes a rebound and cannot score afterwards', () => {
  const miss = shotMissed(releaseShot(live(0), { team: 0, value: 2 }));
  assert.equal(miss.state, STATE.REBOUND);
  assert.deepEqual(scoreBasket(miss, TEAMS[0].attackHoop).score, [0, 0]);
});

test('defensive rebound flips possession and is flagged as a transition', () => {
  const miss = shotMissed(releaseShot(live(0), { team: 0, value: 1 }));
  const reb = gainPossession(miss, 1, 'rebound');
  assert.equal(reb.state, STATE.LIVE);
  assert.equal(reb.possession, 1);
  assert.equal(reb.lastChange.cause, 'defensive_rebound');
  assert.equal(reb.lastChange.transition, true);
  const off = gainPossession(miss, 0, 'rebound');
  assert.equal(off.lastChange.cause, 'offensive_rebound');
  assert.equal(off.lastChange.transition, false);
});

test('steal flips possession immediately', () => {
  const s = gainPossession(live(0), 1, 'steal');
  assert.equal(s.possession, 1);
  assert.equal(s.lastChange.cause, 'steal');
  assert.equal(s.lastChange.transition, true);
});

test('possession cannot be gained during a shot in flight or a dead ball', () => {
  const shot = releaseShot(live(0), { team: 0, value: 1 });
  assert.equal(gainPossession(shot, 1, 'steal'), shot);
  const dead = scoreBasket(shot, TEAMS[0].attackHoop);
  assert.equal(gainPossession(dead, 0, 'rebound'), dead);
});

test('out of bounds gives the ball to the other team at the exit spot', () => {
  const spot = { x: 2, z: 8, line: 'sideline' };
  const g = outOfBounds(live(0), 0, spot);
  assert.equal(g.state, STATE.DEAD);
  assert.deepEqual(g.pendingInbound, { team: 1, kind: 'spot', spot });
});

test('first to 11 wins with no two-point margin needed, and wins are recorded', () => {
  let g = { ...live(0), score: [WIN_SCORE - 1, WIN_SCORE - 1] };
  g = scoreBasket(releaseShot(g, { team: 0, value: 1 }), TEAMS[0].attackHoop);
  assert.equal(g.state, STATE.GAME_OVER);
  assert.equal(g.winner, 0);
  assert.deepEqual(g.wins, [1, 0]);
  assert.equal(beginInbound(g), g);
  const next = restartGame(g);
  assert.equal(next.state, STATE.DEAD);
  assert.deepEqual(next.score, [0, 0]);
  assert.deepEqual(next.wins, [1, 0]);
  assert.equal(next.gameNumber, g.gameNumber + 1);
});

test('a 2 from 10 also ends the game at 12', () => {
  const g = scoreBasket(releaseShot({ ...live(1), score: [3, 10] }, { team: 1, value: 2 }), TEAMS[1].attackHoop);
  assert.equal(g.state, STATE.GAME_OVER);
  assert.deepEqual(g.score, [3, 12]);
});

test('a fumbled pass or poke turns live play into a loose-ball rebound state', () => {
  const g = looseBall(live(0));
  assert.equal(g.state, STATE.REBOUND);
  assert.equal(g.possession, 0);
  assert.equal(looseBall(g), g);
});
