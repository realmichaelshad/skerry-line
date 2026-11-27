// Draws one SceneState as a flat, layered travel-poster picture of the sound: sky, far land, Tern Holm, the
// skerries and the light, the sea, the quay at Harrowick and the Kittiwake. It reads nothing but the state.

import { css, smoothstep, type RGB, type SceneState } from '../model/scene.ts';

type Ctx = CanvasRenderingContext2D;

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** Paint a base color under the scene's light: multiply by the ambient color. */
const lit = (base: RGB, amb: RGB, k = 1): RGB => mix(base, [base[0] * amb[0] / 255, base[1] * amb[1] / 255, base[2] * amb[2] / 255], k);

const CREAM: RGB = [242, 236, 222];
const HULL: RGB = [30, 70, 92];
const BOOT: RGB = [196, 82, 46];
const FUNNEL: RGB = [222, 110, 52];
const OFFICE: RGB = [200, 92, 50];
const LAMP: RGB = [255, 184, 104];
const WINDOW: RGB = [255, 196, 120];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export interface Layout {
  w: number; h: number;
  hz: number; // horizon
  qx: number; // end of the quay (its right edge)
  qTop: number; qFront: number; // top surface back and front edge
  ferryLen: number;
  berthX: number; // middle of the ferry at Harrowick
  tx: number; ty: number; // Tern Holm berth (far)
  cx: number; cy: number; // control point of the crossing curve
  waterAt: (height: number) => number; // y of the water against the quay for a tide height
  px: number; // pixels per unit for small things
}

export function layout(w: number, h: number): Layout {
  const wide = w / h;
  const hz = h * (wide > 1.6 ? 0.5 : 0.46);
  const qx = Math.min(w * 0.4, h * 0.95);
  const qTop = h * 0.66, qFront = h * 0.735;
  const datum = h * 0.955, perM = h * 0.042;
  const ferryLen = Math.min(w * 0.36, h * 0.64);
  const berthX = qx + ferryLen * 0.5 + h * 0.012;
  const tx = Math.max(qx + ferryLen * 0.9, w * 0.78), ty = hz + h * 0.028;
  return {
    w, h, hz, qx, qTop, qFront, ferryLen, berthX, tx, ty,
    cx: Math.min(w * 0.97, tx + (w - tx) * 0.5 + w * 0.05), cy: hz + h * 0.2,
    waterAt: (height: number) => datum - height * perM,
    px: Math.min(w, h * 1.7) / 1000,
  };
}

/** Where the boat is drawn for a crossing position p (0 Harrowick, 1 Tern Holm) and the tide at Harrowick. */
export function ferryPlace(L: Layout, p: number, tideY: number): { x: number; y: number; s: number } {
  const x0 = L.berthX, y0 = tideY;
  const t = p;
  const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * L.cx + t * t * L.tx;
  const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * L.cy + t * t * L.ty;
  // Perspective: size follows the distance below the horizon.
  const s = Math.max(0.1, (y - L.hz) / (y0 - L.hz));
  return { x, y, s };
}

export class Scene {
  private grain: HTMLCanvasElement | null = null;
  reduced = false;

  draw(g: Ctx, st: SceneState, L: Layout): void {
    const C = st.colors;
    const { w, h, hz } = L;

    const tideY = L.waterAt(st.tide.height);
    const seconds = st.moment.minute * 60;

    // Sky.
    const sky = g.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, css(C.skyTop));
    sky.addColorStop(0.62, css(C.skyMid));
    sky.addColorStop(1, css(C.skyLow));
    g.fillStyle = sky;
    g.fillRect(0, 0, w, hz + 2);

