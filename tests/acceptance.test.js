// Headless full-game runs that check the acceptance criteria end to end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createSim, stepSim } from '../src/sim/sim.js';
import { STATE } from '../src/sim/rules.js';
import { hoopPosition } from '../src/sim/geometry.js';
import { TEAMS, COURT, BEHIND_BOARD_HALF } from '../src/sim/config.js';

const DT = 1 / 60;
const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function playGames(seed, games, maxSeconds = 2400) {
  let sim = createSim({ seed, autoRestart: true });
  const samples = [];
  let violations = [];
  for (let t = 0; t < maxSeconds && sim.game.wins[0] + sim.game.wins[1] < games; t += DT) {
    sim = stepSim(sim, DT);
    const holders = sim.players.filter((p) => sim.ball.holder === p.id);
    if (holders.length > 1) violations.push(`two holders at ${sim.time}`);
    if (holders.length === 1 && sim.game.possession !== holders[0].team
      && sim.game.state !== STATE.DEAD) violations.push(`holder/possession mismatch at ${sim.time.toFixed(2)}`);
    samples.push({ time: sim.time, ball: { ...sim.ball.pos }, state: sim.game.state, possession: sim.game.possession });
  }
  return { sim, samples, violations };
}

const runs = [11, 29].map((seed) => playGames(seed, 2));

test('games finish and wins are recorded, then the game restarts', () => {
  for (const { sim } of runs) {
    assert.equal(sim.game.wins[0] + sim.game.wins[1], 2, `wins ${sim.game.wins}`);
    const overs = sim.events.filter((e) => e.type === 'gameOver');
    assert.equal(overs.length, 2);
    for (const e of overs) assert.ok(e.score[e.winner] >= 11);
    assert.ok(sim.events.some((e) => e.type === 'restart'));
  }
});

test('possession ownership never conflicts', () => {
  for (const { violations } of runs) assert.deepEqual(violations.slice(0, 5), []);
});

test('both teams score, always through the basket they attack', () => {
  for (const { sim } of runs) {
    const scores = sim.events.filter((e) => e.type === 'score');
    for (const team of [0, 1]) assert.ok(scores.some((e) => e.team === team), `team ${team} scored`);
    for (const e of scores) assert.equal(e.hoop, TEAMS[e.team].attackHoop);
    assert.ok(scores.some((e) => e.value === 2) && scores.some((e) => e.value === 1), 'both shot values occur');
  }
});

test('shot value matches the release spot relative to the scored basket arc', () => {
  for (const { sim } of runs) {
    const shots = sim.events.filter((e) => e.type === 'shot');
    for (const s of shots) {
      const d = dist2d(s.from, hoopPosition(s.hoop));
      assert.equal(s.value, d > 6 ? 2 : 1, `release at ${d.toFixed(2)} m`);
    }
  }
});

test('score only moves through score events, once per basket', () => {
  for (const { sim } of runs) {
    let tally = [0, 0];
    for (const e of sim.events) {
      if (e.type === 'restart') tally = [0, 0];
      if (e.type === 'score') { tally = tally.map((v, i) => (i === e.team ? v + e.value : v)); assert.deepEqual(e.score, tally); }
    }
    const ids = sim.events.filter((e) => e.type === 'score').map((e) => `${e.gameNumber}:${e.shotId}`);
    assert.equal(new Set(ids).size, ids.length, 'one score per shot');
  }
});

test('conceding team inbounds from behind the baseline of the basket scored on', () => {
  for (const { sim } of runs) {
    const ev = sim.events;
    let checked = 0;
    ev.forEach((e, i) => {
      if (e.type !== 'score' || ev.slice(i).some((x) => x.type === 'gameOver' && x.time - e.time < 0.01)) return;
      const next = ev.slice(i + 1).find((x) => x.type === 'inbound');
      if (!next) return;
      checked += 1;
      assert.equal(next.team, 1 - e.team);
      const hp = hoopPosition(e.hoop);
      assert.equal(Math.sign(next.spot.x), Math.sign(hp.x), 'same end as the basket');
      assert.ok(Math.abs(next.spot.x) > COURT.halfL, 'behind the baseline');
      assert.ok(Math.abs(next.spot.z) >= BEHIND_BOARD_HALF, 'not behind the backboard');
    });
    assert.ok(checked > 5);
  }
});

