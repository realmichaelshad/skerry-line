import './style.css';
import groteskUrl from '@fontsource-variable/familjen-grotesk/files/familjen-grotesk-latin-wght-normal.woff2?url';
import condensedUrl from '@fontsource-variable/sofia-sans-condensed/files/sofia-sans-condensed-latin-wght-normal.woff2?url';
import { sceneAt, smoothstep, sunTimes, utcOf, type Moment, type SceneState } from './model/scene.ts';
import { BOAT, CURRENCY, FARES, PORT_NAME, SAILINGS, fare, hhmm, minutesUntil, nextSailing, type Sailing } from './model/schedule.ts';
import { tideHeight, tideRate } from './model/tide.ts';
import { PLACE } from './model/sun.ts';
import { ferrySentence, tideLine } from './model/words.ts';
import { Scene, layout, type Layout } from './scene/draw.ts';
import { Strip } from './ui/strip.ts';
import { tintFor, rgb } from './ui/tint.ts';

type Day = Omit<Moment, 'minute'>;

declare global {
  interface Window {
    __skerry?: { state(): ReturnType<typeof publicState>; setMinute(m: number): void };
    __step?: (ms: number) => void;
  }
}

const params = new URLSearchParams(location.search);
const attract = params.get('attract') === '1';
const capture = params.get('capture') === '1';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ------------------------------------------------------------------ the clock

/** The visitor's own date and minute (with seconds). */
function localNow(): { day: Day; minute: number } {
  const d = new Date();
  return { day: { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate() }, minute: d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 + d.getMilliseconds() / 60000 };
}

function parseDay(s: string | null): Day | null {
  const m = s && /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? { y: +m[1], mo: +m[2], d: +m[3] } : null;
}
function parseTime(s: string | null): number | null {
  const m = s && /^(\d{1,2}):(\d{2})$/.exec(s);
  return m ? +m[1] * 60 + +m[2] : null;
}

const PIN_ATTRACT: Day = { y: 2026, mo: 5, d: 10 };
const pinnedDay = attract ? PIN_ATTRACT : parseDay(params.get('date'));
const pinnedTime = parseTime(params.get('time'));

const clock = {
  /** Minutes added to the visitor's time once they move the clock (0 = live). */
  offset: 0,
  moved: false,
  glide: null as null | { from: number; to: number; t0: number; dur: number },
  frozenAt: pinnedTime,
};

function today(): Day { return pinnedDay ?? localNow().day; }
function baseMinute(): number { return clock.frozenAt ?? localNow().minute; }

function currentMinute(): number {
  return Math.max(0, Math.min(1440 - 1e-6, baseMinute() + clock.offset));
}

function setMinute(m: number, glide = false): void {
  const target = Math.max(0, Math.min(1440 - 1e-6, m)) - baseMinute();
  if (glide && !reduced) clock.glide = { from: clock.offset, to: target, t0: performance.now(), dur: 650 };
  else { clock.glide = null; clock.offset = target; }
  clock.moved = true;
  // The words follow at once; the picture is drawn on the next frame.
  if (!clock.glide) { last = sceneAt(momentNow()); updateText(last, false); }
  wake();
}

function backToNow(): void {
  clock.glide = reduced ? null : { from: clock.offset, to: 0, t0: performance.now(), dur: 650 };
  if (reduced) clock.offset = 0;
  clock.moved = false;
  wake();
}

// ------------------------------------------------------------------ attract mode: a day in ten seconds

