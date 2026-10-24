import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIMES, WEATHERS, environmentFor } from '../src/env/presets.js';
import { DEFAULT_PREFS, sanitizePrefs } from '../src/ui/preferences.js';

const HEX = /^#[0-9a-f]{6}$/i;
const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const spread = (hex) => Math.max(...channels(hex)) - Math.min(...channels(hex));
const luma = (hex) => { const [r, g, b] = channels(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

test('three times of day and three weathers', () => {
  assert.deepEqual(TIMES, ['day', 'dusk', 'night']);
  assert.deepEqual(WEATHERS, ['clear', 'drizzle', 'downpour']);
});

test('every combination yields a complete, valid environment', () => {
  for (const time of TIMES) {
    for (const weather of WEATHERS) {
      const env = environmentFor(time, weather);
      for (const c of [env.sky.top, env.sky.mid, env.sky.low, env.sky.glow, env.hemi.sky, env.hemi.ground, env.sun.color, env.fog.color]) {
        assert.match(c, HEX, `${time}/${weather}`);
      }
      assert.equal(env.sun.position.length, 3);
      assert.ok(env.sun.position[1] > 0, 'light comes from above');
      assert.ok(env.fog.near < env.fog.far);
      assert.ok(env.wetness >= 0 && env.wetness <= 1);
      assert.ok(env.exposure > 0);
    }
  }
});

test('night is darker than dusk, dusk darker than day; lamps and windows do the opposite', () => {
  const [day, dusk, night] = TIMES.map((t) => environmentFor(t, 'clear'));
  assert.ok(day.sun.intensity > dusk.sun.intensity && dusk.sun.intensity > night.sun.intensity);
  assert.ok(luma(day.sky.top) > luma(dusk.sky.top) && luma(dusk.sky.top) > luma(night.sky.top));
  assert.equal(day.lampIntensity, 0);
  assert.ok(night.lampIntensity > dusk.lampIntensity && dusk.lampIntensity > 0);
  assert.ok(night.windowGlow > dusk.windowGlow && dusk.windowGlow > day.windowGlow);
  assert.equal(day.fireflies, false);
  assert.equal(night.fireflies, true);
});

test('heavier weather means more rain, a wetter court, dimmer sun, closer fog and greyer sky', () => {
  for (const time of TIMES) {
    const [clear, drizzle, downpour] = WEATHERS.map((w) => environmentFor(time, w));
    assert.equal(clear.rain.count, 0);
    assert.ok(drizzle.rain.count > 0 && downpour.rain.count > drizzle.rain.count * 2);
    assert.ok(downpour.rain.speed > drizzle.rain.speed);
    assert.ok(clear.wetness === 0 && drizzle.wetness < downpour.wetness);
    assert.ok(clear.sun.intensity > drizzle.sun.intensity && drizzle.sun.intensity > downpour.sun.intensity);
    assert.ok(downpour.fog.far < clear.fog.far);
    assert.ok(spread(downpour.sky.low) < spread(clear.sky.low), `${time} sky should desaturate`);
    assert.ok(downpour.rainVolume > drizzle.rainVolume && clear.rainVolume === 0);
  }
});

test('the default environment is today\'s look: dusk and clear', () => {
  assert.equal(DEFAULT_PREFS.time, 'dusk');
  assert.equal(DEFAULT_PREFS.weather, 'clear');
  const dusk = environmentFor('dusk', 'clear');
  assert.equal(dusk.sky.top, '#1c1838');
  assert.equal(dusk.sky.low, '#e3825a');
});

test('unknown values fall back to dusk and clear', () => {
  assert.deepEqual(environmentFor('noon', 'snow'), environmentFor('dusk', 'clear'));
  const p = sanitizePrefs({ time: 'night', weather: 'downpour' });
  assert.equal(p.time, 'night');
  assert.equal(p.weather, 'downpour');
  const bad = sanitizePrefs({ time: 'noon', weather: 'hail' });
  assert.equal(bad.time, 'dusk');
  assert.equal(bad.weather, 'clear');
});
