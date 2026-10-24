// Rain streaks animated entirely on the GPU: drop positions are static, a time
// uniform moves them, and the draw range sets how many fall (0 for clear skies).
import * as THREE from 'three';

const MAX_DROPS = 7000;
const AREA = Object.freeze({ minX: -27, maxX: 27, minZ: -21, maxZ: 17, top: 24, bottom: -4 });

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uLength;
  attribute float aEnd;
  void main() {
    float h = ${(AREA.top - AREA.bottom).toFixed(1)};
    float y = ${AREA.bottom.toFixed(1)} + mod(position.y - uTime * uSpeed, h);
    vec3 p = vec3(position.x + y * 0.035, y + aEnd * uLength, position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(uColor, uOpacity);
  }
`;

export function buildRain() {
  const positions = new Float32Array(MAX_DROPS * 6);
  const ends = new Float32Array(MAX_DROPS * 2);
  for (let i = 0; i < MAX_DROPS; i += 1) {
    const x = AREA.minX + Math.random() * (AREA.maxX - AREA.minX);
    const z = AREA.minZ + Math.random() * (AREA.maxZ - AREA.minZ);
    const y = Math.random() * (AREA.top - AREA.bottom);
    positions.set([x, y, z, x, y, z], i * 6);
    ends.set([0, 1], i * 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
  geo.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: 14 },
      uLength: { value: 0.5 },
      uColor: { value: new THREE.Color('#cfd8e6') },
      uOpacity: { value: 0.35 },
    },
  });
  const lines = new THREE.LineSegments(geo, material);
  lines.frustumCulled = false;
  lines.visible = false;
  return lines;
}

/** Set density, speed, streak length and tint from an environment's rain settings. */
export function setRain(rain, { count, speed, length, opacity }, color) {
  const n = Math.min(MAX_DROPS, count);
  rain.geometry.setDrawRange(0, n * 2);
  rain.visible = n > 0;
  const u = rain.material.uniforms;
  u.uSpeed.value = speed;
  u.uLength.value = length;
  u.uOpacity.value = opacity;
  u.uColor.value.set(color);
}

export function animateRain(rain, seconds) {
  if (rain.visible) rain.material.uniforms.uTime.value = seconds;
}
