import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBox, tallyEvent, boxRows } from '../src/sim/boxscore.js';
import { createSim, stepSim, restartSim } from '../src/sim/sim.js';
import { STATE } from '../src/sim/rules.js';

const ev = (type, fields) => ({ type, ...fields });

test('tallyEvent counts attempts, makes, deep shots, rebounds, steals and live passes', () => {
  const events = [
    ev('shot', { team: 0, deep: true }),
    ev('score', { team: 0, deep: true }),
    ev('shot', { team: 1, deep: false }),
    ev('possession', { team: 0, cause: 'defensive_rebound' }),
    ev('possession', { team: 0, cause: 'offensive_rebound' }),
    ev('possession', { team: 1, cause: 'inbound' }),
    ev('steal', { team: 1 }),
    ev('pass', { team: 0, inbound: false }),
    ev('pass', { team: 0, inbound: true }),
    ev('rebound', { team: 0 }),
  ];
  const box = events.reduce(tallyEvent, emptyBox());
  assert.deepEqual(box[0], { fga: 1, fgm: 1, deepA: 1, deepM: 1, rebounds: 2, steals: 0, passes: 1 });
  assert.deepEqual(box[1], { fga: 1, fgm: 0, deepA: 0, deepM: 0, rebounds: 0, steals: 1, passes: 0 });
});

test('tallyEvent never mutates the box it is given', () => {
  const box = emptyBox();
  const next = tallyEvent(box, ev('steal', { team: 0 }));
  assert.equal(box[0].steals, 0);
  assert.equal(next[0].steals, 1);
});

test('boxRows formats the five rows and marks the leader of each', () => {
  const box = [
    { fga: 20, fgm: 11, deepA: 6, deepM: 2, rebounds: 9, steals: 3, passes: 30 },
    { fga: 18, fgm: 7, deepA: 4, deepM: 2, rebounds: 12, steals: 3, passes: 18 },
  ];
  const rows = boxRows(box);
  assert.deepEqual(rows.map((r) => r.key), ['fg', 'deep', 'rebounds', 'steals', 'passes']);
  assert.deepEqual(rows[0].values, ['55% (11/20)', '39% (7/18)']);
  assert.equal(rows[0].leader, 0);
  assert.deepEqual(rows[1].values, ['2/6', '2/4']);
  assert.equal(rows[1].leader, 1, 'better deep percentage leads');
  assert.equal(rows[2].leader, 1);
  assert.equal(rows[3].leader, null, 'ties have no leader');
  assert.deepEqual(rows[4].values, ['30', '18']);
});

test('boxRows handles a team with no attempts', () => {
  const rows = boxRows(emptyBox());
  assert.deepEqual(rows[0].values, ['—', '—']);
  assert.equal(rows[0].leader, null);
});

test('the sim keeps a per-game box that matches its own events and resets on restart', () => {
  let sim = createSim({ seed: 17, autoRestart: false });
  while (sim.game.state !== STATE.GAME_OVER) sim = stepSim(sim, 1 / 60);
  const recount = sim.events.reduce(tallyEvent, emptyBox());
  assert.deepEqual(sim.box, recount);
  const over = sim.events.find((e) => e.type === 'gameOver');
  assert.deepEqual(over.box, sim.box);
  for (const t of [0, 1]) assert.ok(sim.box[t].fga > 0 && sim.box[t].passes > 0);
  assert.equal(sim.box[0].fgm + sim.box[1].fgm, sim.events.filter((e) => e.type === 'score').length);
  sim = restartSim(sim);
  assert.deepEqual(sim.box, emptyBox());
});