    // Stars.
    if (st.stars > 0.01) {
      const R = rng(7);
      g.fillStyle = 'rgb(246,240,220)';
      for (let i = 0; i < 90; i++) {
        const x = R() * w, y = R() * hz * 0.85, r = 0.6 + R() * 1.1, a = st.stars * (0.35 + R() * 0.65) * (1 - y / hz * 0.5);
        g.globalAlpha = a;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    }

    // Glow on the horizon where the sun is (even when it is just off the picture).
    const sunX = w / 2 + Math.sin(((st.sun.az - 180) * Math.PI) / 180) * w * 0.47;
    const sunY = hz - (st.sun.elev / 62) * hz * 1.05;
    const glowK = smoothstep(-12, -2, st.sun.elev) * smoothstep(16, 1, st.sun.elev);
    if (glowK > 0.01) {
      const gx = Math.max(-w * 0.1, Math.min(w * 1.1, sunX));
      const rad = Math.max(w, h) * 0.75;
      const gl = g.createRadialGradient(gx, hz, 0, gx, hz, rad);
      gl.addColorStop(0, css(C.glow, 0.75 * glowK));
      gl.addColorStop(0.35, css(C.glow, 0.32 * glowK));
      gl.addColorStop(1, css(C.glow, 0));
      g.fillStyle = gl;
      g.fillRect(0, 0, w, hz + 2);
    }

    // The sun.
    if (st.sun.elev > -1.2) {
      const r = Math.min(w, h) * 0.04;
      const sunCol = mix([255, 214, 150], [255, 248, 228], smoothstep(2, 25, st.sun.elev));
      const halo = g.createRadialGradient(sunX, sunY, r * 0.8, sunX, sunY, r * 4.5);
      halo.addColorStop(0, css(sunCol, 0.45)); halo.addColorStop(1, css(sunCol, 0));
      g.fillStyle = halo; g.beginPath(); g.arc(sunX, sunY, r * 4.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = css(sunCol);
      g.beginPath(); g.arc(sunX, sunY, r, 0, Math.PI * 2); g.fill();
    }

    // The moon (approximate path, real phase).
    if (st.moon.elev > -1 && st.moon.illum > 0.03) {
      const mx = w / 2 + Math.sin(((st.moon.az - 180) * Math.PI) / 180) * w * 0.47;
      const my = hz - (st.moon.elev / 62) * hz * 1.05;
      const r = Math.min(w, h) * 0.026;
      const show = smoothstep(4, -6, st.sun.elev) * 0.85 + 0.15;
      this.moon(g, mx, my, r, st.moon.age, show, C.skyMid);
    }

    // Clouds: long flat bands, drifting slowly.
    this.clouds(g, st, L);

    // Far land: the mainland hills behind, hazy by day, silhouettes at dusk.
    const haze = smoothstep(-2, 20, st.sun.elev) * 0.45;
    const far = mix(C.landFar, C.skyLow, haze);
    g.fillStyle = css(far);
    this.hills(g, 0, w * 0.62, hz, h * 0.05, 11, 0.9);
    g.fillStyle = css(mix(far, C.skyLow, 0.35));
    this.hills(g, w * 0.5, w * 1.05, hz, h * 0.032, 23, 0.7);

    // Tern Holm across the water.
    this.island(g, st, L, far);

    // The sea.
    const seaG = g.createLinearGradient(0, hz, 0, h);
    seaG.addColorStop(0, css(mix(C.sea, C.skyLow, 0.25)));
    seaG.addColorStop(0.25, css(C.sea));
    seaG.addColorStop(1, css(C.seaNear));
    g.fillStyle = seaG;
    g.fillRect(0, hz, w, h - hz);
    this.waves(g, st, L);
    this.lightPath(g, st, L, sunX);

    // Skerries and the lighthouse on its rock.
    this.skerries(g, st, L);

    // The quay at Harrowick, with its lamps and the water against its wall.
    this.quay(g, st, L, tideY);

    // The Kittiwake.
    this.ferry(g, st, L, tideY, seconds);

    // Lamps' glow last, so it sits over everything near it.
    this.lampGlow(g, st, L);
    this.gulls(g, st, L, seconds);
    this.paper(g, w, h);
  }

  // ------------------------------------------------------------------ sky things

  private moon(g: Ctx, x: number, y: number, r: number, age: number, alpha: number, sky: RGB): void {
    g.save();
    g.globalAlpha = alpha;
    const halo = g.createRadialGradient(x, y, r, x, y, r * 4);
    halo.addColorStop(0, 'rgba(240,236,214,0.28)'); halo.addColorStop(1, 'rgba(240,236,214,0)');
    g.fillStyle = halo; g.beginPath(); g.arc(x, y, r * 4, 0, Math.PI * 2); g.fill();
    // Dark disc, then the lit part: a half disc plus an ellipse that grows or eats it.
    g.fillStyle = css(mix(sky, [20, 30, 50], 0.4), 0.5);
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    const phase = age * 2 * Math.PI;
    const k = Math.cos(phase); // 1 new, -1 full
    const waxing = age < 0.5;
    g.fillStyle = 'rgb(244,238,214)';
    g.beginPath();
    g.arc(x, y, r, -Math.PI / 2, Math.PI / 2, !waxing);
    g.ellipse(x, y, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === waxing ? true : false);
    g.fill();
    g.restore();
  }

  private clouds(g: Ctx, st: SceneState, L: Layout): void {
    const { w, hz } = L;
    const R = rng(31);
    const drift = (st.moment.minute * 0.35) % (w * 1.6);
    const base = st.colors.cloud;
    for (let i = 0; i < 7; i++) {
      const y = hz * (0.12 + R() * 0.6), len = w * (0.18 + R() * 0.3), th = L.h * (0.008 + R() * 0.014);
      let x = ((R() * w * 1.6 + drift * (0.6 + R() * 0.6)) % (w * 1.6)) - w * 0.3;
      const a = 0.25 + R() * 0.35;
      // Lower clouds catch more of the glow.
      const col = mix(base, st.colors.skyMid, 0.3 + 0.4 * (1 - y / hz));
      g.fillStyle = css(col, a);
      for (let k = 0; k < 3; k++) {
        const ox = x + k * len * 0.18, oy = y + k * th * 0.9, ln = len * (1 - k * 0.22);
        g.beginPath(); g.roundRect(ox, oy, ln, th, th / 2); g.fill();
      }
      x += 0;
    }
  }

  private hills(g: Ctx, x0: number, x1: number, base: number, height: number, seed: number, jag: number): void {
    const R = rng(seed);
    g.beginPath();
    g.moveTo(x0, base + 1);
    const n = 9;
    let px = x0, py = base;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = base - height * (0.25 + R() * 0.75 * jag) * Math.sin((Math.PI * i) / n) ** 0.6;
      g.quadraticCurveTo((px + x) / 2, Math.min(py, y) - height * 0.15, x, y);
      px = x; py = y;
    }
    g.lineTo(x1, base + 1);
    g.closePath();
    g.fill();
  }

