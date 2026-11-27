import { describe, expect, it } from 'vitest';
import { PALETTE_KEYS, sceneAt, sunTimes, utcOf, harborOffset } from '../src/model/scene.ts';
import { CRUISE, CROSSING, FIRST, LAST, SAILINGS, crossingProfile, ferryAt, fare, hhmm, minutesUntil, nextSailing } from '../src/model/schedule.ts';
import { M2, S2, nextTurn, tideHeight, tideRate } from '../src/model/tide.ts';
import { ferrySentence, tideLine } from '../src/model/words.ts';

describe('the sun at Harrowick (Stornoway, 58°13′N 6°23′W)', () => {
  // Published values: timeanddate.com monthly sun tables for Stornoway, 2026, local clock (GMT or BST).
  const almanac: [number, number, string, string][] = [
    [3, 20, '06:27', '18:39'],
    [5, 10, '05:10', '21:34'],
    [6, 21, '04:19', '22:34'],
    [9, 23, '07:12', '19:22'],
    [12, 21, '09:11', '15:35'],
  ];
  const min = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  for (const [mo, d, rise, set] of almanac) {
    it(`rises and sets within two minutes of the almanac on 2026-${mo}-${d}`, () => {
      const t = sunTimes(2026, mo, d);
      expect(Math.abs(t.rise! - min(rise))).toBeLessThan(2);
      expect(Math.abs(t.set! - min(set))).toBeLessThan(2);
    });
  }

  it('uses the harbor clock: summer time in summer, GMT in winter', () => {
    expect(harborOffset(2026, 6, 21)).toBe(60);
    expect(harborOffset(2026, 12, 21)).toBe(0);
    expect(utcOf({ y: 2026, mo: 6, d: 21, minute: 60 })).toBe(Date.UTC(2026, 5, 21, 0, 0));
  });

  it('is low and short in winter and high and long in summer', () => {
    const noon = (mo: number, d: number) => Math.max(...Array.from({ length: 1440 }, (_, m) => sceneAt({ y: 2026, mo, d, minute: m }).sun.elev));
    expect(noon(12, 21)).toBeGreaterThan(7);
    expect(noon(12, 21)).toBeLessThan(10);
    expect(noon(6, 21)).toBeGreaterThan(54);
    expect(noon(6, 21)).toBeLessThan(56);
  });
});

describe('the timetable', () => {
  it('runs from Harrowick on the hour and from Tern Holm on the half hour, with a midday break', () => {
    expect(hhmm(FIRST.dep)).toBe('06:00');
    expect(FIRST.from).toBe('H');
    expect(LAST.from).toBe('T');
    expect(hhmm(LAST.dep)).toBe('21:30');
    for (const s of SAILINGS) {
      expect(s.arr - s.dep).toBe(CROSSING);
      expect(s.dep % 60).toBe(s.from === 'H' ? 0 : 30);
    }
    expect(SAILINGS.some((s) => s.dep === 12 * 60 || s.dep === 13 * 60)).toBe(false);
  });

  it('finds the next sailing from any minute, after the last one and across midnight', () => {
    expect(nextSailing(0)).toMatchObject({ sailing: { dep: 360, from: 'H' }, tomorrow: false });
    expect(nextSailing(360)).toMatchObject({ sailing: { dep: 360 } });
    expect(nextSailing(361)).toMatchObject({ sailing: { dep: 390, from: 'T' } });
    expect(nextSailing(361, 'H')).toMatchObject({ sailing: { dep: 420 } });
    expect(nextSailing(11 * 60 + 31)).toMatchObject({ sailing: { dep: 14 * 60, from: 'H' } });
    const late = nextSailing(21 * 60 + 31);
    expect(late).toMatchObject({ sailing: { dep: 360 }, tomorrow: true });
    expect(minutesUntil(21 * 60 + 31, late.sailing, late.tomorrow)).toBe(1440 - (21 * 60 + 31) + 360);
    expect(nextSailing(1439).tomorrow).toBe(true);
  });

  it('prices the fares', () => {
    expect(fare(2, 1, false)).toBe(12);
    expect(fare(1, 0, true)).toBe(23);
    expect(fare(0, 0, true, 2)).toBe(20);
  });
});