const ATTRACT_MS = 10000;
let attractT = 0;
let attractMap: Float64Array | null = null;
/** Minute of the pinned day for each of 2000 even steps of the loop, slower where the light changes fastest. */
function buildAttract(): Float64Array {
  const start = 20 * 60 + 45; // the golden hour on 10 May
  const wts: number[] = [];
  for (let m = 0; m <= 1440; m++) {
    const st = sceneAt({ ...PIN_ATTRACT, minute: (start + m) % 1440 }, { periodic: true });
    wts.push(1 + 2.2 * Math.exp(-(((st.sun.elev + 2) / 6) ** 2)));
  }
  const cum = [0];
  for (let m = 1; m <= 1440; m++) cum.push(cum[m - 1] + (wts[m - 1] + wts[m]) / 2);
  const total = cum[1440];
  const N = 2000, out = new Float64Array(N + 1);
  let j = 0;
  for (let i = 0; i <= N; i++) {
    const target = (i / N) * total;
    while (j < 1439 && cum[j + 1] < target) j++;
    const f = (target - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    out[i] = (start + j + f) % 1440;
  }
  return out;
}
function attractMinute(t: number): number {
  attractMap ??= buildAttract();
  const u = ((t % ATTRACT_MS) + ATTRACT_MS) % ATTRACT_MS / ATTRACT_MS * 2000;
  const i = Math.floor(u), f = u - i;
  const a = attractMap[i], b = attractMap[Math.min(2000, i + 1)];
  const d = ((b - a + 720 + 1440) % 1440) - 720;
  return (a + d * f + 1440) % 1440;
}

// ------------------------------------------------------------------ drawing

const sceneCanvas = $<HTMLCanvasElement>('scene');
const stripCanvas = $<HTMLCanvasElement>('day-strip');
const scene = new Scene();
scene.reduced = reduced;
const strip = new Strip(stripCanvas);
let L: Layout = layout(1, 1);
let dpr = 1;
let last: SceneState | null = null;
let lastText = '';

function resize(): void {
  const r = sceneCanvas.parentElement!.getBoundingClientRect();
  const phone = Math.min(innerWidth, innerHeight) < 600;
  dpr = Math.min(devicePixelRatio || 1, phone ? 1.5 : 2);
  sceneCanvas.width = Math.round(r.width * dpr);
  sceneCanvas.height = Math.round(r.height * dpr);
  L = layout(r.width, r.height);
  const sr = stripCanvas.parentElement!.getBoundingClientRect();
  strip.resize(sr.width, sr.height, Math.min(devicePixelRatio || 1, 2));
  stripCanvas.style.width = sr.width + 'px';
  stripCanvas.style.height = sr.height + 'px';
  render(true);
}

function momentNow(): Moment {
  return { ...today(), minute: attract ? attractMinute(attractT) : currentMinute() };
}

function render(force = false): void {
  const m = momentNow();
  const st = sceneAt(m, { periodic: attract, seconds: attract ? attractT / 1000 : undefined });
  last = st;
  const g = sceneCanvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  scene.draw(g, st, L);
  strip.draw(today(), m.minute, [242, 166, 90], attract);
  updateText(st, force);
  tint(st);
}

function updateText(st: SceneState, force: boolean): void {
  const time = hhmm(st.moment.minute);
  const sentence = ferrySentence(st.ferry);
  const tide = tideLine(st);
  const key = time + sentence + tide;
  if (key === lastText && !force) return;
  lastText = key;
  $('time').textContent = time;
  $('sentence').textContent = sentence;
  $('tide').textContent = tide;
  stripCanvas.setAttribute('aria-valuenow', String(Math.floor(st.moment.minute)));
  stripCanvas.setAttribute('aria-valuetext', `${time}. ${sentence}`);
  $('now').hidden = !clock.moved || attract;
  renderTimetable(st.moment.minute);
}

/** The page takes its tint from the hour: at night the whole page is night, with its text flipped to light. */
let lastTint = -1;
function tint(st: SceneState): void {
  const n = Math.round(st.night * 50) / 50;
  if (n === lastTint) return;
  lastTint = n;
  const t = tintFor(n);
  const root = document.documentElement.style;
  root.setProperty('--hero', rgb(t.hero));
  root.setProperty('--page', rgb(t.page));
  root.setProperty('--ink', rgb(t.ink));
  root.setProperty('--ink-soft', rgb(t.inkSoft));
  document.documentElement.classList.toggle('night', t.night);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', rgb(t.hero));
}

// ------------------------------------------------------------------ the timetable

const HOURS = [...new Set(SAILINGS.filter((s) => s.from === 'H').map((s) => s.dep / 60))];
let builtTable = false;
function buildTimetable(): void {
  const el = $('timetable');
  const cell = (s: Sailing) => `<button type="button" class="tt-cell" data-id="${s.id}" data-dep="${s.dep}"><span class="tt-time">${hhmm(s.dep)}</span><span class="tt-note"></span></button>`;
  let html = `<div class="tt-head"><span>From Harrowick</span><span>From Tern Holm</span></div><div class="tt-grid">`;
  for (const h of HOURS) {
    if (h === 14) html += `<div class="tt-break">Break at Harrowick, 11:55 to 14:00</div>`;
    const a = SAILINGS.find((s) => s.from === 'H' && s.dep === h * 60)!;
    const b = SAILINGS.find((s) => s.from === 'T' && s.dep === h * 60 + 30)!;
    html += `<div class="tt-row">${cell(a)}${cell(b)}</div>`;
  }
  html += `</div><p class="tt-foot">25 minutes across. Every sailing takes cars.</p>`;
  el.innerHTML = html;
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('.tt-cell') as HTMLElement | null;
    if (!b || attract) return;
    setMinute(Number(b.dataset.dep), true);
  });
  builtTable = true;
}