  private island(g: Ctx, st: SceneState, L: Layout, far: RGB): void {
    const { w, h, hz, tx, ty } = L;
    const C = st.colors;
    const land = mix(C.landNear, far, smoothstep(-2, 20, st.sun.elev) * 0.35);
    const x0 = Math.min(tx - w * 0.2, w * 0.58), x1 = w * 1.05;
    // The holm: a long low green-brown shape with a rise at the far end.
    g.fillStyle = css(land);
    g.beginPath();
    g.moveTo(x0, hz + 1);
    g.bezierCurveTo(x0 + w * 0.06, hz - h * 0.02, x0 + w * 0.14, hz - h * 0.035, tx, hz - h * 0.03);
    g.bezierCurveTo(tx + w * 0.06, hz - h * 0.03, x1 - w * 0.1, hz - h * 0.085, x1, hz - h * 0.07);
    g.lineTo(x1, hz + 1);
    g.closePath();
    g.fill();
    // A lighter top edge where the light catches.
    g.strokeStyle = css(mix(land, C.skyLow, 0.35), 0.6);
    g.lineWidth = Math.max(1, h * 0.003);
    g.stroke();
    // Houses by the island quay.
    const hs = h * 0.016;
    const houses = [tx + hs * 1.6, tx + hs * 3.4, tx + hs * 5.6, tx - hs * 1.8];
    houses.forEach((x, i) => {
      const y = hz - h * 0.03 + (i === 3 ? h * 0.008 : 0);
      g.fillStyle = css(lit(i % 2 ? [226, 220, 204] : [196, 96, 60], C.ambient));
      g.fillRect(x - hs, y - hs * 1.2, hs * 2, hs * 1.3);
      g.fillStyle = css(lit([60, 74, 86], C.ambient));
      g.beginPath(); g.moveTo(x - hs * 1.15, y - hs * 1.2); g.lineTo(x, y - hs * 2); g.lineTo(x + hs * 1.15, y - hs * 1.2); g.closePath(); g.fill();
      const lw = st.islandWindows[i];
      if (lw > 0.02) { g.fillStyle = css(WINDOW, lw); g.fillRect(x - hs * 0.45, y - hs * 0.8, hs * 0.5, hs * 0.45); }
    });
    // The island's quay: a short pale pier at the berth.
    g.fillStyle = css(lit([186, 176, 160], C.ambient));
    g.fillRect(tx - h * 0.03, ty - h * 0.012, h * 0.06, h * 0.008);
  }

  // ------------------------------------------------------------------ the sea

  private waves(g: Ctx, st: SceneState, L: Layout): void {
    const { w, h, hz } = L;
    const R = rng(5);
    const t = this.reduced ? 0 : st.moment.minute;
    const light = mix(st.colors.sea, st.colors.skyLow, 0.45);
    const dark = mix(st.colors.seaNear, [0, 0, 0], 0.15);
    for (let i = 0; i < 70; i++) {
      const d = R(); // 0 far .. 1 near
      const y = hz + (h - hz) * (0.03 + d * d * 0.97);
      const len = (6 + R() * 26) * (0.3 + d * 1.6) * L.px * 1.6;
      const x = ((R() * w + t * (0.8 + R()) * (0.4 + d)) % (w + 60)) - 30;
      g.fillStyle = css(R() < 0.55 ? light : dark, 0.22 + 0.25 * d);
      g.fillRect(x, y, len, Math.max(1, (0.7 + d * 1.6) * L.px * 1.4));
    }
  }

  private lightPath(g: Ctx, st: SceneState, L: Layout, sunX: number): void {
    const lp = st.light;
    if (lp.strength < 0.02) return;
    const { w, h, hz } = L;
    const x = lp.fromMoon ? w / 2 + Math.sin(((lp.az - 180) * Math.PI) / 180) * w * 0.47 : sunX;
    if (x < -w * 0.15 || x > w * 1.15) return;
    const R = rng(13);
    const t = this.reduced ? 0 : Math.floor(st.moment.minute);
    for (let i = 0; i < 46; i++) {
      const d = i / 46;
      const y = hz + 2 + (h - hz) * d * d;
      const spread = (0.012 + d * 0.11) * w;
      const n = 1 + Math.floor(d * 3);
      for (let k = 0; k < n; k++) {
        const jx = (R() - 0.5) * 2 * spread * 0.7 + Math.sin(t * 0.7 + i) * spread * 0.08;
        const len = spread * (0.25 + R() * 0.55);
        g.fillStyle = css(lp.color, lp.strength * (0.75 - d * 0.35));
        g.fillRect(x + jx - len / 2, y, len, Math.max(1, (1 + d * 3) * L.px * 1.4));
      }
    }
  }

  private skerries(g: Ctx, st: SceneState, L: Layout): void {
    const { w, h, hz } = L;
    const C = st.colors;
    const tide = st.tide.height - 1.75; // relative to mean
    const rocks: [number, number, number, number][] = [
      // x, y (base at mean sea level), width, height, all as fractions
      [0.43, 0.02, 0.07, 0.016], [0.5, 0.012, 0.035, 0.01], [0.6, 0.05, 0.05, 0.012], [0.33, 0.035, 0.045, 0.01], [0.7, 0.09, 0.06, 0.014],
    ];
    rocks.forEach(([fx, fy, fw, fh], i) => {
      const base = hz + h * fy;
      const depth = (base - hz) / (h - hz);
      const water = base - tide * h * 0.012 * (0.3 + depth * 2);
      const x = w * fx, rw = w * fw, rh = h * fh * 2.2;
      g.save();
      g.beginPath(); g.rect(0, 0, w, water); g.clip();
      g.fillStyle = css(C.rock);
      g.beginPath();
      g.moveTo(x - rw / 2, base + rh * 0.4);
      g.bezierCurveTo(x - rw / 2, base - rh * 0.6, x - rw * 0.1, base - rh, x + rw * 0.1, base - rh * 0.9);
      g.bezierCurveTo(x + rw * 0.4, base - rh * 0.8, x + rw / 2, base - rh * 0.2, x + rw / 2, base + rh * 0.4);
      g.closePath(); g.fill();
      g.fillStyle = css(C.rockShade);
      g.beginPath();
      g.moveTo(x + rw * 0.05, base + rh * 0.4);
      g.bezierCurveTo(x + rw * 0.2, base - rh * 0.5, x + rw * 0.35, base - rh * 0.6, x + rw / 2, base + rh * 0.4);
      g.closePath(); g.fill();
      g.restore();
      // A pale line where the water meets the rock.
      g.fillStyle = css(mix(C.sea, CREAM, 0.35), 0.5);
      g.fillRect(x - rw * 0.55, water - 1, rw * 1.1, Math.max(1, h * 0.002));
      if (i === 0) this.lighthouse(g, st, L, x - rw * 0.08, base - rh * 0.9);
    });
  }