describe('where the Kittiwake is', () => {
  it('moves continuously: never further between adjacent seconds than her top speed allows, all day and over midnight', () => {
    const maxPerSecond = CRUISE / (CROSSING * 60);
    let prev = ferryAt(-1 / 60).p;
    for (let s = 0; s <= 1441 * 60; s++) {
      const p = ferryAt(s / 60).p;
      expect(Math.abs(p - prev)).toBeLessThanOrEqual(maxPerSecond * 1.0001);
      prev = p;
    }
  });

  it('is at the right quay, loading, or the right distance out', () => {
    expect(ferryAt(3 * 60)).toMatchObject({ mode: 'moored', at: 'H', tomorrow: false });
    expect(ferryAt(23 * 60)).toMatchObject({ mode: 'moored', at: 'H', tomorrow: true });
    expect(ferryAt(5 * 60 + 50)).toMatchObject({ mode: 'loading', at: 'H' });
    const out = ferryAt(14 * 60 + 8.5);
    expect(out).toMatchObject({ mode: 'crossing', dir: 1, minutesOut: 8 });
    expect(out.p).toBeGreaterThan(0.2);
    expect(out.p).toBeLessThan(0.4);
    expect(ferryAt(14 * 60 + 27)).toMatchObject({ mode: 'loading', at: 'T', sailing: { dep: 14 * 60 + 30 } });
    expect(ferryAt(14 * 60 + 42)).toMatchObject({ mode: 'crossing', dir: -1, minutesOut: 12 });
    expect(ferryAt(12 * 60 + 30)).toMatchObject({ mode: 'moored', at: 'H', sailing: { dep: 14 * 60 } });
  });

  it('lowers the ramp only while loading, smoothly', () => {
    let prev = 0;
    for (let s = 0; s < 1440 * 60; s += 5) {
      const f = ferryAt(s / 60);
      if (f.mode !== 'loading') expect(f.ramp).toBe(0);
      expect(Math.abs(f.ramp - prev)).toBeLessThanOrEqual(5 / 60 + 1e-9);
      prev = f.ramp;
    }
  });

  it('says what is true in a sentence', () => {
    expect(ferrySentence(ferryAt(14 * 60 + 8.5))).toBe('The Kittiwake is 8 minutes out of Harrowick, due at Tern Holm at 14:25.');
    expect(ferrySentence(ferryAt(14 * 60 + 27))).toBe('Loading at Tern Holm, leaves at 14:30.');
    expect(ferrySentence(ferryAt(23 * 60))).toBe('The Kittiwake is tied up at Harrowick for the night. First sailing 06:00.');
    expect(ferrySentence(ferryAt(12 * 60))).toBe('The Kittiwake is resting at Harrowick. Next sailing 14:00.');
  });

  it('the profile is symmetric and continuous in speed', () => {
    expect(crossingProfile(0.5).p).toBeCloseTo(0.5, 10);
    for (const u of [0.12, 0.88]) expect(crossingProfile(u - 1e-7).v).toBeCloseTo(crossingProfile(u + 1e-7).v, 4);
  });
});

