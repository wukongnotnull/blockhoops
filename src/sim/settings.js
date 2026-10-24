// Control-panel settings: defaults plus validation for anything coming from the UI or storage.
import { WIN_SCORE } from './config.js';

export const WIN_SCORE_OPTIONS = Object.freeze([7, 11, 15, 21]);
export const INSIDE_OPTIONS = Object.freeze([1, 2]);
export const OUTSIDE_OPTIONS = Object.freeze([2, 3]);
export const TUNING_MIN = 0.25;
export const TUNING_MAX = 2;

export const DEFAULT_RULES = Object.freeze({ winScore: WIN_SCORE, insideValue: 1, outsideValue: 2, autoRestart: true });
export const DEFAULT_TUNING = Object.freeze({ shooting: 1, passing: 1, defense: 1, accuracy: 1 });

const pick = (value, options, fallback) => (options.includes(value) ? value : fallback);

/** Rules for the next game; invalid fields fall back to defaults one by one. */
export function sanitizeRules(input) {
  const r = input && typeof input === 'object' ? input : {};
  const insideValue = pick(r.insideValue, INSIDE_OPTIONS, DEFAULT_RULES.insideValue);
  const outside = pick(r.outsideValue, OUTSIDE_OPTIONS, DEFAULT_RULES.outsideValue);
  return {
    winScore: pick(r.winScore, WIN_SCORE_OPTIONS, DEFAULT_RULES.winScore),
    insideValue,
    outsideValue: Math.max(outside, insideValue + 1),
    autoRestart: typeof r.autoRestart === 'boolean' ? r.autoRestart : DEFAULT_RULES.autoRestart,
  };
}

/** Per-team AI multipliers, each clamped to TUNING_MIN..TUNING_MAX. */
export function sanitizeTuning(input) {
  const t = input && typeof input === 'object' ? input : {};
  return Object.fromEntries(Object.entries(DEFAULT_TUNING).map(([key, fallback]) => {
    const v = t[key];
    const ok = typeof v === 'number' && Number.isFinite(v);
    return [key, ok ? Math.min(TUNING_MAX, Math.max(TUNING_MIN, v)) : fallback];
  }));
}
