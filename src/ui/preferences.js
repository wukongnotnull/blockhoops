// Viewer preferences for the control panel, validated whenever they are read back from storage.
import { DEFAULT_RULES, DEFAULT_TUNING, sanitizeRules, sanitizeTuning } from '../sim/settings.js';
import { TIMES, WEATHERS } from '../env/presets.js';
import { LANG_PREFS } from '../i18n/strings.js';

export const SPEEDS = Object.freeze([0.5, 1, 2, 4]);
export const VIEWS = Object.freeze(['auto', 'side', 'baseline', 'top', 'follow']);
const FLAGS = Object.freeze(['autoRotate', 'minimap', 'shadows', 'effects', 'sound']);

export const DEFAULT_PREFS = Object.freeze({
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
  tuning: Object.freeze([DEFAULT_TUNING, DEFAULT_TUNING]),
});

export function sanitizePrefs(input) {
  const p = input && typeof input === 'object' ? input : {};
  const flags = Object.fromEntries(FLAGS.map((f) => [f, typeof p[f] === 'boolean' ? p[f] : DEFAULT_PREFS[f]]));
  const tuning = Array.isArray(p.tuning) ? p.tuning : [];
  return {
    speed: SPEEDS.includes(p.speed) ? p.speed : DEFAULT_PREFS.speed,
    view: VIEWS.includes(p.view) ? p.view : DEFAULT_PREFS.view,
    ...flags,
    volume: typeof p.volume === 'number' && Number.isFinite(p.volume) ? Math.min(1, Math.max(0, p.volume)) : DEFAULT_PREFS.volume,
    time: TIMES.includes(p.time) ? p.time : DEFAULT_PREFS.time,
    weather: WEATHERS.includes(p.weather) ? p.weather : DEFAULT_PREFS.weather,
    lang: LANG_PREFS.includes(p.lang) ? p.lang : DEFAULT_PREFS.lang,
    rules: sanitizeRules(p.rules),
    tuning: [0, 1].map((t) => sanitizeTuning(tuning[t])),
  };
}
