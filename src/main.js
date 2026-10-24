// Block Hoops entry point: builds the diorama, runs the sim at a fixed step, renders,
// and connects the control panel to the sim, camera and visuals.
import { createSim, stepSim, restartSim, setTuning, setNextRules } from './sim/sim.js';
import { TIMING } from './sim/config.js';
import { STATE } from './sim/rules.js';
import { DEFAULT_TUNING } from './sim/settings.js';
import { matchupTuning, swapTuning } from './sim/presets.js';
import { createStage, frameBlock, addLampLights, cameraYaw, followBall, setShadows } from './render/scene.js';
import { buildBlock, animateBlock } from './render/block.js';
import { buildCourt, buildHoops, excite, animateHoops } from './render/court.js';
import { buildActors, updateActors } from './render/actors.js';
import { buildRain, animateRain } from './render/rain.js';
import { applyEnvironment } from './render/environment.js';
import { environmentFor } from './env/presets.js';
import { createHud } from './ui/hud.js';
import { createPanel } from './ui/panel.js';
import { sanitizePrefs } from './ui/preferences.js';
import { loadJSON, saveJSON } from './ui/storage.js';
import { resolveLang } from './i18n/strings.js';
import { applyStaticText } from './ui/i18n-dom.js';
import { createCueState, planCues } from './audio/cues.js';
import { createSfx } from './audio/sfx.js';

const STEP = 1 / 60;
const SINGLE_STEP = 0.1;
const MAX_STEPS_PER_FRAME = 16;
const AUTO_ROTATE_SPEED = 0.6;
const DRIBBLE_RATE = 8.5;
// High-refresh screens (120Hz) would otherwise render twice as often as the sim needs.
const MIN_FRAME_MS = 1000 / 60 - 2;
const WINS_KEY = 'corner-court:wins';
const PREFS_KEY = 'corner-court:prefs';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function loadWins() {
  const saved = loadJSON(WINS_KEY, null);
  return Array.isArray(saved) && saved.length === 2 && saved.every((n) => Number.isInteger(n) && n >= 0) ? saved : [0, 0];
}

