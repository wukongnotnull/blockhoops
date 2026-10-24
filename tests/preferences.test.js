import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFS, SPEEDS, sanitizePrefs } from '../src/ui/preferences.js';
import { DEFAULT_RULES, DEFAULT_TUNING } from '../src/sim/settings.js';

test('defaults: 1x, auto camera, minimap, shadows and effects on, no rotation, sound off', () => {
  assert.deepEqual(DEFAULT_PREFS, {
    speed: 1,
    view: 'auto',
    autoRotate: false,
    minimap: true,
    shadows: true,
    effects: true,
    sound: false,
    volume: 0.6,
    time: 'dusk',
    weather: 'clear',
    lang: 'auto',
    rules: DEFAULT_RULES,
    tuning: [DEFAULT_TUNING, DEFAULT_TUNING],
  });
  assert.deepEqual(SPEEDS, [0.5, 1, 2, 4]);
});

test('stored prefs are validated field by field', () => {
  const p = sanitizePrefs({
    speed: 3, view: 'drone', autoRotate: true, minimap: 'no', shadows: false,
    rules: { winScore: 21 }, tuning: [{ shooting: 9 }, 'bad'],
  });
  assert.equal(p.speed, 1);
  assert.equal(p.view, 'auto');
  assert.equal(p.autoRotate, true);
  assert.equal(p.minimap, true);
  assert.equal(p.shadows, false);
  assert.equal(p.rules.winScore, 21);
  assert.equal(p.tuning[0].shooting, 2);
  assert.deepEqual(p.tuning[1], DEFAULT_TUNING);
});

test('garbage input falls back to defaults', () => {
  assert.deepEqual(sanitizePrefs('nope'), DEFAULT_PREFS);
  assert.deepEqual(sanitizePrefs(null), DEFAULT_PREFS);
});

test('sound prefs: boolean switch and volume clamped to 0..1', () => {
  assert.equal(sanitizePrefs({ sound: true }).sound, true);
  assert.equal(sanitizePrefs({ sound: 'on' }).sound, false);
  assert.equal(sanitizePrefs({ volume: 1.7 }).volume, 1);
  assert.equal(sanitizePrefs({ volume: -2 }).volume, 0);
  assert.equal(sanitizePrefs({ volume: 'loud' }).volume, 0.6);
  assert.equal(sanitizePrefs({ volume: 0.25 }).volume, 0.25);
});
