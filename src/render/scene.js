// Renderer, dusk lighting and a camera that keeps the whole floating block in frame.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BLOCK } from './block.js';

const FOV = 30;
const MAX_PIXEL_RATIO = 1.5;
const FOV_PORTRAIT = 40;
const TARGET = new THREE.Vector3(0, 0.5, (BLOCK.minZ + BLOCK.maxZ) / 2 + 1.5);
const CORNERS = [];
for (const x of [BLOCK.minX, BLOCK.maxX]) {
  for (const y of [-9, 13.5]) {
    for (const z of [BLOCK.minZ, BLOCK.maxZ]) CORNERS.push(new THREE.Vector3(x, y, z));
  }
}

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Everything that casts a shadow is static, so the shadow map renders only when asked.
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x2a2142, 90, 190);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 400);

  const hemi = new THREE.HemisphereLight(0xffd7b0, 0x2b2340, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb27a, 2.4);
  sun.position.set(-34, 30, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 26, bottom: -26, near: 5, far: 110 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x7fb8ff, 0.6);
  rim.position.set(30, 18, -30);
  scene.add(rim);

  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, {
    enablePan: false,
    enableDamping: true,
    dampingFactor: 0.08,
    minPolarAngle: 0.35,
    maxPolarAngle: 1.25,
    rotateSpeed: 0.6,
  });
  controls.target.copy(TARGET);
  return { renderer, scene, camera, controls, sun, hemi, rim, view: 'auto' };
}

/** Lamp glow lights; few of them so mobile GPUs stay happy. */
export function addLampLights(scene, positions) {
  return positions.filter((_, i) => i % 3 === 0 || i === positions.length - 1).map((p) => {
    const light = new THREE.PointLight(0xffc27a, 30, 26, 1.4);
    light.position.copy(p);
    scene.add(light);
    return light;
  });
}

function fits(camera, margin) {
  camera.updateMatrixWorld();
  return CORNERS.every((c) => {
    const v = c.clone().project(camera);
    return Math.abs(v.x) < 1 - margin && Math.abs(v.y) < 1 - margin;
  });
}

/** Camera angles per preset; portrait screens prefer looking down the court from one end. */
function viewAngles(view, portrait) {
  const end = Math.PI / 2;
  switch (view) {
    case 'side': return { azimuth: 0.08, polar: 0.98 };
    case 'baseline': return { azimuth: end, polar: portrait ? 0.72 : 0.86 };
    case 'top': return { azimuth: portrait ? end : 0, polar: 0.12 };
    case 'follow': return { azimuth: portrait ? end : 0.08, polar: portrait ? 0.8 : 0.95 };
    default: return portrait ? { azimuth: end, polar: 0.72 } : { azimuth: 0.08, polar: 0.98 };
  }
}

/**
 * Frame the whole block for the current viewport and camera preset. The follow preset
 * starts from the same fit but sits closer and tracks the ball (see followBall).
 */
export function frameBlock(stage, width, height, view = stage.view) {
  const { renderer, camera, controls } = stage;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  const portrait = width / height < 0.9;
  camera.fov = portrait ? FOV_PORTRAIT : FOV;
  const { azimuth, polar } = viewAngles(view, portrait);
  controls.target.copy(TARGET);
  const dir = new THREE.Vector3().setFromSphericalCoords(1, polar, azimuth);
  let lo = 10;
  let hi = 400;
  for (let i = 0; i < 30; i += 1) {
    const mid = (lo + hi) / 2;
    camera.position.copy(controls.target).addScaledVector(dir, mid);
    camera.lookAt(controls.target);
    camera.updateProjectionMatrix();
    if (fits(camera, portrait ? 0.03 : 0.05)) hi = mid;
    else lo = mid;
  }
  const distance = view === 'follow' ? hi * 0.45 : hi;
  camera.position.copy(controls.target).addScaledVector(dir, distance);
  camera.lookAt(controls.target);
  camera.updateProjectionMatrix();
  controls.minDistance = hi * (view === 'follow' ? 0.2 : 0.45);
  controls.maxDistance = hi * 1.25;
  controls.maxPolarAngle = 1.25;
  controls.minPolarAngle = view === 'top' ? 0.05 : 0.35;
  const fog = stage.scene.userData.fogFactors ?? { near: 1.1, far: 2.6 };
  stage.scene.userData.fit = hi;
  stage.scene.fog.near = hi * fog.near;
  stage.scene.fog.far = hi * fog.far;
  controls.update();
  return { ...stage, view };
}

/** Keep the orbit target gliding after the ball while preserving the user's angle and zoom. */
export function followBall(stage, ball, dt) {
  const { camera, controls } = stage;
  const goal = new THREE.Vector3(ball.x * 0.9, 1, ball.z * 0.8);
  const delta = goal.sub(controls.target).multiplyScalar(Math.min(1, dt * 3));
  controls.target.add(delta);
  camera.position.add(delta);
}

export function setShadows(stage, enabled) {
  stage.sun.castShadow = enabled;
  stage.renderer.shadowMap.needsUpdate = true;
}

/** Camera yaw in degrees, used to keep the mini-map aligned with the 3D view. */
export function cameraYaw(stage) {
  const { camera, controls } = stage;
  const offset = camera.position.clone().sub(controls.target);
  return Math.atan2(offset.x, offset.z);
}
