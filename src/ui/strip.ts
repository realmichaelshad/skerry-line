// The day strip: 24 hours wide, painted with the day's own sky from the same function as the picture, the sailings
// marked on it and the tide drawn through it. The handle shows the chosen minute.

import { css, sceneAt, sunTimes, type Moment, type RGB } from '../model/scene.ts';
import { SAILINGS } from '../model/schedule.ts';
import { tideHeight } from '../model/tide.ts';
import { utcOf } from '../model/scene.ts';

export class Strip {
  private bg: HTMLCanvasElement | null = null;
  private key = '';
  w = 0; h = 0; dpr = 1;
  /** Horizontal padding so 00:00 and 24:00 sit inside the rounded ends. */
  pad = 14;

  constructor(readonly canvas: HTMLCanvasElement) {}

  resize(w: number, h: number, dpr: number): void {
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.key = '';
  }

  xOf(minute: number): number { return this.pad + (minute / 1440) * (this.w - this.pad * 2); }
  minuteAt(x: number): number { return Math.max(0, Math.min(1439, ((x - this.pad) / (this.w - this.pad * 2)) * 1440)); }

  private build(day: Omit<Moment, 'minute'>, periodic: boolean): void {
    const { w, h, dpr } = this;
    const c = document.createElement('canvas');
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    const top = 18, bot = h - 4, bh = bot - top, r = Math.min(12, bh / 2);
    g.save();
    g.beginPath(); g.roundRect(2, top, w - 4, bh, r); g.clip();
    // The day's sky, minute by minute.
    const step = 4;
    for (let m = 0; m < 1440; m += step) {
      const st = sceneAt({ ...day, minute: m + step / 2 }, { periodic });
      const x0 = this.xOf(m), x1 = this.xOf(m + step);
      const grad = g.createLinearGradient(0, top, 0, bot);
      grad.addColorStop(0, css(st.colors.skyMid));
      grad.addColorStop(0.55, css(st.colors.skyLow));
      grad.addColorStop(1, css(st.colors.sea));
      g.fillStyle = grad;
      const ext0 = m === 0 ? this.pad : 0, ext1 = m + step >= 1440 ? this.pad : 0;
      g.fillRect(x0 - ext0, top, x1 - x0 + 0.6 + ext0 + ext1, bh);
    }
    // The tide as a curve.
    const t0 = utcOf({ ...day, minute: 0 });
    g.beginPath();
    for (let m = 0; m <= 1440; m += 8) {
      const ht = tideHeight(t0 + m * 60000);
      const y = bot - 6 - (ht / 3.6) * (bh - 14);
      if (m === 0) g.moveTo(this.xOf(m), y); else g.lineTo(this.xOf(m), y);
    }
    g.strokeStyle = 'rgba(242,239,230,0.75)';
    g.lineWidth = 1.5;
    g.stroke();
    // Sailings: a bar for each crossing, out above, home below.
    for (const s of SAILINGS) {
      const y = s.from === 'H' ? top + bh * 0.3 : top + bh * 0.5;
      g.fillStyle = s.from === 'H' ? 'rgba(242,166,90,0.95)' : 'rgba(242,239,230,0.9)';
      g.beginPath(); g.roundRect(this.xOf(s.dep), y - 2.5, Math.max(3, this.xOf(s.arr) - this.xOf(s.dep)), 5, 2.5); g.fill();
    }
    g.restore();
    // Hour labels above.
    g.fillStyle = 'rgba(242,239,230,0.78)';
    g.font = '600 11px "Sofia Sans Condensed Variable", sans-serif';
    g.textBaseline = 'alphabetic';
    for (const hr of [0, 3, 6, 9, 12, 15, 18, 21, 24]) {
      if (w < 500 && hr % 6 !== 0) continue;
      const x = this.xOf(hr * 60);
      g.textAlign = hr === 0 ? 'left' : hr === 24 ? 'right' : 'center';
      g.fillText(String(hr).padStart(2, '0'), hr === 0 ? x - 6 : hr === 24 ? x + 6 : x, 12);
    }
    // Sunrise and sunset as small ticks on the top edge.
    const sun = sunTimes(day.y, day.mo, day.d);
    g.fillStyle = 'rgba(255,214,150,0.95)';
    for (const m of [sun.rise, sun.set]) if (m !== null) { g.beginPath(); g.arc(this.xOf(m), top, 2.5, 0, Math.PI * 2); g.fill(); }
    this.bg = c;
  }

  draw(day: Omit<Moment, 'minute'>, minute: number, accent: RGB = [242, 166, 90], periodic = false): void {
    const key = `${day.y}-${day.mo}-${day.d}-${this.w}x${this.h}-${periodic}`;
    if (key !== this.key) { this.build(day, periodic); this.key = key; }
    const g = this.canvas.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.bg) g.drawImage(this.bg, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const x = this.xOf(minute), top = 18, bot = this.h - 4;
    // The handle: a line through the strip and a knob you can take hold of.
    g.fillStyle = 'rgba(10,20,30,0.25)';
    g.fillRect(x - 2, top, 4, bot - top);
    g.fillStyle = css(accent);
    g.fillRect(x - 1.25, top - 2, 2.5, bot - top + 2);
    g.beginPath(); g.arc(x, (top + bot) / 2, 9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(242,239,230,0.95)'; g.lineWidth = 2; g.stroke();
  }
}