let lastTableMinute = -1;
function renderTimetable(minute: number): void {
  if (!builtTable) buildTimetable();
  const whole = Math.floor(minute);
  if (whole === lastTableMinute) return;
  lastTableMinute = whole;
  const { sailing: next, tomorrow } = nextSailing(minute);
  const atSea = SAILINGS.find((s) => minute >= s.dep && minute < s.arr);
  document.querySelectorAll<HTMLElement>('.tt-cell').forEach((b) => {
    const dep = Number(b.dataset.dep);
    const s = SAILINGS.find((x) => x.id === b.dataset.id)!;
    const note = b.querySelector('.tt-note')!;
    b.classList.remove('is-next', 'is-sea', 'is-gone');
    if (atSea && atSea.id === s.id) { b.classList.add('is-sea'); note.textContent = 'At sea'; }
    else if (!tomorrow && next.id === s.id) { b.classList.add('is-next'); const n = minutesUntil(minute, next, false); note.textContent = n < 1 ? 'Leaving' : `In ${Math.ceil(n)} min`; }
    else if (dep + 25 <= minute) { b.classList.add('is-gone'); note.textContent = ''; }
    else note.textContent = '';
    b.setAttribute('aria-label', `${hhmm(dep)} from ${PORT_NAME[s.from]}${note.textContent ? ', ' + note.textContent : ''}. Show this sailing.`);
  });
}

// ------------------------------------------------------------------ booking

const book = { adult: 1, child: 0, car: false };
function fillSailings(): void {
  const sel = $<HTMLSelectElement>('b-sailing');
  const m = currentMinute();
  const { sailing: next } = nextSailing(m);
  sel.innerHTML = SAILINGS.map((s) => `<option value="${s.id}"${s.id === next.id ? ' selected' : ''}>${hhmm(s.dep)} ${PORT_NAME[s.from]} to ${PORT_NAME[s.to]}</option>`).join('');
}
function updateFare(): void {
  $('b-adult').textContent = String(book.adult);
  $('b-child').textContent = String(book.child);
  $('b-fare').textContent = CURRENCY + fare(book.adult, book.child, book.car);
}
function setupBooking(): void {
  fillSailings();
  updateFare();
  document.querySelectorAll<HTMLElement>('.stepper').forEach((st) => {
    const key = st.dataset.key as 'adult' | 'child';
    st.querySelector('.minus')!.addEventListener('click', () => { book[key] = Math.max(key === 'adult' && !book.car ? 1 : 0, book[key] - 1); updateFare(); });
    st.querySelector('.plus')!.addEventListener('click', () => { book[key] = Math.min(9, book[key] + 1); updateFare(); });
  });
  $<HTMLInputElement>('b-car').addEventListener('change', (e) => { book.car = (e.target as HTMLInputElement).checked; if (!book.car && book.adult < 1) book.adult = 1; updateFare(); });
  $<HTMLFormElement>('book-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const s = SAILINGS.find((x) => x.id === $<HTMLSelectElement>('b-sailing').value)!;
    const day = today();
    const dep = utcOf({ ...day, minute: s.dep });
    const h = tideHeight(dep), rising = tideRate(dep) > 0;
    const who = [book.adult && `${book.adult} foot passenger${book.adult === 1 ? '' : 's'}`, book.child && `${book.child} child${book.child === 1 ? '' : 'ren'}`, book.car && 'a car with driver'].filter(Boolean).join(', ');
    const date = new Date(Date.UTC(day.y, day.mo - 1, day.d)).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    const ref = `KW ${String(day.mo).padStart(2, '0')}${String(day.d).padStart(2, '0')} ${hhmm(s.dep).replace(':', '')}`;
    const t = $('ticket');
    t.innerHTML = `
      <div class="t-top"><span class="t-brand">Skerry Line</span><span class="t-ref">${ref}</span></div>
      <p class="t-route">${PORT_NAME[s.from]} to ${PORT_NAME[s.to]}</p>
      <p class="t-date">${date}</p>
      <dl class="t-times"><div><dt>Departs</dt><dd>${hhmm(s.dep)}</dd></div><div><dt>Arrives</dt><dd>${hhmm(s.arr)}</dd></div><div><dt>Fare</dt><dd>${CURRENCY}${fare(book.adult, book.child, book.car)}</dd></div></dl>
      <p class="t-who">${who} on the ${BOAT}</p>
      <p class="t-tide">Tide at departure: ${h.toFixed(1)} m and ${rising ? 'rising' : 'falling'}</p>
      <p class="t-demo">Demo. Nothing is charged or sent.</p>`;
    t.hidden = false;
    t.focus({ preventScroll: true });
    t.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  });
  $('fare-rows').innerHTML = FARES.map((f) => `<tr><th scope="row">${f.label}</th><td>${CURRENCY}${f.price}</td></tr>`).join('');
}