describe('the tide (invented for the demo)', () => {
  const t0 = Date.UTC(2026, 4, 10);

  it('finds high and low waters numerically, and they match the model', () => {
    let t = t0;
    const turns = [];
    for (let i = 0; i < 8; i++) { const n = nextTurn(t + 60000); turns.push(n); t = n.utcMs; }
    for (const n of turns) {
      // The model's own slope is zero there, and the neighbours are lower (high) or higher (low).
      expect(Math.abs(tideRate(n.utcMs))).toBeLessThan(0.002);
      const side = Math.max(tideHeight(n.utcMs - 600000), tideHeight(n.utcMs + 600000));
      if (n.high) expect(n.height).toBeGreaterThan(side); else expect(n.height).toBeLessThan(Math.min(tideHeight(n.utcMs - 600000), tideHeight(n.utcMs + 600000)));
    }
    // High and low alternate, about 6 h 12 m apart.
    for (let i = 1; i < turns.length; i++) {
      expect(turns[i].high).toBe(!turns[i - 1].high);
      const gap = (turns[i].utcMs - turns[i - 1].utcMs) / 60000;
      expect(gap).toBeGreaterThan(5.5 * 60);
      expect(gap).toBeLessThan(7 * 60);
    }
  });

  it('has springs and neaps over a fortnight', () => {
    const ranges: number[] = [];
    for (let day = 0; day < 15; day++) {
      let lo = Infinity, hi = -Infinity;
      for (let m = 0; m < 1440; m += 5) { const h = tideHeight(t0 + (day * 1440 + m) * 60000); lo = Math.min(lo, h); hi = Math.max(hi, h); }
      ranges.push(hi - lo);
    }
    expect(Math.max(...ranges)).toBeGreaterThan(2 * (M2 + S2) * 0.95);
    expect(Math.min(...ranges)).toBeLessThan(2 * (M2 - S2) * 1.1);
    expect(Math.min(...ranges.map((r) => r))).toBeGreaterThan(0);
  });

  it('never shows a negative height', () => {
    for (let m = 0; m < 30 * 1440; m += 7) expect(tideHeight(t0 + m * 60000)).toBeGreaterThan(0);
  });

  it('says rising or falling and when the next turn is', () => {
    const st = sceneAt({ y: 2026, mo: 5, d: 10, minute: 600 });
    expect(tideLine(st)).toMatch(/^(Rising|Falling), \d\.\d m\. (High|Low) water at \d\d:\d\d\.$/);
    expect(st.tide.rising).toBe(st.tide.next.high);
  });
});

describe('the colors', () => {
  const channels = (st: ReturnType<typeof sceneAt>) => [
    ...PALETTE_KEYS.flatMap((k) => st.colors[k]),
    ...st.light.color.map((c) => c * st.light.strength),
    ...st.lamps.map((l) => l * 255), ...st.windows.map((l) => l * 255), ...st.islandWindows.map((l) => l * 255),
    st.lighthouse.on * 255, st.stars * 255, st.night * 255, st.day * 255,
  ];

  it('never jump: no color changes by more than 10 levels in a minute, any minute of the day, any season', () => {
    for (const [mo, d] of [[3, 20], [5, 10], [6, 21], [9, 23], [11, 22], [12, 21]]) {
      let prev = channels(sceneAt({ y: 2026, mo, d, minute: 0 }));
      let worst = 0;
      for (let m = 1; m < 1440; m++) {
        const cur = channels(sceneAt({ y: 2026, mo, d, minute: m }));
        for (let i = 0; i < cur.length; i++) worst = Math.max(worst, Math.abs(cur[i] - prev[i]));
        prev = cur;
      }
      expect(worst).toBeLessThan(10);
    }
  });

  it('are dark at night and bright at noon', () => {
    const night = sceneAt({ y: 2026, mo: 12, d: 21, minute: 180 });
    const noon = sceneAt({ y: 2026, mo: 6, d: 21, minute: 13 * 60 + 20 });
    expect(night.night).toBe(1);
    expect(night.colors.skyTop[2]).toBeLessThan(60);
    expect(noon.night).toBe(0);
    expect(noon.colors.skyMid[2]).toBeGreaterThan(200);
    expect(night.lamps.every((l) => l === 1)).toBe(true);
    expect(noon.lamps.every((l) => l === 0)).toBe(true);
  });

  it('the attract loop meets itself at midnight (pinned day)', () => {
    const a = sceneAt({ y: 2026, mo: 5, d: 10, minute: 0 }, { periodic: true });
    const b = sceneAt({ y: 2026, mo: 5, d: 10, minute: 1440 - 1e-6 }, { periodic: true });
    expect(Math.abs(a.tide.height - b.tide.height)).toBeLessThan(0.01);
  });
});
