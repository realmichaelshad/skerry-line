// One pure function from a moment to the whole state of the picture: sun, moon, every color, the tide, the lamps,
// the lighthouse and the ferry. The renderer draws only this. Nothing here reads a clock.

import { PLACE, moonPosition, sunPosition, type MoonPos, type SunPos } from './sun.ts';
import { nextTurn, tideHeight, tideRate, type TideTurn } from './tide.ts';
import { ferryAt, hhmm, type Ferry } from './schedule.ts';

export interface Moment {
  /** The harbor's calendar date. */
  y: number; mo: number; d: number;
  /** Minutes after midnight on the harbor clock, fractional for seconds. */
  minute: number;
}

export type RGB = [number, number, number];

export const PALETTE_KEYS = [
  'skyTop', 'skyMid', 'skyLow', 'glow', 'sea', 'seaNear', 'landFar', 'landNear', 'rock', 'rockShade',
  'stone', 'stoneShade', 'cloud', 'ambient',
] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];
export type Palette = Record<PaletteKey, RGB>;

/** Colors at a set of sun elevations (degrees). Everything in between is blended, never switched. */
const STOPS: [number, number[][]][] = [
  [-20, [[10, 20, 38], [16, 32, 56], [24, 48, 74], [24, 48, 74], [16, 40, 62], [10, 28, 46], [18, 34, 52], [14, 30, 46], [30, 46, 62], [18, 30, 44], [54, 64, 76], [32, 40, 52], [30, 44, 66], [70, 86, 120]]],
  [-10, [[14, 34, 66], [30, 62, 104], [58, 92, 138], [70, 92, 140], [26, 62, 94], [16, 44, 70], [30, 52, 80], [24, 46, 70], [48, 68, 88], [28, 44, 62], [78, 88, 104], [46, 56, 72], [50, 70, 104], [100, 120, 160]]],
  [-4, [[22, 58, 100], [58, 98, 140], [150, 140, 160], [226, 128, 98], [40, 92, 120], [26, 66, 92], [44, 64, 92], [36, 58, 80], [70, 86, 100], [40, 56, 72], [110, 112, 118], [66, 72, 84], [120, 100, 130], [150, 150, 180]]],
  [0, [[34, 84, 120], [80, 130, 158], [236, 150, 104], [240, 120, 80], [46, 110, 130], [30, 84, 104], [70, 82, 108], [64, 80, 96], [120, 110, 104], [70, 72, 80], [168, 150, 130], [100, 94, 94], [236, 130, 104], [230, 180, 150]]],
  [5, [[74, 140, 170], [140, 180, 190], [246, 200, 140], [250, 180, 110], [60, 138, 152], [40, 110, 128], [130, 150, 160], [150, 140, 120], [178, 154, 124], [122, 108, 100], [214, 190, 154], [140, 124, 112], [250, 214, 170], [255, 224, 186]]],
  [14, [[96, 166, 196], [150, 198, 214], [236, 226, 200], [240, 226, 190], [62, 150, 166], [44, 124, 142], [160, 182, 190], [170, 170, 150], [176, 168, 152], [124, 118, 114], [214, 204, 184], [150, 144, 136], [248, 238, 214], [255, 246, 230]]],
  [40, [[84, 160, 200], [140, 196, 218], [222, 232, 226], [230, 236, 226], [58, 152, 172], [40, 126, 148], [168, 190, 198], [176, 178, 160], [180, 172, 156], [126, 120, 116], [218, 210, 192], [154, 150, 142], [250, 246, 232], [255, 252, 244]]],
];

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function mixRGB(a: number[], b: number[], t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** The palette for a sun elevation, plus a little moonlight at night. */
export function paletteAt(elev: number, moonLight = 0): Palette {
  let i = 0;
  while (i < STOPS.length - 2 && elev > STOPS[i + 1][0]) i++;
  const [e0, c0] = STOPS[i], [e1, c1] = STOPS[i + 1];
  const t = Math.max(0, Math.min(1, (elev - e0) / (e1 - e0)));
  const out = {} as Palette;
  PALETTE_KEYS.forEach((k, j) => {
    let c = mixRGB(c0[j], c1[j], t);
    // A bright moon lifts the night towards the deep blue hour.
    if (moonLight > 0) c = mixRGB(c, mixRGB(STOPS[0][1][j], STOPS[1][1][j], 0.75), moonLight * smoothstep(-4, -12, elev));
    out[k] = c;
  });
  return out;
}

export interface SceneState {
  moment: Moment;
  utcMs: number;
  sun: SunPos;
  moon: MoonPos;
  colors: Palette;
  /** 0 by day, 1 at full night: for the page tint and anything that only shows in the dark. */
  night: number;
  stars: number;
  /** Strength of the path of light on the sea and where it comes from. */
  light: { strength: number; az: number; color: RGB; fromMoon: boolean };
  /** Quay lamps (3), Harrowick windows (8), Tern Holm windows (4): 0..1 each. */
  lamps: number[];
  windows: number[];
  islandWindows: number[];
  lighthouse: { on: number; beam: number };
  tide: { height: number; rising: boolean; next: TideTurn; nextMinute: number };
  ferry: Ferry;
  /** Daylight things: gulls about. */
  day: number;
}

/** Offset of the harbor's clock from UTC, in minutes, for a date (the offset at noon, so a day never splits). */
const offsetCache = new Map<string, number>();
export function harborOffset(y: number, mo: number, d: number): number {
  const key = `${y}-${mo}-${d}`;
  const hit = offsetCache.get(key);
  if (hit !== undefined) return hit;
  const noon = Date.UTC(y, mo - 1, d, 12);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: PLACE.timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(noon));
  const hh = Number(parts.find((p) => p.type === 'hour')!.value), mm = Number(parts.find((p) => p.type === 'minute')!.value);
  const off = hh * 60 + mm - 12 * 60;
  offsetCache.set(key, off);
  return off;
}

