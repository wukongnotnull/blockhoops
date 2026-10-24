// Sim-level effects of the control panel: rules applied per game, live AI tuning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, stepSim, restartSim, setTuning, setNextRules } from '../src/sim/sim.js';
import { STATE, createGame, releaseShot, scoreBasket, completeInbound, beginInbound } from '../src/sim/rules.js';
import { hoopPosition } from '../src/sim/geometry.js';
import { TEAMS } from '../src/sim/config.js';

const DT = 1 / 60;
const run = (sim, until) => {
  let s = sim;
  while (!until(s) && s.time < 3000) s = stepSim(s, DT);
  return s;
};

test('rules game: custom win score ends the game there', () => {
  const g0 = completeInbound(beginInbound(createGame({ rules: { winScore: 7, insideValue: 1, outsideValue: 2 } })));
  const g = scoreBasket(releaseShot({ ...g0, score: [6, 0] }, { team: 0, value: 1 }), TEAMS[0].attackHoop);
  assert.equal(g.state, STATE.GAME_OVER);
  assert.equal(g.winScore, 7);
});

test('rules game: a ball through the wrong rim is worth the inside value', () => {
  const g0 = completeInbound(beginInbound(createGame({ rules: { winScore: 11, insideValue: 2, outsideValue: 3 } })));
  const g = scoreBasket(releaseShot(g0, { team: 0, value: 3 }), TEAMS[1].attackHoop);
  assert.deepEqual(g.score, [0, 2]);
});

test('sim uses rule point values from the release spot', () => {
  const sim = run(createSim({ seed: 5, rules: { winScore: 7, insideValue: 2, outsideValue: 3, autoRestart: false } }),
    (s) => s.game.state === STATE.GAME_OVER);
  assert.equal(sim.game.state, STATE.GAME_OVER);
  assert.ok(sim.game.score[sim.game.winner] >= 7);
  assert.equal(sim.game.winScore, 7);
  const shots = sim.events.filter((e) => e.type === 'shot');
  for (const s of shots) {
    const d = Math.hypot(s.from.x - hoopPosition(s.hoop).x, s.from.z);
    assert.equal(s.value, d > 6 ? 3 : 2);
  }
  assert.ok(sim.events.filter((e) => e.type === 'score').every((e) => e.value === 2 || e.value === 3));
});

test('autoRestart off keeps the final on screen', () => {
  let sim = run(createSim({ seed: 8, rules: { winScore: 7, autoRestart: false } }), (s) => s.game.state === STATE.GAME_OVER);
  const over = sim.time;
  sim = run(sim, (s) => s.time > over + 20);
  assert.equal(sim.game.state, STATE.GAME_OVER);
});

test('restartSim applies new rules to the next game and keeps the record', () => {
  let sim = run(createSim({ seed: 4, rules: { winScore: 7 } }), (s) => s.game.state === STATE.GAME_OVER);
  const wins = sim.game.wins;
  sim = restartSim(sim, { winScore: 15, insideValue: 1, outsideValue: 3, autoRestart: true });
  assert.equal(sim.game.winScore, 15);
  assert.deepEqual(sim.game.wins, wins);
  assert.deepEqual(sim.rules, { winScore: 15, insideValue: 1, outsideValue: 3, autoRestart: true });
});

test('setTuning updates one team live and sanitizes input', () => {
  const sim = setTuning(createSim({ seed: 1 }), 1, { defense: 9, shooting: 0.5 });
  assert.deepEqual(sim.tuning[1], { shooting: 0.5, passing: 1, defense: 2, accuracy: 1 });
  assert.deepEqual(sim.tuning[0], { shooting: 1, passing: 1, defense: 1, accuracy: 1 });
});

function playStats(tuning, seconds = 900) {
  let sim = createSim({ seed: 21 });
  sim = setTuning(setTuning(sim, 0, tuning[0]), 1, tuning[1]);
  while (sim.time < seconds) sim = stepSim(sim, DT);
  return sim;
}

test('accuracy slider changes field goal percentage', () => {
  const sim = playStats([{ accuracy: 2 }, { accuracy: 0.25 }]);
  const pct = (t) => sim.stats.makes[t] / sim.stats.shots[t];
  assert.ok(pct(0) > pct(1) + 0.15, `sharp ${pct(0).toFixed(2)} vs cold ${pct(1).toFixed(2)}`);
});

test('defense slider changes how often a team forces steals', () => {
  const sim = playStats([{ defense: 2 }, { defense: 0.25 }]);
  const steals = (t) => sim.events.filter((e) => e.type === 'steal' && e.team === t).length;
  assert.ok(steals(0) > steals(1) * 2, `steals ${steals(0)} vs ${steals(1)}`);
});

test('passing slider changes how often a team passes', () => {
  const sim = playStats([{ passing: 2 }, { passing: 0.25 }]);
  const passes = (t) => sim.events.filter((e) => e.type === 'pass' && e.team === t).length;
  assert.ok(passes(0) > passes(1) * 1.5, `passes ${passes(0)} vs ${passes(1)}`);
});

test('shooting slider changes how quickly a team shoots', () => {
  const sim = playStats([{ shooting: 2 }, { shooting: 0.25 }]);
  const delay = (t) => {
    let start = null;
    const waits = [];
    for (const e of sim.events) {
      if ((e.type === 'possession' || e.type === 'catch') && e.team === t && start === null) start = e.time;
      if (e.type === 'possession' && e.team !== t) start = null;
      if (e.type === 'shot' && e.team === t && start !== null) { waits.push(e.time - start); start = null; }
    }
    return waits.reduce((a, b) => a + b, 0) / waits.length;
  };
  assert.ok(delay(0) < delay(1) - 1, `${delay(0).toFixed(1)}s vs ${delay(1).toFixed(1)}s`);
});

test('rules set mid-game wait for the next game, but auto restart applies now', () => {
  let sim = createSim({ seed: 6, rules: { winScore: 7 } });
  sim = setNextRules(sim, { winScore: 15, insideValue: 2, outsideValue: 3, autoRestart: true });
  assert.equal(sim.game.winScore, 7);
  assert.equal(sim.rules.autoRestart, true);
  sim = run(sim, (s) => s.game.gameNumber === 2);
  assert.equal(sim.game.winScore, 15);
  assert.deepEqual(sim.game.values, { inside: 2, outside: 3 });
  assert.equal(sim.nextRules, null);
  const off = setNextRules(sim, { ...sim.rules, autoRestart: false });
  assert.equal(off.rules.autoRestart, false);
});
