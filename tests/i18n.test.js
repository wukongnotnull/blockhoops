import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STRINGS, LANGS, LANG_PREFS, translate, resolveLang } from '../src/i18n/strings.js';
import { MATCHUPS } from '../src/sim/presets.js';
import { boxRows, emptyBox } from '../src/sim/boxscore.js';
import { STATE } from '../src/sim/rules.js';
import { DEFAULT_PREFS, sanitizePrefs } from '../src/ui/preferences.js';

test('Chinese and English dictionaries cover exactly the same keys, all non-empty', () => {
  assert.deepEqual(LANGS, ['zh', 'en']);
  const zh = Object.keys(STRINGS.zh).sort();
  const en = Object.keys(STRINGS.en).sort();
  assert.deepEqual(zh, en);
  for (const lang of LANGS) {
    for (const [k, v] of Object.entries(STRINGS[lang])) assert.ok(typeof v === 'string' && v.trim(), `${lang}.${k}`);
  }
});

test('placeholders match between languages', () => {
  const vars = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
  for (const k of Object.keys(STRINGS.en)) assert.equal(vars(STRINGS.zh[k]), vars(STRINGS.en[k]), k);
});

test('translate fills placeholders and falls back to English, then to the key', () => {
  assert.equal(translate('en', 'hud.firstTo', { n: 15 }), 'FIRST TO 15');
  assert.equal(translate('zh', 'hud.firstTo', { n: 15 }), '先得 15 分胜');
  assert.equal(translate('fr', 'b.steal'), STRINGS.en['b.steal']);
  assert.equal(translate('zh', 'no.such.key'), 'no.such.key');
});

test('resolveLang honours an explicit choice and otherwise follows the browser', () => {
  assert.deepEqual(LANG_PREFS, ['auto', 'zh', 'en']);
  assert.equal(resolveLang('zh', ['en-US']), 'zh');
  assert.equal(resolveLang('en', ['zh-CN']), 'en');
  assert.equal(resolveLang('auto', ['zh-CN', 'en']), 'zh');
  assert.equal(resolveLang('auto', ['zh-Hant-TW']), 'zh');
  assert.equal(resolveLang('auto', ['ja-JP', 'en-GB']), 'en');
  assert.equal(resolveLang('auto', []), 'en');
  assert.equal(resolveLang('auto', undefined), 'en');
});

test('every matchup, box-score row, game state and banner has text in both languages', () => {
  const keys = [
    ...MATCHUPS.flatMap((m) => ['title', 'blurb', 'side0', 'side1'].map((p) => `m.${m.id}.${p}`)),
    ...boxRows(emptyBox()).map((r) => `box.${r.key}`),
    ...Object.values(STATE).map((s) => `state.${s}`),
    ...['inbound', 'steal', 'poked', 'board', 'fastBreak', 'hitAhead', 'swish', 'deep', 'bucket', 'gamePoint', 'out', 'tipoff'].map((b) => `b.${b}`),
  ];
  for (const lang of LANGS) for (const k of keys) assert.ok(STRINGS[lang][k], `${lang} missing ${k}`);
});

test('every data-i18n key used in index.html exists', () => {
  const html = readFileSync('index.html', 'utf8');
  const used = [...html.matchAll(/data-i18n(?:-[a-z]+)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(used.length > 40, `only ${used.length} keys found`);
  for (const k of used) assert.ok(STRINGS.en[k], `missing ${k}`);
});

test('language preference defaults to auto and is validated', () => {
  assert.equal(DEFAULT_PREFS.lang, 'auto');
  assert.equal(sanitizePrefs({ lang: 'en' }).lang, 'en');
  assert.equal(sanitizePrefs({ lang: 'fr' }).lang, 'auto');
});
