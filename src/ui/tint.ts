// The page takes its tint from the hour: the panel under the picture darkens towards night, and the paper below
// turns to night with its text flipped to light, so every word keeps its contrast. Pure, so it can be tested.

export type RGB = [number, number, number];

export interface Tint {
  /** Panel under the picture (time, sentence, strip, timetable). Its text is always CREAM. */
  hero: RGB;
  /** Paper of the page below, and its two text colors. */
  page: RGB;
  ink: RGB;
  inkSoft: RGB;
  night: boolean;
}

export const CREAM: RGB = [242, 239, 230];
/** Alpha of a past sailing's time on the panel. */
export const GONE_ALPHA = 0.62;

const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;

export function tintFor(night: number): Tint {
  const n = Math.max(0, Math.min(1, night));
  const hero = mix([15, 90, 102], [9, 26, 38], n);
  if (n > 0.5) {
    return { hero, page: mix([20, 44, 56], [11, 27, 38], (n - 0.5) * 2), ink: CREAM, inkSoft: [190, 204, 203], night: true };
  }
  return { hero, page: mix([242, 239, 230], [230, 232, 226], n * 2), ink: [18, 39, 44], inkSoft: [52, 72, 78], night: false };
}

export const rgb = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;

/** WCAG relative luminance and contrast ratio. */
export function luminance(c: RGB): number {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** A color drawn at some alpha over a background. */
export function over(fg: RGB, alpha: number, bg: RGB): RGB {
  return mix(bg, fg, alpha);
}
