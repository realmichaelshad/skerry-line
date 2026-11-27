import { test, expect, type Page } from '@playwright/test';

type State = { minute: number; time: string; sentence: string; tide: string; live: boolean; ferry: { mode: string; at: string | null; minutesOut: number; dir: number; sailing: string }; attract: boolean };
const state = (page: Page) => page.evaluate(() => (window as unknown as { __skerry: { state(): State } }).__skerry.state());

function watch(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => problems.push('failed: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`); });
  return problems;
}

async function open(page: Page, query: string) {
  await page.goto(query);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
}

/** Screen x of a minute on the day strip (it keeps 14 px at each end for the rounded ends). */
async function stripX(page: Page, minute: number) {
  const r = (await page.locator('#day-strip').boundingBox())!;
  return { x: r.x + 14 + (minute / 1440) * (r.width - 28), y: r.y + r.height / 2 };
}

async function touchDrag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  const n = 14;
  for (let i = 1; i <= n; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(200);
}

// The clock is held at 10:00 on 10 May 2026 so the schedule's answers are known.
const Q = '?date=2026-05-10&time=10:00';

test('phone: drag the day strip, the time, sentence and ferry follow the schedule', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'touch path');
  const problems = watch(page);
  await open(page, Q);
  const s0 = await state(page);
  expect(s0.time).toBe('10:00');
  expect(s0.live).toBe(true);
  await touchDrag(page, await stripX(page, 10 * 60 + 0.5), await stripX(page, 14 * 60 + 8.5));
  const s1 = await state(page);
  expect(s1.time).toBe('14:08');
  expect(s1.sentence).toBe('The Kittiwake is 8 minutes out of Harrowick, due at Tern Holm at 14:25.');
  expect(s1.ferry).toMatchObject({ mode: 'crossing', dir: 1, minutesOut: 8, sailing: 'H840' });
  await expect(page.locator('#time')).toHaveText('14:08');
  await expect(page.locator('#day-strip')).toHaveAttribute('aria-valuetext', /^14:08\. The Kittiwake is 8 minutes out/);
  // Drag on to the island quay while she loads.
  await touchDrag(page, await stripX(page, 14 * 60 + 8.5), await stripX(page, 14 * 60 + 27.5));
  const s2 = await state(page);
  expect(s2.sentence).toBe('Loading at Tern Holm, leaves at 14:30.');
  expect(s2.ferry).toMatchObject({ mode: 'loading', at: 'T' });
  // Now takes it back.
  await expect(page.locator('#now')).toBeVisible();
  await page.locator('#now').tap();
  await page.waitForTimeout(900);
  const s3 = await state(page);
  expect(s3.live).toBe(true);
  expect(s3.time).toBe('10:00');
  expect(problems).toEqual([]);
});

test('tap a sailing: the clock glides to its departure', async ({ page }, info) => {
  const problems = watch(page);
  await open(page, Q);
  const cell = page.locator('.tt-cell[data-id="T1050"]');
  if (info.project.name === 'phone') await cell.tap(); else await cell.click();
  await page.waitForTimeout(1000);
  const s = await state(page);
  expect(s.time).toBe('17:30');
  expect(s.sentence).toBe('The Kittiwake is leaving Tern Holm for Harrowick.');
  expect(s.ferry).toMatchObject({ mode: 'crossing', dir: -1, minutesOut: 0 });
  expect(problems).toEqual([]);
});

test('book a crossing and read the ticket', async ({ page }, info) => {
  const problems = watch(page);
  await open(page, Q);
  await page.locator('#b-sailing').selectOption('H960');
  const tap = async (sel: string) => { const l = page.locator(sel); if (info.project.name === 'phone') await l.tap(); else await l.click(); };
  await tap('.stepper[data-key="child"] .plus');
  await page.locator('#b-car').check();
  await expect(page.locator('#b-fare')).toHaveText('£25');
  await expect(page.locator('.book .demo')).toHaveText('Demo. Nothing is charged or sent.');
  await tap('.book-btn');
  const t = page.locator('#ticket');
  await expect(t).toBeVisible();
  await expect(t).toContainText('Harrowick to Tern Holm');
  await expect(t).toContainText('16:00');
  await expect(t).toContainText('16:25');
  await expect(t).toContainText('£25');
  await expect(t).toContainText('1 foot passenger, 1 child, a car with driver');
  await expect(t).toContainText(/Tide at departure: \d\.\d m and (rising|falling)/);
  await expect(t).toContainText('Demo. Nothing is charged or sent.');
  expect(problems).toEqual([]);
});

test('desktop: the strip is a slider for the keyboard', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'keyboard path');
  const problems = watch(page);
  await open(page, Q);
  await page.locator('#day-strip').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect((await state(page)).time).toBe('10:10');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  const s = await state(page);
  expect(s.time).toBe('14:10');
  expect(s.sentence).toBe('The Kittiwake is 10 minutes out of Harrowick, due at Tern Holm at 14:25.');
  await expect(page.locator('#day-strip')).toHaveAttribute('aria-valuenow', '850');
  await page.keyboard.press('Home');
  await page.waitForTimeout(900);
  expect((await state(page)).time).toBe('10:00');
  // Dragging the picture sideways moves the clock too.
  const r = (await page.locator('#scene').boundingBox())!;
  await page.mouse.move(r.x + r.width * 0.3, r.y + r.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.55, r.y + r.height * 0.4, { steps: 8 });
  await page.mouse.up();
  const s2 = await state(page);
  expect(s2.minute).toBeGreaterThan(10 * 60 + 150);
  expect(s2.minute).toBeLessThan(10 * 60 + 210);
  expect(problems).toEqual([]);
});

test('left alone it runs at the visitor\'s own time', async ({ page }) => {
  const problems = watch(page);
  await page.clock.setFixedTime(new Date(2026, 4, 10, 7, 12, 0));
  await open(page, '');
  const s = await state(page);
  expect(s.time).toBe('07:12');
  expect(s.live).toBe(true);
  expect(s.sentence).toBe('The Kittiwake is 12 minutes out of Harrowick, due at Tern Holm at 07:25.');
  expect(problems).toEqual([]);
});

test('attract mode runs the day by itself and hands over on input', async ({ page }, info) => {
  const problems = watch(page);
  await open(page, '?attract=1');
  const a = await state(page);
  expect(a.attract).toBe(true);
  await page.waitForTimeout(1200);
  const b = await state(page);
  expect(b.minute).not.toBe(a.minute);
  await expect(page.locator('#timetable')).toBeHidden();
  const r = (await page.locator('#scene').boundingBox())!;
  if (info.project.name === 'phone') await page.touchscreen.tap(r.x + 40, r.y + 40); else await page.mouse.click(r.x + 40, r.y + 40);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1' && !location.search.includes('attract'));
  expect((await state(page)).attract).toBe(false);
  expect(problems).toEqual([]);
});

test('works inside a frame, as the portfolio shows it', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/e2e/frame.html');
  const frame = page.frames().find((f) => f.url().includes('/dist/'))!;
  await frame.waitForFunction(() => document.documentElement.dataset.ready === '1');
  const s = await frame.evaluate(() => (window as unknown as { __skerry: { state(): State } }).__skerry.state());
  expect(s.time).toMatch(/^\d\d:\d\d$/);
  expect(problems).toEqual([]);
});