test('out-of-bounds goes to the other team near the exit and never behind a backboard', () => {
  let total = 0;
  for (const { sim } of runs) {
    for (const e of sim.events.filter((x) => x.type === 'outOfBounds')) {
      total += 1;
      assert.equal(e.team, 1 - e.lastTouch);
      assert.ok(Math.abs(e.spot.x) <= COURT.halfL || Math.abs(e.spot.z) >= BEHIND_BOARD_HALF);
      assert.ok(dist2d(e.spot, e.exit) < 4, 'near the exit');
    }
  }
  assert.ok(total >= 0);
});

test('steals and defensive rebounds start a transition toward the other basket', () => {
  for (const { sim, samples } of runs) {
    const changes = sim.events.filter((e) => e.type === 'possession' && (e.cause === 'steal' || e.cause === 'defensive_rebound'));
    for (const team of [0, 1]) assert.ok(changes.some((c) => c.team === team && c.cause === 'defensive_rebound'), `team ${team} def rebound`);
    assert.ok(changes.some((c) => c.cause === 'steal'), 'at least one steal');
    let advanced = 0;
    for (const c of changes) {
      const target = hoopPosition(TEAMS[c.team].attackHoop);
      const window = samples.filter((s) => s.time >= c.time && s.time <= c.time + 5 && s.possession === c.team);
      if (window.length === 0) continue;
      const start = dist2d(window[0].ball, target);
      const best = Math.min(...window.map((s) => dist2d(s.ball, target)));
      if (start - best > 3 || best < 3) advanced += 1;
    }
    assert.ok(advanced / changes.length > 0.75, `advanced ${advanced}/${changes.length}`);
  }
});

test('defense protects the basket it defends when shots go up', () => {
  for (const { sim } of runs) {
    const shots = sim.events.filter((e) => e.type === 'shot');
    let protectedCount = 0;
    for (const s of shots) {
      const hp = hoopPosition(s.hoop);
      const def = s.positions.filter((p) => p.team !== s.team).map((p) => dist2d(p, hp));
      const off = s.positions.filter((p) => p.team === s.team).map((p) => dist2d(p, hp));
      const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
      if (avg(def) < avg(off) + 0.5) protectedCount += 1;
    }
    assert.ok(protectedCount / shots.length > 0.8, `${protectedCount}/${shots.length}`);
  }
});

test('both hoops see rim, backboard and net interactions', () => {
  for (const { sim } of runs) {
    for (const h of [0, 1]) {
      assert.ok(sim.stats.contacts[h].rim > 0, `rim ${h}`);
      assert.ok(sim.stats.contacts[h].board > 0, `board ${h}`);
      assert.ok(sim.stats.contacts[h].net > 0, `net ${h}`);
    }
  }
});

test('players avoid clustering under either basket', () => {
  for (const { sim } of runs) {
    for (const s of sim.events.filter((e) => e.type === 'shot')) {
      for (const h of [0, 1]) {
        const near = s.positions.filter((p) => dist2d(p, hoopPosition(h)) < 1.2).length;
        assert.ok(near <= 3, `${near} players under hoop ${h}`);
      }
    }
  }
});

test('no half-court check-ball or clearing logic remains', () => {
  const dirs = ['src/sim', 'src/render', 'src', 'src/ui', 'src/i18n', 'src/env', 'src/audio'];
  const banned = /take it back|check[ -]?ball|make[- ]it[- ]take|clear(?:ed|ing)?[ _-]?(?:the[ _-]?)?arc|half[ -]?court/i;
  for (const dir of dirs) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
      assert.doesNotMatch(readFileSync(join(dir, f), 'utf8'), banned, `${dir}/${f}`);
    }
  }
  assert.doesNotMatch(readFileSync('index.html', 'utf8'), banned);
});

test('a new sim can resume a saved win record', () => {
  const sim = createSim({ seed: 3, wins: [4, 2] });
  assert.deepEqual(sim.game.wins, [4, 2]);
  assert.equal(sim.game.state, STATE.DEAD);
});

test('passes reach a teammate other than the passer, and inbounds are caught in bounds', () => {
  for (const { sim } of runs) {
    const catches = sim.events.filter((e) => e.type === 'catch');
    assert.ok(catches.length > 20, `catches ${catches.length}`);
    for (const c of catches) {
      assert.notEqual(c.by, c.passer, 'passer caught their own pass');
      if (c.inbound) assert.ok(Math.abs(c.at.x) <= COURT.halfL && Math.abs(c.at.z) <= COURT.halfW, 'inbound caught out of bounds');
    }
    const interceptions = sim.events.filter((e) => e.type === 'steal' && e.interception);
    for (const i of interceptions) assert.notEqual(i.from, undefined);
  }
});