  private lighthouse(g: Ctx, st: SceneState, L: Layout, x: number, y: number): void {
    const { h } = L;
    const C = st.colors;
    const th = h * 0.085, tw = th * 0.24;
    const white = lit([240, 236, 224], C.ambient), band = lit([22, 88, 104], C.ambient);
    // Keeper's cottage.
    g.fillStyle = css(lit([232, 226, 210], C.ambient));
    g.fillRect(x + tw * 0.7, y - th * 0.24, tw * 1.5, th * 0.24);
    g.fillStyle = css(lit([52, 66, 78], C.ambient));
    g.beginPath(); g.moveTo(x + tw * 0.6, y - th * 0.24); g.lineTo(x + tw * 1.45, y - th * 0.4); g.lineTo(x + tw * 2.3, y - th * 0.24); g.closePath(); g.fill();
    // Tower, tapering, with one band.
    g.fillStyle = css(white);
    g.beginPath(); g.moveTo(x - tw / 2, y); g.lineTo(x - tw * 0.36, y - th); g.lineTo(x + tw * 0.36, y - th); g.lineTo(x + tw / 2, y); g.closePath(); g.fill();
    g.fillStyle = css(band);
    g.beginPath(); g.moveTo(x - tw * 0.45, y - th * 0.38); g.lineTo(x - tw * 0.41, y - th * 0.62); g.lineTo(x + tw * 0.41, y - th * 0.62); g.lineTo(x + tw * 0.45, y - th * 0.38); g.closePath(); g.fill();
    // Lantern.
    const on = st.lighthouse.on;
    g.fillStyle = css(mix(lit([60, 70, 80], C.ambient), [255, 214, 140], on));
    g.fillRect(x - tw * 0.3, y - th * 1.14, tw * 0.6, th * 0.14);
    g.fillStyle = css(band);
    g.beginPath(); g.moveTo(x - tw * 0.4, y - th * 1.14); g.lineTo(x, y - th * 1.26); g.lineTo(x + tw * 0.4, y - th * 1.14); g.closePath(); g.fill();
    if (on > 0.02) {
      const lx = x, ly = y - th * 1.07;
      const halo = g.createRadialGradient(lx, ly, 0, lx, ly, th * 0.6);
      halo.addColorStop(0, `rgba(255,224,160,${0.7 * on})`); halo.addColorStop(1, 'rgba(255,224,160,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(lx, ly, th * 0.6, 0, Math.PI * 2); g.fill();
      // The beam sweeps: seen from the side it grows and shrinks as it turns towards us and away.
      const a = st.lighthouse.beam;
      const reach = L.w * 0.5 * Math.abs(Math.cos(a));
      const dir = Math.cos(a) >= 0 ? 1 : -1;
      const toward = (Math.sin(a) + 1) / 2;
      const beam = g.createLinearGradient(lx, ly, lx + dir * reach, ly);
      beam.addColorStop(0, `rgba(255,226,170,${0.42 * on * (0.5 + 0.5 * toward)})`);
      beam.addColorStop(1, 'rgba(255,226,170,0)');
      g.fillStyle = beam;
      g.beginPath(); g.moveTo(lx, ly - th * 0.03); g.lineTo(lx + dir * reach, ly - th * 0.35 * (0.4 + toward)); g.lineTo(lx + dir * reach, ly + th * 0.3 * (0.4 + toward)); g.lineTo(lx, ly + th * 0.03); g.closePath(); g.fill();
    }
  }

  // ------------------------------------------------------------------ the quay

  private quay(g: Ctx, st: SceneState, L: Layout, tideY: number): void {
    const { w, h, qx, qTop, qFront } = L;
    const C = st.colors;
    void w;
    // Houses of Harrowick behind the quay, on the rising shore.
    g.fillStyle = css(lit([92, 104, 96], C.ambient));
    g.beginPath(); g.moveTo(0, qTop); g.lineTo(0, qTop - h * 0.17); g.bezierCurveTo(qx * 0.35, qTop - h * 0.17, qx * 0.65, qTop - h * 0.08, qx * 0.95, qTop); g.closePath(); g.fill();
    const hs = h * 0.03;
    // Two staggered rows on the rising shore, clear of the ferry office.
    const houses = [[0.3, 0.17, [230, 226, 212]], [0.45, 0.145, [196, 104, 70]], [0.6, 0.115, [232, 214, 170]], [0.38, 0.075, [212, 120, 82]], [0.53, 0.06, [228, 222, 206]], [0.68, 0.045, [190, 90, 60]], [0.8, 0.02, [226, 224, 214]]] as const;
    houses.forEach(([fx, fy, col], i) => {
      const x = qx * fx, y = qTop - h * fy * 0.75;
      g.fillStyle = css(lit(col as unknown as RGB, C.ambient));
      g.fillRect(x - hs, y - hs * 1.1, hs * 2, hs * 1.1);
      g.fillStyle = css(lit([48, 62, 74], C.ambient));
      g.beginPath(); g.moveTo(x - hs * 1.15, y - hs * 1.1); g.lineTo(x, y - hs * 1.85); g.lineTo(x + hs * 1.15, y - hs * 1.1); g.closePath(); g.fill();
      const lw = st.windows[i];
      g.fillStyle = lw > 0.02 ? css(mix(lit([70, 84, 96], C.ambient), WINDOW, lw)) : css(lit([70, 84, 96], C.ambient));
      g.fillRect(x - hs * 0.6, y - hs * 0.75, hs * 0.42, hs * 0.38);
      g.fillRect(x + hs * 0.18, y - hs * 0.75, hs * 0.42, hs * 0.38);
    });

    // The ferry office: the red-painted shed at the landward end, as at every small ferry quay.
    const ox = qx * 0.02, ow = Math.min(qx * 0.3, h * 0.2), oh = ow * 0.62;
    g.fillStyle = css(lit(OFFICE, C.ambient));
    g.fillRect(ox, qTop - oh, ow, oh + (qFront - qTop) * 0.4);
    g.fillStyle = css(lit([26, 84, 96], C.ambient));
    g.beginPath(); g.moveTo(ox - ow * 0.08, qTop - oh); g.lineTo(ox + ow * 0.5, qTop - oh - ow * 0.32); g.lineTo(ox + ow * 1.08, qTop - oh); g.closePath(); g.fill();
    g.fillStyle = css(lit(CREAM, C.ambient));
    g.fillRect(ox + ow * 0.12, qTop - oh * 0.72, ow * 0.3, oh * 0.36);
    const win = st.windows[7];
    if (win > 0.02) { g.fillStyle = css(WINDOW, win); g.fillRect(ox + ow * 0.14, qTop - oh * 0.69, ow * 0.26, oh * 0.3); }
    g.fillStyle = css(lit([24, 92, 102], C.ambient));
    g.fillRect(ox + ow * 0.56, qTop - oh * 0.8, ow * 0.24, oh * 0.8 + (qFront - qTop) * 0.4);
    // Flag on the office.
    const fx = ox + ow * 0.92, fy = qTop - oh - ow * 0.55;
    g.strokeStyle = css(lit([220, 214, 200], C.ambient)); g.lineWidth = Math.max(1, h * 0.003);
    g.beginPath(); g.moveTo(fx, qTop - oh - ow * 0.05); g.lineTo(fx, fy); g.stroke();
    const flap = this.reduced ? 0 : Math.sin(st.moment.minute * 60 * 1.7) * 0.15;
    g.fillStyle = css(lit([20, 90, 104], C.ambient));
    g.beginPath(); g.moveTo(fx, fy); g.quadraticCurveTo(fx + ow * 0.12, fy + ow * (0.04 + flap * 0.1), fx + ow * 0.24, fy + ow * 0.03); g.lineTo(fx + ow * 0.24, fy + ow * 0.13); g.quadraticCurveTo(fx + ow * 0.12, fy + ow * (0.13 - flap * 0.1), fx, fy + ow * 0.12); g.closePath(); g.fill();

    // Top of the quay: granite setts.
    const top = g.createLinearGradient(0, qTop, 0, qFront);
    top.addColorStop(0, css(mix(C.stone, C.stoneShade, 0.25))); top.addColorStop(1, css(C.stone));
    g.fillStyle = top;
    g.beginPath(); g.moveTo(0, qTop); g.lineTo(qx - h * 0.02, qTop); g.lineTo(qx, qFront); g.lineTo(0, qFront); g.closePath(); g.fill();
    g.strokeStyle = css(C.stoneShade, 0.35); g.lineWidth = 1;
    for (let k = 1; k < 3; k++) { const y = qTop + ((qFront - qTop) * k) / 3; g.beginPath(); g.moveTo(0, y); g.lineTo(qx - h * 0.02 * (1 - k / 3), y); g.stroke(); }
    // The wall: big blocks running down into the water.
    const wallTop = qFront, wallBot = h;
    g.fillStyle = css(C.stoneShade);
    g.fillRect(0, wallTop, qx, wallBot - wallTop);
    // Block joints.
    g.strokeStyle = css(mix(C.stoneShade, [0, 0, 0], 0.25), 0.55);
    const bh = h * 0.045;
    for (let y = wallTop + bh, row = 0; y < wallBot; y += bh, row++) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(qx, y); g.stroke();
      for (let x = (row % 2) * bh * 1.2; x < qx; x += bh * 2.4) { g.beginPath(); g.moveTo(x, y - bh); g.lineTo(x, y); g.stroke(); }
    }
    // Lit edge along the top of the wall.
    g.fillStyle = css(mix(C.stone, CREAM, 0.25));
    g.fillRect(0, wallTop, qx, Math.max(1.5, h * 0.004));
    // Weed line: the band the tide covers and bares twice a day.
    const weedY0 = L.waterAt(3.0), weedY1 = L.waterAt(1.2);
    g.fillStyle = css(lit([54, 74, 52], C.ambient), 0.8);
    g.fillRect(0, weedY0, qx, weedY1 - weedY0);
    g.fillStyle = css(lit([38, 54, 40], C.ambient), 0.85);
    g.fillRect(0, weedY1, qx, h - weedY1);
    // Steps down the wall, from the quay to below low water.
    const sx0 = qx * 0.34, steps = 9, sw = qx * 0.05, sh = (L.waterAt(0) - wallTop) / steps;
    for (let i = 0; i < steps; i++) {
      const x = sx0 + i * sw, y = wallTop + i * sh;
      g.fillStyle = css(mix(C.stone, C.stoneShade, 0.15));
      g.fillRect(x, y, sw * 1.05, sh * 0.42);
      g.fillStyle = css(mix(C.stoneShade, [0, 0, 0], 0.18));
      g.fillRect(x, y + sh * 0.42, sw * 1.05, sh * 0.58);
    }
    // Iron ladder near the end, rungs down into the sea.
    const lx = qx * 0.885, lw = qx * 0.04;
    g.strokeStyle = css(lit([40, 48, 56], C.ambient)); g.lineWidth = Math.max(1.2, h * 0.004);
    g.beginPath(); g.moveTo(lx, wallTop - h * 0.02); g.lineTo(lx, h); g.moveTo(lx + lw, wallTop - h * 0.02); g.lineTo(lx + lw, h); g.stroke();
    for (let y = wallTop + h * 0.012; y < h; y += h * 0.02) { g.beginPath(); g.moveTo(lx, y); g.lineTo(lx + lw, y); g.stroke(); }

    // Water against the wall: the tide.
    const water = g.createLinearGradient(0, tideY, 0, h);
    water.addColorStop(0, css(mix(C.seaNear, C.sea, 0.4)));
    water.addColorStop(1, css(C.seaNear));
    g.fillStyle = water;
    g.fillRect(0, tideY, qx + 2, h - tideY);
    g.fillStyle = css(mix(C.sea, CREAM, 0.4), 0.55);
    g.fillRect(0, tideY, qx, Math.max(1, h * 0.003));
    // Reflection of the lit wall top and lamps in the water.
    this.lampReflections(g, st, L, tideY);

    // A small boat on a running line, riding the tide.
    this.dinghy(g, st, L, qx * 0.62, tideY);

    // Bollards and lamp posts on the quay.
    const bol = lit([34, 44, 52], C.ambient);
    for (const fx of [0.66, 0.965]) {
      const x = qx * fx, br = h * 0.016;
      g.fillStyle = css(bol);
      g.beginPath(); g.roundRect(x - br * 0.75, qFront - br * 2.2, br * 1.5, br * 2.2, br * 0.3); g.fill();
      g.beginPath(); g.ellipse(x, qFront - br * 2.2, br, br * 0.38, 0, 0, Math.PI * 2); g.fill();
    }
    lampPosts(L).forEach(([x, y, ph], i) => {
      g.fillStyle = css(lit([28, 40, 48], C.ambient));
      g.fillRect(x - h * 0.0035, y, h * 0.007, ph);
      g.beginPath(); g.ellipse(x, y + ph, h * 0.009, h * 0.004, 0, 0, Math.PI * 2); g.fill();
      // The lamp head.
      const on = st.lamps[i];
      g.beginPath(); g.moveTo(x - h * 0.016, y); g.lineTo(x, y - h * 0.014); g.lineTo(x + h * 0.016, y); g.closePath(); g.fill();
      g.fillStyle = css(mix(lit([200, 196, 180], C.ambient), LAMP, on));
      g.beginPath(); g.arc(x, y + h * 0.008, h * 0.0085, 0, Math.PI * 2); g.fill();
    });
  }

