// An invented tide with two harmonic parts, as real tables are built from: the principal lunar semidiurnal part (M2,
// following the moon round the sky) and the principal solar part (S2, following the sun). When the two line up, at
// new and full moon, the range is large (springs); a week later they work against each other (neaps).

import { NEW_MOON_JD } from './sun.ts';

/** Amplitudes in metres. */
export const M2 = 1.2;
export const S2 = 0.42;
/** Height of mean sea level above chart datum, so heights shown are never negative. */
export const DATUM = 1.75;
/** Phase lag (degrees) of high water after the moon's passage. */
const LAG = 70;
const M2_SPEED = 28.9841042; // degrees per hour
const S2_SPEED = 30;
const EPOCH_MS = (NEW_MOON_JD - 2440587.5) * 86400000;

/** Tide height above chart datum (metres) at a UTC instant. */
export function tideHeight(utcMs: number): number {
  const h = (utcMs - EPOCH_MS) / 3600000;
  // At the epoch the moon and sun are together, so both parts start in step: springs at new moon.
  return DATUM + M2 * Math.cos(((M2_SPEED * h - LAG) * Math.PI) / 180) + S2 * Math.cos(((S2_SPEED * h - LAG) * Math.PI) / 180);
}

/** Rate of change in metres per hour (analytic derivative). */
export function tideRate(utcMs: number): number {
  const h = (utcMs - EPOCH_MS) / 3600000;
  const k = Math.PI / 180;
  return -M2 * M2_SPEED * k * Math.sin((M2_SPEED * h - LAG) * k) - S2 * S2_SPEED * k * Math.sin((S2_SPEED * h - LAG) * k);
}

export interface TideTurn { utcMs: number; height: number; high: boolean; }

/**
 * The next high or low water after `utcMs`, found numerically: step forward until the height stops rising (or
 * falling), then bisect on the sign of the slope. Does not use the derivative formula, so it checks the model.
 */
export function nextTurn(utcMs: number): TideTurn {
  const step = 5 * 60000;
  const slope = (t: number) => tideHeight(t + 30000) - tideHeight(t - 30000);
  const s0 = Math.sign(slope(utcMs)) || 1;
  let t = utcMs;
  for (let i = 0; i < 400; i++) {
    const t2 = t + step;
    if (Math.sign(slope(t2)) !== s0) {
      let a = t, b = t2;
      for (let k = 0; k < 30; k++) {
        const mid = (a + b) / 2;
        if (Math.sign(slope(mid)) === s0) a = mid; else b = mid;
      }
      const tm = (a + b) / 2;
      return { utcMs: tm, height: tideHeight(tm), high: s0 > 0 };
    }
    t = t2;
  }
  return { utcMs: t, height: tideHeight(t), high: s0 > 0 };
}
