// The timetable as data. Everything else (the picture, the sentence, the list, the booking) reads from here.
// From Harrowick on the hour, from Tern Holm on the half hour, a midday break at Harrowick from 11:55 to 14:00,
// 25 minutes across and 5 minutes at each quay. Overnight the Kittiwake lies at Harrowick.

export type Port = 'H' | 'T';
export const PORT_NAME: Record<Port, string> = { H: 'Harrowick', T: 'Tern Holm' };
export const BOAT = 'Kittiwake';
export const CROSSING = 25;
/** Minutes before a departure that loading starts (ramp down) when the boat is already at the quay. */
export const LOADING = 20;

export interface Sailing {
  id: string;
  from: Port;
  to: Port;
  /** Minutes after midnight, harbor clock. */
  dep: number;
  arr: number;
}

const HOURS = [6, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 19, 20, 21];

export const SAILINGS: Sailing[] = HOURS.flatMap((h) => [
  { id: `H${h * 60}`, from: 'H' as Port, to: 'T' as Port, dep: h * 60, arr: h * 60 + CROSSING },
  { id: `T${h * 60 + 30}`, from: 'T' as Port, to: 'H' as Port, dep: h * 60 + 30, arr: h * 60 + 30 + CROSSING },
]).sort((a, b) => a.dep - b.dep);

export const FIRST = SAILINGS[0];
export const LAST = SAILINGS[SAILINGS.length - 1];

export const FARES = [
  { key: 'adult', label: 'Foot passenger', price: 5 },
  { key: 'child', label: 'Child under 16', price: 2 },
  { key: 'bike', label: 'Bicycle', price: 1 },
  { key: 'car', label: 'Car with driver', price: 18 },
] as const;
export const CURRENCY = '£';

export function fare(adults: number, children: number, car: boolean, bikes = 0): number {
  return adults * 5 + children * 2 + bikes * 1 + (car ? 18 : 0);
}

/** The next sailing that leaves at or after `minute` (from a given port, or either). Wraps to tomorrow's first. */
export function nextSailing(minute: number, from?: Port): { sailing: Sailing; tomorrow: boolean } {
  const list = from ? SAILINGS.filter((s) => s.from === from) : SAILINGS;
  const s = list.find((x) => x.dep >= minute);
  return s ? { sailing: s, tomorrow: false } : { sailing: list[0], tomorrow: true };
}

/** Minutes from `minute` until a sailing leaves, counting into tomorrow if needed. */
export function minutesUntil(minute: number, s: Sailing, tomorrow: boolean): number {
  return s.dep - minute + (tomorrow ? 1440 : 0);
}

export function hhmm(minute: number): string {
  const m = ((Math.floor(minute + 1e-6) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- where the boat is

export type FerryMode = 'moored' | 'loading' | 'crossing';

export interface Ferry {
  mode: FerryMode;
  /** Quay she is at, or null at sea. */
  at: Port | null;
  /** 0 at Harrowick's berth, 1 at Tern Holm's, along the crossing. */
  p: number;
  /** Direction of travel while crossing: +1 out to Tern Holm, -1 home. */
  dir: 1 | -1 | 0;
  /** Speed as a fraction of cruising speed (0..1), for the wake. */
  speed: number;
  /** How far the car ramp is down (0..1). */
  ramp: number;
  /** The sailing she is on (crossing) or will take next (at a quay). */
  sailing: Sailing;
  /** True if that next sailing is tomorrow morning. */
  tomorrow: boolean;
  /** Whole minutes since departure while crossing. */
  minutesOut: number;
}

/** Part of the crossing spent speeding up, and the same slowing down. */
const ACC = 0.12;
export const CRUISE = 1 / (1 - ACC); // peak speed in crossings per crossing-duration

/** Position along the crossing for elapsed fraction u (0..1): speed up, cruise, slow down. Continuous in speed too. */
export function crossingProfile(u: number): { p: number; v: number } {
  const v = CRUISE;
  if (u <= 0) return { p: 0, v: 0 };
  if (u >= 1) return { p: 1, v: 0 };
  if (u < ACC) return { p: (v / (2 * ACC)) * u * u, v: (v * u) / ACC };
  if (u > 1 - ACC) { const w = 1 - u; return { p: 1 - (v / (2 * ACC)) * w * w, v: (v * w) / ACC }; }
  return { p: v * (u - ACC / 2), v };
}

/** The Kittiwake at a moment (minutes after midnight, fractional for seconds). */
export function ferryAt(minute: number): Ferry {
  const m = ((minute % 1440) + 1440) % 1440;
  const sea = SAILINGS.find((s) => m >= s.dep && m < s.arr);
  if (sea) {
    const u = (m - sea.dep) / CROSSING;
    const { p, v } = crossingProfile(u);
    const out = sea.from === 'H';
    return { mode: 'crossing', at: null, p: out ? p : 1 - p, dir: out ? 1 : -1, speed: v / CRUISE, ramp: 0, sailing: sea, tomorrow: false, minutesOut: Math.floor(m - sea.dep) };
  }
  // At a quay: the last arrival before now says which one.
  const arrived = [...SAILINGS].reverse().find((s) => s.arr <= m);
  const at: Port = arrived ? arrived.to : 'H';
  const { sailing, tomorrow } = nextSailing(m, at);
  const until = minutesUntil(m, sailing, tomorrow);
  const since = arrived ? m - arrived.arr : Infinity;
  const loading = until <= LOADING;
  // The ramp comes down over a minute once loading starts and goes up in the last minute before she leaves.
  let ramp = 0;
  if (loading) ramp = Math.max(0, Math.min(1, Math.min(LOADING - until, since, until)));
  return { mode: loading ? 'loading' : 'moored', at, p: at === 'H' ? 0 : 1, dir: 0, speed: 0, ramp, sailing, tomorrow, minutesOut: 0 };
}