  private lampReflections(g: Ctx, st: SceneState, L: Layout, tideY: number): void {
    const R = rng(91);
    lampPosts(L).forEach(([x], i) => {
      const on = st.lamps[i];
      if (on < 0.02) return;
      for (let k = 0; k < 9; k++) {
        const y = tideY + 3 + k * (L.h - tideY) / 9;
        const len = L.h * (0.012 + R() * 0.03);
        g.fillStyle = css(LAMP, on * (0.6 - k * 0.05));
        g.fillRect(x - len / 2 + (R() - 0.5) * L.h * 0.012, y, len, Math.max(1, L.h * 0.006));
      }
    });
  }

  private lampGlow(g: Ctx, st: SceneState, L: Layout): void {
    g.save();
    g.globalCompositeOperation = 'lighter';
    lampPosts(L).forEach(([x, y], i) => {
      const on = st.lamps[i];
      if (on < 0.02) return;
      const r = L.h * 0.07;
      const gl = g.createRadialGradient(x, y + L.h * 0.008, 0, x, y + L.h * 0.008, r);
      gl.addColorStop(0, `rgba(255,170,90,${0.55 * on})`); gl.addColorStop(1, 'rgba(255,170,90,0)');
      g.fillStyle = gl; g.beginPath(); g.arc(x, y + L.h * 0.008, r, 0, Math.PI * 2); g.fill();
    });
    g.restore();
  }

