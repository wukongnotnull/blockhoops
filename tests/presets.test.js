import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATCHUPS, findMatchup, matchupTuning, swapTuning } from '../src/sim/presets.js';
import { DEFAULT_TUNING, sanitizeTuning } from '../src/sim/settings.js';
import { createSim, stepSim, setTuning } from '../src/sim/sim.js';

test('every matchup has a unique id and valid tuning for both teams (text lives in i18n)', () => {
  assert.ok(MATCHUPS.length >= 4);
  assert.equal(new Set(MATCHUPS.map((m) => m.id)).size, MATCHUPS.length);
  for (const m of MATCHUPS) {
    assert.equal(m.tuning.length, 2, m.id);
    for (const t of m.tuning) assert.deepEqual(t, sanitizeTuning(t), `${m.id} out of range`);
  }
  assert.ok(MATCHUPS.some((m) => m.id === 'balanced'));
});

test('matchupTuning returns fresh copies for both teams', () => {
  const [a, b] = matchupTuning('sharpshooters-vs-wall');
  const preset = MATCHUPS.find((m) => m.id === 'sharpshooters-vs-wall');
  assert.deepEqual([a, b], preset.tuning);
  assert.notEqual(a, preset.tuning[0]);
  assert.equal(matchupTuning('nope'), null);
});

test('findMatchup recognises the active preset, including swapped sides', () => {
  assert.deepEqual(findMatchup([DEFAULT_TUNING, DEFAULT_TUNING]), { id: 'balanced', swapped: false });
  const t = matchupTuning('run-vs-set-play');
  assert.deepEqual(findMatchup(t), { id: 'run-vs-set-play', swapped: false });
  assert.deepEqual(findMatchup(swapTuning(t)), { id: 'run-vs-set-play', swapped: true });
  assert.equal(findMatchup([{ ...DEFAULT_TUNING, shooting: 1.05 }, DEFAULT_TUNING]), null);
});

test('swapTuning exchanges the two teams without mutating input', () => {
  const t = matchupTuning('mismatch');
  const snapshot = JSON.stringify(t);
  const s = swapTuning(t);
  assert.deepEqual(s, [t[1], t[0]]);
  assert.equal(JSON.stringify(t), snapshot);
});

test('the mismatch preset makes the stronger side win most games', () => {
  let strong = 0;
  for (const seed of [2, 7, 13, 31]) {
    const [a, b] = matchupTuning('mismatch');
    let sim = setTuning(setTuning(createSim({ seed, autoRestart: false }), 0, a), 1, b);
    while (sim.game.state !== 'gameOver' && sim.time < 1500) sim = stepSim(sim, 1 / 60);
    if (sim.game.winner === 0) strong += 1;
  }
  assert.ok(strong >= 3, `strong side won ${strong}/4`);
});
