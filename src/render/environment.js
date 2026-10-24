// Applies a time-of-day/weather environment (from env/presets.js) to the scene and page sky.
import * as THREE from 'three';
import { setRain } from './rain.js';

const DRY_ROUGHNESS = 0.92;
const WET_TINT = new THREE.Color('#aab4c0');
const WHITE = new THREE.Color('#ffffff');

/**
 * @param {object} parts - { stage, lamps, block, court, rain }
 * @param {ReturnType<import('../env/presets.js').environmentFor>} env
 */
export function applyEnvironment({ stage, lamps, block, court, rain }, env) {
  const { scene, renderer, sun, hemi, rim } = stage;
  hemi.color.set(env.hemi.sky);
  hemi.groundColor.set(env.hemi.ground);
  hemi.intensity = env.hemi.intensity;
  sun.color.set(env.sun.color);
  sun.intensity = env.sun.intensity;
  sun.position.set(...env.sun.position);
  rim.intensity = env.rimIntensity;
  renderer.toneMappingExposure = env.exposure;
  renderer.shadowMap.needsUpdate = true;

  scene.fog.color.set(env.fog.color);
  scene.userData.fogFactors = { near: env.fog.near, far: env.fog.far };
  const fit = scene.userData.fit;
  if (fit) {
    scene.fog.near = fit * env.fog.near;
    scene.fog.far = fit * env.fog.far;
  }

  lamps.forEach((l) => { l.intensity = env.lampIntensity; });
  block.bulbs.forEach((m) => m.color.set(env.lampIntensity > 0 ? '#ffd59a' : '#8a8478'));
  block.facades.forEach((m) => { m.emissiveIntensity = env.windowGlow; });
  block.fireflies.userData.allowed = env.fireflies;

  const courtMat = court.material;
  courtMat.roughness = DRY_ROUGHNESS - env.wetness * 0.6;
  courtMat.metalness = env.wetness * 0.12;
  courtMat.color.copy(WHITE).lerp(WET_TINT, env.wetness);

  setRain(rain, env.rain, env.hemi.sky);

  const root = document.documentElement.style;
  root.setProperty('--sky-top', env.sky.top);
  root.setProperty('--sky-mid', env.sky.mid);
  root.setProperty('--sky-low', env.sky.low);
  root.setProperty('--sky-glow', env.sky.glow);
}