  private dinghy(g: Ctx, st: SceneState, L: Layout, x: number, y: number): void {
    const C = st.colors, s = L.h * 0.05;
    const bob = this.reduced ? 0 : Math.sin(st.moment.minute * 60 * 0.9) * s * 0.03;
    y += bob;
    g.strokeStyle = css(lit([200, 180, 140], C.ambient), 0.8); g.lineWidth = 1;
    g.beginPath(); g.moveTo(x - s * 0.8, y - s * 0.25); g.quadraticCurveTo(x - s * 1.4, y - s * 0.1, x - s * 1.9, L.qFront + s * 0.2); g.stroke();
    g.fillStyle = css(lit([236, 230, 216], C.ambient));
    g.beginPath(); g.moveTo(x - s * 0.95, y - s * 0.32); g.lineTo(x + s * 0.95, y - s * 0.32); g.quadraticCurveTo(x + s * 0.8, y + s * 0.02, x + s * 0.55, y + s * 0.04); g.lineTo(x - s * 0.7, y + s * 0.04); g.closePath(); g.fill();
    g.fillStyle = css(lit([30, 96, 108], C.ambient));
    g.fillRect(x - s * 0.88, y - s * 0.34, s * 1.76, s * 0.07);
    g.fillStyle = css(mix(C.seaNear, [0, 0, 0], 0.2), 0.35);
    g.fillRect(x - s * 0.7, y + s * 0.05, s * 1.3, s * 0.06);
  }