export function utcOf(m: Moment): number {
  return Date.UTC(m.y, m.mo - 1, m.d) + (m.minute - harborOffset(m.y, m.mo, m.d)) * 60000;
}

/** Small fixed per-lamp offsets so lamps do not all come on together. */
const jitter = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export interface StateOptions {
  /**
   * For a loop that runs through one pinned day (attract mode): the tide and the moon are blended over the first
   * two hours after midnight towards their values a day later, so 24:00 meets 00:00 with no jump.
   */
  periodic?: boolean;
  /** Seconds for things that turn on their own (the lighthouse beam); defaults to the moment's own seconds. */
  seconds?: number;
}

export function sceneAt(m: Moment, opts: StateOptions = {}): SceneState {
  const utcMs = utcOf(m);
  const sun = sunPosition(utcMs);
  let moon = moonPosition(utcMs);
  let height = tideHeight(utcMs);
  let rate = tideRate(utcMs);
  if (opts.periodic && m.minute < 120) {
    const w = smoothstep(0, 120, m.minute);
    const later = utcMs + 86400000;
    height = w * height + (1 - w) * tideHeight(later);
    rate = w * rate + (1 - w) * tideRate(later);
    const m2 = moonPosition(later);
    moon = { ...moon, elev: w * moon.elev + (1 - w) * m2.elev, az: w * moon.az + (1 - w) * m2.az };
  }
  const elev = sun.elev;
  const moonLight = moon.illum * smoothstep(0, 12, moon.elev);
  const colors = paletteAt(elev, moonLight);
  const night = smoothstep(3, -7, elev);
  // Path of light: the low sun makes the strongest one; at night the moon takes over.
  const sunPath = smoothstep(-2.5, 4, elev) * (0.55 + 0.45 * smoothstep(30, 4, elev));
  const moonPath = moonLight * smoothstep(-3, -11, elev) * 0.8;
  const fromMoon = moonPath > sunPath;
  const light = fromMoon
    ? { strength: moonPath, az: moon.az, color: [236, 238, 226] as RGB, fromMoon }
    : { strength: sunPath, az: sun.az, color: mixRGB([255, 196, 120], [255, 246, 220], smoothstep(4, 25, elev)), fromMoon };
  const lamps = [0, 1, 2].map((i) => smoothstep(4 - jitter(i, 1) * 2.5, -3 - jitter(i, 1) * 2.5, elev));
  const awake = (i: number, salt: number) => {
    const bed = 22 * 60 + jitter(i, salt) * 45, wake = 6 * 60 + jitter(i, salt + 9) * 60;
    return smoothstep(wake - 45, wake, m.minute) * smoothstep(bed + 45, bed, m.minute);
  };
  const dark = (i: number, salt: number) => smoothstep(5 - jitter(i, salt) * 4, -3 - jitter(i, salt) * 4, elev);
  const windows = Array.from({ length: 8 }, (_, i) => dark(i, 3) * awake(i, 4));
  const islandWindows = Array.from({ length: 4 }, (_, i) => dark(i, 5) * awake(i, 6));
  const seconds = opts.seconds ?? m.minute * 60;
  const next = nextTurn(utcMs);
  const nextMinute = m.minute + (next.utcMs - utcMs) / 60000;
  return {
    moment: m, utcMs, sun, moon, colors, night, stars: smoothstep(-5, -13, elev) * (1 - 0.6 * moonLight),
    light, lamps, windows, islandWindows,
    lighthouse: { on: smoothstep(2, -5, elev), beam: ((seconds / 15) % 1) * Math.PI * 2 },
    tide: { height, rising: rate > 0, next, nextMinute },
    ferry: ferryAt(m.minute),
    day: smoothstep(-2, 6, elev),
  };
}

/** Sunrise and sunset (sun's upper edge on the horizon, with refraction) for a date, in harbor minutes. */
export function sunTimes(y: number, mo: number, d: number): { rise: number | null; set: number | null } {
  const at = (minute: number) => sunPosition(utcOf({ y, mo, d, minute })).elev + 0.833;
  const find = (a: number, b: number) => {
    let fa = at(a);
    for (let k = 0; k < 40; k++) {
      const mid = (a + b) / 2, fm = at(mid);
      if (Math.sign(fm) === Math.sign(fa)) { a = mid; fa = fm; } else b = mid;
    }
    return (a + b) / 2;
  };
  let rise: number | null = null, set: number | null = null;
  for (let t = 0; t < 1440; t += 10) {
    const a = at(t), b = at(t + 10);
    if (a < 0 && b >= 0 && rise === null) rise = find(t, t + 10);
    if (a >= 0 && b < 0 && set === null) set = find(t, t + 10);
  }
  return { rise, set };
}

export const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export { hhmm };
