// The sentence under the time, and the tide line: what is true at this minute, in plain words.

import { BOAT, PORT_NAME, hhmm, type Ferry } from './schedule.ts';
import type { SceneState } from './scene.ts';

export function ferrySentence(f: Ferry): string {
  const s = f.sailing;
  if (f.mode === 'crossing') {
    const from = PORT_NAME[s.from], to = PORT_NAME[s.to];
    if (f.minutesOut === 0) return `The ${BOAT} is leaving ${from} for ${to}.`;
    if (f.minutesOut >= 24) return `The ${BOAT} is coming alongside at ${to}.`;
    const n = f.minutesOut;
    return `The ${BOAT} is ${n} minute${n === 1 ? '' : 's'} out of ${from}, due at ${to} at ${hhmm(s.arr)}.`;
  }
  const at = PORT_NAME[f.at!];
  if (f.mode === 'loading') return `Loading at ${at}, leaves at ${hhmm(s.dep)}.`;
  if (f.tomorrow) return `The ${BOAT} is tied up at ${at} for the night. First sailing ${hhmm(s.dep)}.`;
  if (s.dep < 6 * 60 + 1) return `The ${BOAT} is tied up at ${at}. First sailing ${hhmm(s.dep)}.`;
  return `The ${BOAT} is resting at ${at}. Next sailing ${hhmm(s.dep)}.`;
}

export function tideLine(st: SceneState): string {
  const t = st.tide;
  const word = t.rising ? 'Rising' : 'Falling';
  const kind = t.next.high ? 'high' : 'low';
  return `${word}, ${t.height.toFixed(1)} m. ${kind === 'high' ? 'High' : 'Low'} water at ${hhmm(t.nextMinute)}.`;
}
