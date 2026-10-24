// Time-of-day and weather looks as plain data, so the combinations can be tested.
// Fog distances are factors of the camera's fit distance; render/environment.js applies them.

export const TIMES = Object.freeze(['day', 'dusk', 'night']);
export const WEATHERS = Object.freeze(['clear', 'drizzle', 'downpour']);

const BASE = {
  day: {
    sky: { top: '#3f8fd8', mid: '#8cc4ec', low: '#f2e6cf', glow: '#fff6dd' },
    hemi: { sky: '#dff1ff', ground: '#6a5a48', intensity: 1.6 },
    sun: { color: '#fff1d6', intensity: 3.0, position: [-22, 42, 26] },
    rimIntensity: 0.4,
    lampIntensity: 0,
    windowGlow: 0.12,
    fireflies: false,
    fog: { color: '#b9d3e8', near: 1.1, far: 2.6 },
    exposure: 1.0,
  },
  dusk: {
    sky: { top: '#1c1838', mid: '#4a2f5c', low: '#e3825a', glow: '#ffc58f' },
    hemi: { sky: '#ffd7b0', ground: '#2b2340', intensity: 1.25 },
    sun: { color: '#ffb27a', intensity: 2.4, position: [-34, 30, 18] },
    rimIntensity: 0.6,
    lampIntensity: 30,
    windowGlow: 0.9,
    fireflies: true,
    fog: { color: '#2a2142', near: 1.1, far: 2.6 },
    exposure: 1.05,
  },
  night: {
    sky: { top: '#05070f', mid: '#0d1530', low: '#1d2a4d', glow: '#2c3d6b' },
    hemi: { sky: '#7f95d0', ground: '#151726', intensity: 0.85 },
    sun: { color: '#a9bfff', intensity: 0.9, position: [20, 40, 22] },
    rimIntensity: 0.35,
    lampIntensity: 90,
    windowGlow: 1.6,
    fireflies: true,
    fog: { color: '#0b1022', near: 1.1, far: 2.6 },
    exposure: 1.3,
  },
};

const WEATHER = {
  clear: { grey: 0, darken: 1, sun: 1, hemi: 1, fogNear: 1, fogFar: 1, wetness: 0, rainVolume: 0, rain: { count: 0, speed: 0, length: 0, opacity: 0 } },
  drizzle: { grey: 0.35, darken: 0.92, sun: 0.55, hemi: 0.85, fogNear: 0.85, fogFar: 0.75, wetness: 0.45, rainVolume: 0.25, rain: { count: 1800, speed: 14, length: 0.5, opacity: 0.35 } },
  downpour: { grey: 0.65, darken: 0.8, sun: 0.22, hemi: 0.7, fogNear: 0.6, fogFar: 0.5, wetness: 0.9, rainVolume: 0.6, rain: { count: 7000, speed: 24, length: 0.9, opacity: 0.5 } },
};

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

/** Pull a color toward its own grey (overcast) and darken it. */
function overcast(hex, grey, darken) {
  if (grey === 0 && darken === 1) return hex;
  const [r, g, b] = toRgb(hex);
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return toHex([r, g, b].map((v) => (v + (l - v) * grey) * darken));
}

export function environmentFor(time, weather) {
  const base = BASE[time] ?? BASE.dusk;
  const w = WEATHER[weather] ?? WEATHER.clear;
  const tint = (hex) => overcast(hex, w.grey, w.darken);
  return {
    sky: Object.fromEntries(Object.entries(base.sky).map(([k, v]) => [k, tint(v)])),
    hemi: { sky: tint(base.hemi.sky), ground: base.hemi.ground, intensity: base.hemi.intensity * w.hemi },
    sun: { color: tint(base.sun.color), intensity: base.sun.intensity * w.sun, position: [...base.sun.position] },
    rimIntensity: base.rimIntensity * w.hemi,
    lampIntensity: base.lampIntensity,
    windowGlow: base.windowGlow,
    fireflies: base.fireflies && weather !== 'downpour',
    fog: { color: tint(base.fog.color), near: base.fog.near * w.fogNear, far: base.fog.far * w.fogFar },
    exposure: base.exposure,
    wetness: w.wetness,
    rain: { ...w.rain },
    rainVolume: w.rainVolume,
  };
}