function sunNote(): void {
  const d = today();
  const t = sunTimes(d.y, d.mo, d.d);
  const lat = `${Math.floor(PLACE.lat)}°${Math.round((PLACE.lat % 1) * 60)}′ north`;
  $('sun-note').textContent = `Sun times are true for Harrowick, ${lat}: today the sun rises at ${t.rise !== null ? hhmm(t.rise) : 'no time'} and sets at ${t.set !== null ? hhmm(t.set) : 'no time'}. The tide on this page is invented for the demo.`;
}

// ------------------------------------------------------------------ input

function setupInput(): void {
  // The strip: drag anywhere on it.
  let dragging = false;
  const fromEvent = (e: PointerEvent) => { const r = stripCanvas.getBoundingClientRect(); return strip.minuteAt(e.clientX - r.left); };
  stripCanvas.addEventListener('pointerdown', (e) => {
    if (attract) return;
    dragging = true;
    stripCanvas.setPointerCapture(e.pointerId);
    setMinute(fromEvent(e));
    document.documentElement.classList.add('dragging');
  });
  stripCanvas.addEventListener('pointermove', (e) => { if (dragging) setMinute(fromEvent(e)); });
  const end = () => { dragging = false; document.documentElement.classList.remove('dragging'); };
  stripCanvas.addEventListener('pointerup', end);
  stripCanvas.addEventListener('pointercancel', end);
  // The picture: drag sideways to move through the day (half a day per width).
  let sx = -1, sm = 0;
  sceneCanvas.addEventListener('pointerdown', (e) => { if (attract) return; sx = e.clientX; sm = currentMinute(); sceneCanvas.setPointerCapture(e.pointerId); });
  sceneCanvas.addEventListener('pointermove', (e) => {
    if (sx < 0) return;
    const dx = e.clientX - sx;
    if (Math.abs(dx) < 4 && !clock.moved) return;
    setMinute(sm + (dx / L.w) * 720);
  });
  const endScene = () => { sx = -1; };
  sceneCanvas.addEventListener('pointerup', endScene);
  sceneCanvas.addEventListener('pointercancel', endScene);
  // Keyboard on the strip.
  stripCanvas.addEventListener('keydown', (e) => {
    const m = currentMinute();
    const step = e.shiftKey ? 60 : 5;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setMinute(Math.floor(m) - step);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setMinute(Math.floor(m) + step);
    else if (e.key === 'PageUp') setMinute(Math.floor(m) + 60);
    else if (e.key === 'PageDown') setMinute(Math.floor(m) - 60);
    else if (e.key === 'Home') backToNow();
    else return;
    e.preventDefault();
  });
  $('now').addEventListener('click', backToNow);
}

