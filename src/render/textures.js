// Canvas-generated textures: the painted court, building windows, chain-link and jersey numbers.
import * as THREE from 'three';
import { COURT, HOOP, ARC_RADIUS, KEY, CENTER_CIRCLE_R } from '../sim/config.js';

export const APRON = 1.6;
const PALETTE = {
  asphalt: '#262830',
  court: '#1b5560',
  inside: '#216a76',
  key: '#e2703a',
  center: '#e2703a',
  line: '#f3ead6',
};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function grain(ctx, w, h, amount, alpha) {
  for (let i = 0; i < amount; i += 1) {
    const v = Math.random() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
}

/** Full court markings painted onto a canvas spanning the court plus its apron. */
export function createCourtTexture(renderer) {
  const spanX = COURT.length + APRON * 2;
  const spanZ = COURT.width + APRON * 2;
  const S = 72;
  const [c, ctx] = canvas(Math.round(spanX * S), Math.round(spanZ * S));
  const px = (x) => (x + spanX / 2) * S;
  const pz = (z) => (z + spanZ / 2) * S;
  const m = (v) => v * S;
  const rimX = COURT.halfL - HOOP.fromBaseline;

  ctx.fillStyle = PALETTE.asphalt;
  ctx.fillRect(0, 0, c.width, c.height);
  grain(ctx, c.width, c.height, 60000, 0.08);

  const courtRect = () => {
    ctx.beginPath();
    ctx.rect(px(-COURT.halfL), pz(-COURT.halfW), m(COURT.length), m(COURT.width));
  };
  ctx.fillStyle = PALETTE.court;
  courtRect();
  ctx.fill();

  ctx.save();
  courtRect();
  ctx.clip();
  for (const s of [-1, 1]) {
    ctx.fillStyle = PALETTE.inside;
    ctx.beginPath();
    ctx.arc(px(s * rimX), pz(0), m(ARC_RADIUS), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  for (const s of [-1, 1]) {
    const x0 = s > 0 ? COURT.halfL - KEY.length : -COURT.halfL;
    ctx.fillStyle = PALETTE.key;
    ctx.fillRect(px(x0), pz(-KEY.width / 2), m(KEY.length), m(KEY.width));
  }
  ctx.fillStyle = PALETTE.center;
  ctx.beginPath();
  ctx.arc(px(0), pz(0), m(CENTER_CIRCLE_R), 0, Math.PI * 2);
  ctx.fill();
  grain(ctx, c.width, c.height, 40000, 0.05);

  ctx.strokeStyle = PALETTE.line;
  ctx.lineWidth = m(0.06);
  ctx.lineCap = 'round';
  courtRect();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px(0), pz(-COURT.halfW));
  ctx.lineTo(px(0), pz(COURT.halfW));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px(0), pz(0), m(CENTER_CIRCLE_R), 0, Math.PI * 2);
  ctx.stroke();

  for (const s of [-1, 1]) {
    const hx = px(s * rimX);
    const ftX = s * (COURT.halfL - KEY.length);
    const toCenter = s > 0 ? Math.PI : 0;
    ctx.save();
    courtRect();
    ctx.clip();
    ctx.beginPath();
    ctx.arc(hx, pz(0), m(ARC_RADIUS), toCenter - Math.PI / 2 - 0.3, toCenter + Math.PI / 2 + 0.3);
    ctx.stroke();
    ctx.restore();
    ctx.strokeRect(px(Math.min(ftX, s * COURT.halfL)), pz(-KEY.width / 2), m(KEY.length), m(KEY.width));
    ctx.beginPath();
    ctx.arc(px(ftX), pz(0), m(KEY.ftCircleR), toCenter - Math.PI / 2, toCenter + Math.PI / 2);
    ctx.stroke();
    ctx.setLineDash([m(0.35), m(0.3)]);
    ctx.beginPath();
    ctx.arc(px(ftX), pz(0), m(KEY.ftCircleR), toCenter + Math.PI / 2, toCenter + Math.PI * 1.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(hx, pz(0), m(KEY.restrictedR), toCenter - Math.PI / 2, toCenter + Math.PI / 2);
    ctx.stroke();
    for (const hash of [1.75, 2.85, 3.95]) {
      for (const side of [-1, 1]) {
        const hxm = s * (COURT.halfL - hash);
        ctx.beginPath();
        ctx.moveTo(px(hxm), pz(side * KEY.width / 2));
        ctx.lineTo(px(hxm), pz(side * (KEY.width / 2 + 0.2)));
        ctx.stroke();
      }
    }
  }

  ctx.save();
  ctx.translate(px(0), pz(0));
  ctx.fillStyle = 'rgba(243,234,214,0.92)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${m(0.62)}px Bungee, Impact, sans-serif`;
  ctx.fillText('BLOCK', 0, -m(0.38));
  ctx.fillText('HOOPS', 0, m(0.38));
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(243,234,214,0.55)';
  ctx.font = `${m(0.5)}px Bungee, Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.translate(px(0), pz(COURT.halfW + APRON * 0.55));
  ctx.fillText('NO DUNKS AFTER DARK  ·  EST. 1987  ·  WINNERS STAY', 0, 0);
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

/** Window grid for building facades; lit windows go into the emissive map. */
export function createWindowTextures(cols, rows, seed, shopfront = false) {
  const cw = 64;
  const ch = 80;
  const [c, ctx] = canvas(cols * cw, rows * ch);
  const [e, ectx] = canvas(cols * cw, rows * ch);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, e.width, e.height);
  let r = seed;
  const rand = () => {
    r = (r * 16807) % 2147483647;
    return r / 2147483647;
  };
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (shopfront && y === rows - 1) continue;
      const lit = rand() > 0.45;
      const wx = x * cw + 14;
      const wy = y * ch + 16;
      ctx.fillStyle = '#3b3f52';
      ctx.fillRect(wx - 3, wy - 3, cw - 22, ch - 26);
      ctx.fillStyle = lit ? '#ffd28a' : '#1d2333';
      ctx.fillRect(wx, wy, cw - 28, ch - 32);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(wx + (cw - 28) / 2 - 1, wy, 2, ch - 32);
      if (lit) {
        ectx.fillStyle = rand() > 0.3 ? '#ffb54d' : '#9fd8ff';
        ectx.fillRect(wx, wy, cw - 28, ch - 32);
      }
    }
  }
  if (shopfront) {
    const y = (rows - 1) * ch;
    ctx.fillStyle = '#2a2e3d';
    ctx.fillRect(8, y + 10, c.width - 16, ch - 10);
    ctx.fillStyle = '#ffe2a8';
    ctx.fillRect(16, y + 18, c.width - 32, ch - 28);
    ectx.fillStyle = '#ffcf7a';
    ectx.fillRect(16, y + 18, c.width - 32, ch - 28);
  }
  const map = new THREE.CanvasTexture(c);
  const emissive = new THREE.CanvasTexture(e);
  map.colorSpace = THREE.SRGBColorSpace;
  emissive.colorSpace = THREE.SRGBColorSpace;
  return { map, emissive };
}

export function createChainLinkTexture() {
  const [c, ctx] = canvas(64, 64);
  ctx.strokeStyle = 'rgba(210,214,222,0.9)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(0, 32); ctx.lineTo(32, 0); ctx.lineTo(64, 32); ctx.lineTo(32, 64); ctx.closePath();
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createMuralTexture() {
  const [c, ctx] = canvas(1024, 512);
  const g = ctx.createLinearGradient(0, 0, 1024, 512);
  g.addColorStop(0, '#ff6a2b');
  g.addColorStop(0.5, '#f4b13d');
  g.addColorStop(1, '#22c7b8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = '#1b1530';
  ctx.beginPath();
  ctx.arc(780, 250, 170, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ff6a2b';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(780, 250, 150, 0, Math.PI * 2);
  ctx.moveTo(630, 250); ctx.lineTo(930, 250);
  ctx.moveTo(780, 100); ctx.lineTo(780, 400);
  ctx.stroke();
  ctx.fillStyle = '#1b1530';
  ctx.font = '120px Bungee, Impact, sans-serif';
  ctx.fillText('BLOCK', 40, 210);
  ctx.fillText('HOOPS', 40, 340);
  ctx.font = '36px "Space Grotesk", sans-serif';
  ctx.fillText('RUN IT FULL. WINNERS STAY.', 46, 420);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createNumberTexture(number, color) {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = color;
  ctx.font = '84px Bungee, Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createBallTexture() {
  const [c, ctx] = canvas(256, 128);
  ctx.fillStyle = '#e8672a';
  ctx.fillRect(0, 0, 256, 128);
  grain(ctx, 256, 128, 2500, 0.2);
  ctx.strokeStyle = '#2a140c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 64); ctx.lineTo(256, 64);
  ctx.moveTo(64, 0); ctx.lineTo(64, 128);
  ctx.moveTo(192, 0); ctx.lineTo(192, 128);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(128, 64, 36, 64, 0, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
