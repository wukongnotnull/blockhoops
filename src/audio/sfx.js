// Synthesized sound effects with the Web Audio API: no audio files to download.
// Browsers only start audio after a user gesture, so unlock() runs from a click handler.

const NOISE_SECONDS = 2;

function createNoise(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Gain node with an attack/decay envelope starting at t. */
function envelope(ctx, out, t, { peak, attack = 0.005, decay }) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

function tone(ctx, out, t, { type = 'sine', freq, toFreq, peak, decay, attack }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (toFreq) osc.frequency.exponentialRampToValueAtTime(toFreq, t + decay);
  osc.connect(envelope(ctx, out, t, { peak, decay, attack }));
  osc.start(t);
  osc.stop(t + (attack ?? 0.005) + decay + 0.05);
  return osc;
}

function noise(ctx, out, t, noiseBuffer, { filter = 'bandpass', freq, toFreq, q = 1, peak, decay, attack }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  if (toFreq) f.frequency.exponentialRampToValueAtTime(toFreq, t + decay);
  f.Q.value = q;
  src.connect(f);
  f.connect(envelope(ctx, out, t, { peak, decay, attack }));
  src.start(t, Math.random() * (NOISE_SECONDS - 1.6));
  src.stop(t + (attack ?? 0.005) + decay + 0.05);
}

const VOICES = {
  dribble: (c, o, t, n, g) => {
    tone(c, o, t, { freq: 140, toFreq: 55, peak: 0.7 * g, decay: 0.12 });
    noise(c, o, t, n, { filter: 'lowpass', freq: 900, peak: 0.25 * g, decay: 0.04 });
  },
  bounce: (c, o, t, n, g) => {
    tone(c, o, t, { freq: 120, toFreq: 48, peak: 0.8 * g, decay: 0.16 });
    noise(c, o, t, n, { filter: 'lowpass', freq: 1200, peak: 0.3 * g, decay: 0.05 });
  },
  rim: (c, o, t, n, g) => {
    const base = 480 + Math.random() * 80;
    tone(c, o, t, { type: 'triangle', freq: base, peak: 0.35 * g, decay: 0.45 });
    tone(c, o, t, { freq: base * 2.76, peak: 0.18 * g, decay: 0.3 });
    tone(c, o, t, { freq: base * 5.4, peak: 0.08 * g, decay: 0.15 });
    noise(c, o, t, n, { freq: 3000, q: 2, peak: 0.2 * g, decay: 0.03 });
  },
  board: (c, o, t, n, g) => {
    tone(c, o, t, { freq: 190, toFreq: 120, peak: 0.6 * g, decay: 0.14 });
    noise(c, o, t, n, { filter: 'lowpass', freq: 1600, peak: 0.45 * g, decay: 0.08 });
  },
  swish: (c, o, t, n, g) => {
    noise(c, o, t, n, { freq: 2500, toFreq: 6500, q: 0.8, peak: 0.5 * g, attack: 0.03, decay: 0.32 });
  },
  net: (c, o, t, n, g) => {
    VOICES.rim(c, o, t, n, g * 0.5);
    noise(c, o, t + 0.05, n, { freq: 2200, toFreq: 5000, q: 0.8, peak: 0.4 * g, attack: 0.03, decay: 0.26 });
  },
  whistle: (c, o, t, n, g) => {
    const osc = tone(c, o, t, { freq: 2900, peak: 0.22 * g, attack: 0.02, decay: 0.45 });
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = 38;
    depth.gain.value = 140;
    lfo.connect(depth);
    depth.connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + 0.55);
    noise(c, o, t, n, { freq: 3000, q: 4, peak: 0.08 * g, attack: 0.02, decay: 0.4 });
  },
  squeak: (c, o, t, n, g) => {
    tone(c, o, t, { type: 'sawtooth', freq: 1700, toFreq: 2600, peak: 0.07 * g, decay: 0.09 });
    tone(c, o, t + 0.1, { type: 'sawtooth', freq: 2100, toFreq: 2900, peak: 0.05 * g, decay: 0.07 });
  },
  buzzer: (c, o, t, n, g) => {
    tone(c, o, t, { type: 'square', freq: 220, peak: 0.12 * g, attack: 0.01, decay: 1.1 });
    tone(c, o, t, { type: 'square', freq: 233, peak: 0.1 * g, attack: 0.01, decay: 1.1 });
  },
  cheer: (c, o, t, n, g) => {
    noise(c, o, t, n, { freq: 900, q: 0.6, peak: 0.35 * g, attack: 0.25, decay: 1.3 });
    noise(c, o, t + 0.1, n, { freq: 2200, q: 1.2, peak: 0.12 * g, attack: 0.3, decay: 1.0 });
  },
};

export function createSfx() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let enabled = false;
  let volume = 0.6;
  let ambienceLevel = 0;
  let ambience = null;

  /** Looping filtered noise for rain; its gain follows the weather. */
  function startAmbience() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 2600;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 350;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(low);
    low.connect(high);
    high.connect(gain);
    gain.connect(master);
    src.start();
    ambience = gain;
  }

  /** Create or resume the audio context; call from a click so the browser allows sound. */
  function unlock() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;
    if (!ctx) {
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.connect(ctx.destination);
      noiseBuffer = createNoise(ctx);
      startAmbience();
    }
    ambience.gain.setTargetAtTime(ambienceLevel, ctx.currentTime, 0.4);
    master.gain.value = volume;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  }

  return {
    unlock,
    /** 'none' before the first unlock, then the AudioContext state. */
    state: () => ctx?.state ?? 'none',
    setEnabled(on) {
      enabled = on;
      if (on) unlock();
      else if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    },
    /** Background rain loudness 0..1 (0 for clear skies). */
    setAmbience(level) {
      ambienceLevel = level;
      if (ambience) ambience.gain.setTargetAtTime(level, ctx.currentTime, 0.6);
    },
    setVolume(v) {
      volume = v;
      if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
    },
    /** Play cues from planCues; silently does nothing until audio is unlocked. */
    play(cues) {
      if (!enabled || !ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime + 0.01;
      cues.forEach((cue) => VOICES[cue.name]?.(ctx, master, t, noiseBuffer, cue.gain));
    },
  };
}