  // ------------------------------------------------------------------ the Kittiwake

  private ferry(g: Ctx, st: SceneState, L: Layout, tideY: number, seconds: number): void {
    const f = st.ferry;
    const pl = ferryPlace(L, f.p, tideY + L.h * 0.006);
    const len = L.ferryLen * pl.s;
    const x = pl.x, y = pl.y;
    const C = st.colors;
    const amb = C.ambient;
    const u = len / 100; // drawing unit: the ferry is 100 units long
    const night = st.night;
    void seconds;
    // Wake and bow wave first, on the water behind and beside her.
    if (f.mode === 'crossing' && f.speed > 0.02) {
      const back = -f.dir;
      const foam = mix(C.sea, CREAM, 0.7);
      for (let k = 0; k < 12; k++) {
        const d = k / 12;
        const wx = x + back * (len * 0.5 + d * len * 1.6 * f.speed);
        const spread = u * (2 + d * 14);
        g.fillStyle = css(foam, (0.5 - d * 0.4) * f.speed);
        g.fillRect(wx - u * 4, y - u * 0.6 + spread * 0.2, u * 7, Math.max(1, u * 0.7));
        g.fillRect(wx - u * 4, y + u * 0.6 + spread * 0.35, u * 6, Math.max(1, u * 0.6));
      }
      g.fillStyle = css(foam, 0.7 * f.speed);
      g.beginPath(); g.ellipse(x + f.dir * len * 0.5, y + u * 0.4, u * 4, u * 0.9, 0, 0, Math.PI * 2); g.fill();
    }
    // Reflection.
    g.fillStyle = css(mix(C.seaNear, lit(HULL, amb), 0.5), 0.45);
    g.fillRect(x - len * 0.46, y + u * 0.6, len * 0.92, u * 5);
    g.fillStyle = css(mix(C.sea, lit(CREAM, amb), 0.35), 0.25);
    g.fillRect(x - len * 0.32, y + u * 5.6, len * 0.64, u * 3.5);
    // Hull: double-ended, dark below, a red boot top, white above.
    const hullTop = y - u * 9, deck = y - u * 13;
    g.fillStyle = css(lit(HULL, amb));
    g.beginPath(); g.moveTo(x - len * 0.5, hullTop); g.lineTo(x + len * 0.5, hullTop); g.lineTo(x + len * 0.46, y); g.lineTo(x - len * 0.46, y); g.closePath(); g.fill();
    g.fillStyle = css(lit(BOOT, amb));
    g.fillRect(x - len * 0.465, y - u * 1.8, len * 0.93, u * 1.4);
    g.fillStyle = css(lit(CREAM, amb));
    g.fillRect(x - len * 0.5, deck, len, hullTop - deck);
    // Car deck rails and a couple of cars.
    g.strokeStyle = css(lit(CREAM, amb)); g.lineWidth = Math.max(0.6, u * 0.5);
    g.beginPath(); g.moveTo(x - len * 0.48, deck - u * 3); g.lineTo(x + len * 0.48, deck - u * 3); g.stroke();
    for (let k = 0; k <= 12; k++) { const rx = x - len * 0.48 + (len * 0.96 * k) / 12; g.beginPath(); g.moveTo(rx, deck); g.lineTo(rx, deck - u * 3); g.stroke(); }
    if (f.mode !== 'moored') {
      const cars: RGB[] = [[180, 70, 56], [210, 200, 170], [70, 110, 130]];
      cars.forEach((c, k) => {
        const cx = x - len * 0.4 + k * len * 0.13;
        g.fillStyle = css(lit(c, amb));
        g.beginPath(); g.roundRect(cx, deck - u * 3.2, u * 10, u * 3.2, u * 1.2); g.fill();
      });
    }
    // Bridge deck, wheelhouse and funnel, on the middle.
    g.fillStyle = css(lit(CREAM, amb));
    g.fillRect(x + len * 0.02, deck - u * 9, len * 0.36, u * 9);
    g.fillRect(x + len * 0.09, deck - u * 15, len * 0.2, u * 6.5);
    // Windows: dark by day, lamp-lit at night.
    const winCol = mix(lit([52, 70, 82], amb), WINDOW, night * 0.95);
    g.fillStyle = css(winCol);
    for (let k = 0; k < 6; k++) g.fillRect(x + len * 0.05 + k * len * 0.052, deck - u * 6.6, len * 0.034, u * 2.6);
    for (let k = 0; k < 3; k++) g.fillRect(x + len * 0.11 + k * len * 0.06, deck - u * 13.6, len * 0.042, u * 2.6);
    g.fillStyle = css(lit(FUNNEL, amb));
    g.beginPath(); g.moveTo(x + len * 0.3, deck - u * 9); g.lineTo(x + len * 0.31, deck - u * 18); g.lineTo(x + len * 0.37, deck - u * 18); g.lineTo(x + len * 0.375, deck - u * 9); g.closePath(); g.fill();
    g.fillStyle = css(lit([30, 40, 48], amb));
    g.fillRect(x + len * 0.31, deck - u * 18.5, len * 0.06, u * 1.5);
    // Mast.
    g.strokeStyle = css(lit(CREAM, amb)); g.lineWidth = Math.max(0.8, u * 0.6);
    g.beginPath(); g.moveTo(x + len * 0.19, deck - u * 15); g.lineTo(x + len * 0.19, deck - u * 24); g.moveTo(x + len * 0.16, deck - u * 21); g.lineTo(x + len * 0.22, deck - u * 21); g.stroke();
    // Ramps at both ends; the one towards the quay comes down while loading.
    const rampLen = u * 11;
    const quayEnd = f.at === 'T' ? 1 : -1;
    for (const end of [-1, 1]) {
      const ex = x + end * len * 0.5;
      const down = f.at && end === quayEnd ? f.ramp : 0;
      const ang = (1 - down) * (Math.PI / 2) * 0.92;
      g.save();
      g.translate(ex, deck);
      g.rotate(end === -1 ? ang : -ang);
      g.fillStyle = css(lit([150, 156, 160], amb));
      g.fillRect(end === -1 ? -rampLen : 0, -u * 0.8, rampLen, u * 1.6);
      g.restore();
    }
    // Navigation lights at night: masthead white, red and green at the ends, warm deck lights.
    if (night > 0.02) {
      const dot = (lx: number, ly: number, col: string, r: number) => {
        const gl = g.createRadialGradient(lx, ly, 0, lx, ly, r * 4);
        gl.addColorStop(0, col.replace('A', String(0.9 * night))); gl.addColorStop(1, col.replace('A', '0'));
        g.fillStyle = gl; g.beginPath(); g.arc(lx, ly, r * 4, 0, Math.PI * 2); g.fill();
      };
      const r = Math.max(1.2, u * 0.8);
      dot(x + len * 0.19, deck - u * 24, 'rgba(255,250,230,A)', r);
      dot(x - len * 0.48, deck - u * 3.5, 'rgba(255,70,60,A)', r);
      dot(x + len * 0.48, deck - u * 3.5, 'rgba(80,230,140,A)', r);
      g.fillStyle = css(WINDOW, 0.35 * night);
      g.fillRect(x - len * 0.48, deck - u * 0.6, len * 0.96, u * 0.6);
    }
  }

