import { describe, expect, it } from 'vitest';
import { sceneAt } from '../src/model/scene.ts';
import { CREAM, GONE_ALPHA, contrast, over, tintFor } from '../src/ui/tint.ts';

// Moments where the page is at its lightest, its darkest and in between: noon, sunset and 03:00, summer and winter,
// and a walk through every 10 minutes of both days.
const moments = [
  { y: 2026, mo: 6, d: 21, minute: 13 * 60 + 20 }, { y: 2026, mo: 6, d: 21, minute: 22 * 60 + 34 }, { y: 2026, mo: 6, d: 21, minute: 180 },
  { y: 2026, mo: 12, d: 21, minute: 12 * 60 + 23 }, { y: 2026, mo: 12, d: 21, minute: 15 * 60 + 35 }, { y: 2026, mo: 12, d: 21, minute: 180 },
];
for (const day of [21]) for (const mo of [6, 12]) for (let m = 0; m < 1440; m += 10) moments.push({ y: 2026, mo, d: day, minute: m });

describe('contrast of the words at every hour', () => {
  it('the time and the sentence are cream on the panel, at least 4.5 to 1', () => {
    for (const m of moments) {
      const t = tintFor(sceneAt(m).night);
      expect(contrast(CREAM, t.hero)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('past sailings stay readable on the panel, at least 3 to 1', () => {
    for (const m of moments) {
      const t = tintFor(sceneAt(m).night);
      expect(contrast(over(CREAM, GONE_ALPHA, t.hero), t.hero)).toBeGreaterThanOrEqual(3);
    }
  });

  it('headings, fare rows, prices and body text on the page below, at least 4.5 to 1', () => {
    for (const m of moments) {
      const t = tintFor(sceneAt(m).night);
      expect(contrast(t.ink, t.page)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.inkSoft, t.page)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the page below is night at 03:00 in winter and day at noon', () => {
    expect(tintFor(sceneAt(moments[5]).night).night).toBe(true);
    expect(tintFor(sceneAt(moments[0]).night).night).toBe(false);
  });
});