async function start() {
  try {
    await Promise.race([document.fonts.load('64px Bungee'), new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    // Fonts are decorative; canvas textures fall back to Impact.
  }
  let stage;
  try {
    stage = createStage(document.getElementById('stage'));
  } catch (err) {
    document.getElementById('webgl-error').hidden = false;
    throw err;
  }

  const block = buildBlock();
  stage.scene.add(block.group);
  const lamps = addLampLights(stage.scene, block.lamps);
  const court = buildCourt(stage.renderer);
  stage.scene.add(court);
  const rain = buildRain();
  stage.scene.add(rain);
  const hoops = buildHoops();
  hoops.forEach((h) => stage.scene.add(h.group));

  let prefs = sanitizePrefs(loadJSON(PREFS_KEY, null));
  let sim = createSim({ maxEvents: 120, wins: loadWins(), rules: prefs.rules, tuning: prefs.tuning });
  const actors = buildActors(sim);
  stage.scene.add(actors.group);

  let paused = false;
  let viewDirty = true;
  let lastSeq = 0;
  const sfx = createSfx();
  let cueState = createCueState();
  // A stored "sound on" still needs a fresh click before the browser will play anything.
  if (prefs.sound) window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
  const reframe = () => { stage = frameBlock(stage, window.innerWidth, window.innerHeight, prefs.view); };

  const applyVisuals = () => {
    const env = environmentFor(prefs.time, prefs.weather);
    applyEnvironment({ stage, lamps, block, court, rain }, env);
    sfx.setAmbience(env.rainVolume);
    stage.controls.autoRotate = prefs.autoRotate && !reducedMotion.matches;
    stage.controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
    setShadows(stage, prefs.shadows);
    block.fireflies.visible = prefs.effects && block.fireflies.userData.allowed;
    document.body.classList.toggle('minimap-off', !prefs.minimap);
    sfx.setVolume(prefs.volume);
    sfx.setEnabled(prefs.sound);
  };

  const currentLang = () => resolveLang(prefs.lang, navigator.languages ?? [navigator.language]);
  let lang = currentLang();
  applyStaticText(lang);
  const hud = createHud({ onRestart: () => { sim = restartSim(sim); }, lang });
  let panel;
  const currentRules = () => ({ winScore: sim.game.winScore, insideValue: sim.game.values.inside, outsideValue: sim.game.values.outside });
  const refresh = () => panel.render(prefs, { paused, rules: currentRules(), nextRules: sim.nextRules, lang });
  const updatePrefs = (patch) => {
    viewDirty = true;
    const prev = prefs;
    prefs = sanitizePrefs({ ...prefs, ...patch });
    saveJSON(PREFS_KEY, prefs);
    if (prev.view !== prefs.view) reframe();
    if (prev.lang !== prefs.lang) {
      lang = currentLang();
      applyStaticText(lang);
      hud.setLang(lang);
    }
    applyVisuals();
    refresh();
  };

  const applyBothTeams = (tuning) => {
    if (!tuning) return;
    sim = setTuning(setTuning(sim, 0, tuning[0]), 1, tuning[1]);
    updatePrefs({ tuning: sim.tuning });
  };

  panel = createPanel({
    onPause: () => { paused = !paused; viewDirty = true; refresh(); },
    onStep: () => {
      if (!paused) return;
      for (let t = 0; t < SINGLE_STEP; t += STEP) sim = stepSim(sim, STEP);
      viewDirty = true;
    },
    onRestart: () => { sim = restartSim(sim); refresh(); },
    onRules: (patch) => {
      updatePrefs({ rules: { ...prefs.rules, ...patch } });
      sim = setNextRules(sim, prefs.rules);
      refresh();
    },
    onApplyRules: () => { sim = restartSim(sim, prefs.rules); refresh(); },
    onTuning: (team, patch) => {
      sim = setTuning(sim, team, patch);
      updatePrefs({ tuning: sim.tuning });
    },
    onResetTuning: (team) => {
      sim = setTuning(sim, team, DEFAULT_TUNING);
      updatePrefs({ tuning: sim.tuning });
    },
    onMatchup: (id) => applyBothTeams(matchupTuning(id)),
    onSwapTeams: () => applyBothTeams(swapTuning(sim.tuning)),
    onPrefs: updatePrefs,
    onRefresh: () => refresh(),
  });

  window.addEventListener('resize', reframe);
  reframe();
  applyVisuals();
  refresh();

  let acc = 0;
  let last = performance.now();
  window.addEventListener('resize', () => { viewDirty = true; });
  stage.controls.addEventListener('change', () => { viewDirty = true; });
  const frame = (now) => {
    requestAnimationFrame(frame);
    if (now - last < MIN_FRAME_MS) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const contacts = [];
    let dribbles = 0;
    if (!paused) {
      acc += dt * prefs.speed;
      let steps = 0;
      while (acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
        const before = Math.floor((sim.time * DRIBBLE_RATE) / Math.PI);
        sim = stepSim(sim, STEP);
        excite(hoops, sim.lastContacts, sim.ball);
        if (sim.lastContacts) contacts.push(...sim.lastContacts);
        const dribbling = sim.ball.mode === 'held' && sim.game.state === STATE.LIVE;
        if (dribbling && Math.floor((sim.time * DRIBBLE_RATE) / Math.PI) > before) dribbles += 1;
        acc -= STEP;
        steps += 1;
      }
      if (steps === MAX_STEPS_PER_FRAME) acc = 0;
    }
    const fresh = sim.events.filter((e) => e.seq > lastSeq);
    for (const e of fresh) {
      hud.onEvent(e);
      if (e.type === 'gameOver') saveJSON(WINS_KEY, e.wins);
      if (e.type === 'restart') refresh();
    }
    lastSeq = sim.eventSeq;
    const planned = planCues(cueState, { events: fresh, contacts, dribbles, now });
    cueState = planned.state;
    sfx.play(planned.cues);
    updateActors(actors, sim, paused ? 0 : dt * prefs.speed, { trail: prefs.effects });
    animateHoops(hoops, sim.ball, dt);
    animateBlock(block, now / 1000, reducedMotion.matches || !prefs.effects);
    if (!reducedMotion.matches) animateRain(rain, now / 1000);
    if (prefs.view === 'follow') followBall(stage, sim.ball.pos, dt);
    stage.controls.update();
    const restartIn = sim.game.state === STATE.GAME_OVER ? TIMING.gameOverRestart - (sim.time - sim.gameOverAt) : 0;
    hud.update(sim, { yaw: cameraYaw(stage), restartIn });
    // While paused nothing moves, so only redraw when the camera or settings change.
    if (paused && !viewDirty) return;
    viewDirty = false;
    stage.renderer.render(stage.scene, stage.camera);
  };
  requestAnimationFrame(frame);

  // Hook for debugging and automated checks: inspect the sim or fast-forward it headlessly.
  window.__cornerCourt = {
    get sim() { return sim; },
    get stage() { return stage; },
    get prefs() { return prefs; },
    get audio() { return sfx.state(); },
    advance(seconds) {
      for (let t = 0; t < seconds; t += STEP) sim = stepSim(sim, STEP);
      lastSeq = sim.eventSeq;
      return sim.game;
    },
  };
}

start();
