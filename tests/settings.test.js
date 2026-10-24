import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RULES, DEFAULT_TUNING, WIN_SCORE_OPTIONS, sanitizeRules, sanitizeTuning,
} from '../src/sim/settings.js';

test('defaults match the street rules: 11 to win, 1 inside, 2 outside, auto restart', () => {
  assert.deepEqual(DEFAULT_RULES, { winScore: 11, insideValue: 1, outsideValue: 2, autoRestart: true });
  assert.deepEqual(DEFAULT_TUNING, { shooting: 1, passing: 1, defense: 1, accuracy: 1 });
  assert.ok(WIN_SCORE_OPTIONS.includes(11));
});

test('sanitizeRules keeps valid values and falls back field by field', () => {
  assert.deepEqual(sanitizeRules({ winScore: 21, insideValue: 2, outsideValue: 3, autoRestart: false }),
    { winScore: 21, insideValue: 2, outsideValue: 3, autoRestart: false });
  assert.deepEqual(sanitizeRules({ winScore: 13, insideValue: 'x', outsideValue: 9, autoRestart: 'yes' }), DEFAULT_RULES);
  assert.deepEqual(sanitizeRules(null), DEFAULT_RULES);
});

test('outside value is never lower than the inside value', () => {
  const r = sanitizeRules({ insideValue: 2, outsideValue: 2 });
  assert.equal(r.insideValue, 2);
  assert.equal(r.outsideValue, 3);
});

test('sanitizeTuning clamps sliders to 0.25..2 and rejects junk', () => {
  assert.deepEqual(sanitizeTuning({ shooting: 5, passing: -1, defense: 'a', accuracy: 1.5 }),
    { shooting: 2, passing: 0.25, defense: 1, accuracy: 1.5 });
  assert.deepEqual(sanitizeTuning(undefined), DEFAULT_TUNING);
});

test('sanitizers return new objects', () => {
  const input = { shooting: 1.2 };
  const out = sanitizeTuning(input);
  assert.notEqual(out, input);
  assert.deepEqual(input, { shooting: 1.2 });
});