// ------------------------------------------------------------------ the loop: draw only when something changed

let raf = 0, timer = 0, active = true;
function wake(): void {
  if (capture || !active) return;
  clearTimeout(timer);
  if (!raf) raf = requestAnimationFrame(frame);
}
function frame(now: number): void {
  raf = 0;
  if (attract) attractT = now % ATTRACT_MS;
  if (clock.glide) {
    const g = clock.glide;
    const k = Math.min(1, (now - g.t0) / g.dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
    clock.offset = g.from + (g.to - g.from) * e;
    if (k >= 1) clock.glide = null;
  }
  render();
  if (!active) return;
  const st = last!;
  const busy = attract || clock.glide || document.documentElement.classList.contains('dragging');
  if (busy) { raf = requestAnimationFrame(frame); return; }
  // Idle: the boat moves about half a pixel a second, so once a second is plenty; the lighthouse turns a little
  // faster; otherwise the picture only changes with the minute.
  const delay = st.lighthouse.on > 0.05 ? 250 : st.ferry.mode === 'crossing' || st.ferry.ramp > 0 ? 1000 : (60 - (st.moment.minute * 60) % 60) * 1000 + 30;
  timer = window.setTimeout(() => { raf = requestAnimationFrame(frame); }, delay);
}

function setActive(on: boolean): void {
  if (on === active) return;
  active = on;
  if (!on) { cancelAnimationFrame(raf); raf = 0; clearTimeout(timer); }
  else wake();
}

function publicState() {
  const st = last!;
  return {
    minute: st.moment.minute,
    time: $('time').textContent,
    sentence: $('sentence').textContent,
    tide: $('tide').textContent,
    date: `${st.moment.y}-${String(st.moment.mo).padStart(2, '0')}-${String(st.moment.d).padStart(2, '0')}`,
    live: !clock.moved,
    ferry: { mode: st.ferry.mode, at: st.ferry.at, p: st.ferry.p, dir: st.ferry.dir, minutesOut: st.ferry.minutesOut, sailing: st.ferry.sailing.id, ramp: st.ferry.ramp },
    sun: { elev: st.sun.elev, az: st.sun.az },
    tideHeight: st.tide.height,
    night: st.night,
    attract,
  };
}

async function boot(): Promise<void> {
  if (attract) document.documentElement.classList.add('attract');
  if (capture) document.documentElement.classList.add('capture');
  const faces = [
    new FontFace('Familjen Grotesk Variable', `url(${groteskUrl}) format('woff2')`, { weight: '400 700' }),
    new FontFace('Sofia Sans Condensed Variable', `url(${condensedUrl}) format('woff2')`, { weight: '1 1000' }),
  ];
  faces.forEach((f) => document.fonts.add(f));
  await Promise.race([Promise.all(faces.map((f) => f.load())), new Promise((r) => setTimeout(r, 2500))]).catch(() => undefined);
  setupBooking();
  setupInput();
  sunNote();
  resize();
  new ResizeObserver(() => resize()).observe(sceneCanvas.parentElement!);
  document.addEventListener('visibilitychange', () => setActive(!document.hidden));
  // The whole hero (picture, clock, strip and timetable): tapping a sailing low in the list still moves the clock.
  new IntersectionObserver((en) => setActive(en[0].isIntersecting && !document.hidden), { threshold: 0 }).observe(document.querySelector('.hero')!);
  window.__skerry = { state: publicState, setMinute: (m: number) => setMinute(m) };
  if (capture) {
    window.__step = (ms: number) => { attractT += ms; render(); };
  } else wake();
  if (attract) {
    // Any real input hands the page to the visitor, at their own time.
    const leave = () => {
      if (!document.documentElement.classList.contains('attract')) return;
      location.replace(location.pathname);
    };
    addEventListener('pointerdown', leave, { once: true });
    addEventListener('keydown', leave, { once: true });
  }
  render(true);
  document.documentElement.dataset.ready = '1';
  void smoothstep;
}

void boot();
