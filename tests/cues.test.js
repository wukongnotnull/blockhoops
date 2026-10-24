import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCueState, planCues, RATE_LIMIT_MS } from '../src/audio/cues.js';

const names = (cues) => cues.map((c) => c.name);
const frame = (overrides) => ({ events: [], contacts: [], dribbles: 0, now: 0, ...overrides });

test('a swish plays the swish and a cheer; a rim-in plays the net sound instead', () => {
  const { cues } = planCues(createCueState(), frame({ events: [{ type: 'score', swish: true, deep: false, team: 0 }] }));
  assert.deepEqual(names(cues), ['swish', 'cheer']);
  const rimIn = planCues(createCueState(), frame({ events: [{ type: 'score', swish: false, deep: true, team: 1 }] }));
  assert.deepEqual(names(rimIn.cues), ['net', 'cheer']);
  assert.ok(rimIn.cues[1].gain > cues[1].gain, 'deep makes get a louder cheer');
});

test('game events map to whistle, squeak and buzzer', () => {
  const { cues } = planCues(createCueState(), frame({
    events: [{ type: 'outOfBounds' }, { type: 'steal' }, { type: 'gameOver' }, { type: 'restart' }, { type: 'pass' }],
  }));
  assert.deepEqual(names(cues), ['whistle', 'squeak', 'buzzer', 'whistle']);
});

test('physics contacts become rim, board and bounce cues', () => {
  const { cues } = planCues(createCueState(), frame({
    contacts: [{ type: 'rim', hoop: 1 }, { type: 'board', hoop: 0 }, { type: 'floor', hoop: -1 }, { type: 'net', hoop: 1 }],
  }));
  assert.deepEqual(names(cues), ['rim', 'board', 'bounce']);
});

test('repeated contacts of one kind are rate limited per hoop', () => {
  let state = createCueState();
  const rim1 = { type: 'rim', hoop: 1 };
  let out = planCues(state, frame({ contacts: [rim1, rim1, rim1, { type: 'rim', hoop: 0 }], now: 1000 }));
  assert.deepEqual(names(out.cues), ['rim', 'rim'], 'one per hoop');
  state = out.state;
  out = planCues(state, frame({ contacts: [rim1], now: 1000 + RATE_LIMIT_MS / 2 }));
  assert.deepEqual(out.cues, []);
  out = planCues(out.state, frame({ contacts: [rim1], now: 1000 + RATE_LIMIT_MS + 1 }));
  assert.deepEqual(names(out.cues), ['rim']);
});

test('dribble bounces play at most one dribble per frame, quieter than a loose bounce', () => {
  const { cues } = planCues(createCueState(), frame({ dribbles: 3, contacts: [{ type: 'floor', hoop: -1 }], now: 5000 }));
  assert.deepEqual(names(cues), ['bounce', 'dribble']);
  assert.ok(cues[1].gain < cues[0].gain);
});

test('planCues is pure', () => {
  const state = createCueState();
  const snapshot = JSON.stringify(state);
  planCues(state, frame({ contacts: [{ type: 'rim', hoop: 0 }], now: 10 }));
  assert.equal(JSON.stringify(state), snapshot);
});