  // ------------------------------------------------------------------ small life

  private gulls(g: Ctx, st: SceneState, L: Layout, seconds: number): void {
    if (st.day < 0.05) return;
    const { w, h } = L;
    g.save();
    g.globalAlpha = st.day;
    g.strokeStyle = css(lit([246, 242, 232], st.colors.ambient));
    g.lineWidth = Math.max(1.2, h * 0.0035);
    g.lineCap = 'round';
    const t = this.reduced ? 0 : seconds;
    for (let i = 0; i < 3; i++) {
      const x = ((t * (4 + i * 1.3) + i * w * 0.37) % (w * 1.3)) - w * 0.15;
      const y = L.hz * (0.25 + i * 0.13) + Math.sin(t * 0.4 + i * 2) * h * 0.01;
      const s = h * (0.014 - i * 0.002);
      const flap = Math.sin(t * 2.2 + i) * 0.35;
      g.beginPath(); g.moveTo(x - s, y - s * (0.2 + flap)); g.quadraticCurveTo(x - s * 0.5, y - s * 0.7, x, y); g.quadraticCurveTo(x + s * 0.5, y - s * 0.7, x + s, y - s * (0.2 + flap)); g.stroke();
    }
    // Two gulls perched on the bollards.
    const bx = L.qx * 0.66, by = L.qFront - h * 0.016 * 2.6;
    this.perched(g, bx, by, h * 0.02, st);
    g.restore();
  }

  private perched(g: Ctx, x: number, y: number, s: number, st: SceneState): void {
    const amb = st.colors.ambient;
    g.fillStyle = css(lit([244, 242, 236], amb));
    g.beginPath(); g.ellipse(x, y, s * 0.7, s * 0.42, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x + s * 0.55, y - s * 0.42, s * 0.28, 0, Math.PI * 2); g.fill();
    g.fillStyle = css(lit([150, 160, 170], amb));
    g.beginPath(); g.ellipse(x - s * 0.15, y - s * 0.08, s * 0.5, s * 0.22, -0.15, 0, Math.PI * 2); g.fill();
    g.fillStyle = css(lit([240, 190, 60], amb));
    g.beginPath(); g.moveTo(x + s * 0.8, y - s * 0.45); g.lineTo(x + s * 1.08, y - s * 0.4); g.lineTo(x + s * 0.8, y - s * 0.35); g.closePath(); g.fill();
  }

  /** A faint paper grain over everything, as the poster has. */
  private paper(g: Ctx, w: number, h: number): void {
    if (!this.grain) {
      const c = document.createElement('canvas');
      c.width = c.height = 160;
      const x = c.getContext('2d')!;
      const img = x.createImageData(160, 160);
      const R = rng(3);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 128 + (R() - 0.5) * 90;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      this.grain = c;
    }
    g.save();
    g.globalAlpha = 0.07;
    g.globalCompositeOperation = 'overlay';
    g.fillStyle = g.createPattern(this.grain, 'repeat')!;
    g.fillRect(0, 0, w, h);
    g.restore();
  }
}

/** Quay lamp posts: x, top of the lamp, post height. */
export function lampPosts(L: Layout): [number, number, number][] {
  const ph = L.h * 0.13;
  return [0.36, 0.56, 0.78].map((f) => [L.qx * f, L.qFront - ph, ph] as [number, number, number]);
}
