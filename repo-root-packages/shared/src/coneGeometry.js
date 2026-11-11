// Geometry for the "Likely arrival" chart. Pure: NO React, NO DOM. The web (CoachCards.jsx) and the phone (CoachCards.tsx) draw the same shapes.
// Fixes over the first version: the line STOPS at the likely arrival (it used to run flat along the goal for the rest of the chart, which read
// like "you stay here"), the arrival is a labelled dot, the x axis has dates, and the goal label sits at the left so it never covers the line.
const f1 = (n) => Number(n.toFixed(1));

/** @param r the /api/coach/goal-range payload (status "ok"). @returns shapes in a W x H box, or null when there is nothing to draw. */
export function coneGeometry(r, W = 320, H = 130, P = 8) {
  const c = r && Array.isArray(r.cone) ? r.cone : [];
  if (c.length < 2 || !(r.goalKg > 0)) return null;
  const labelRoom = 20;                                   // space under the chart for the date labels
  const n = c.length - 1;                                 // weeks on the x axis
  const all = c.flatMap((p) => [p.fast, p.slow, p.mid]).concat(r.goalKg);
  const lo = Math.min(...all) - 0.4, hi = Math.max(...all) + 0.4;
  const x = (wk) => P + (wk / n) * (W - 2 * P);
  const y = (v) => P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P - labelRoom);
  const line = (key) => c.map((p, i) => `${i ? 'L' : 'M'}${f1(x(i))},${f1(y(p[key]))}`).join(' ');
  const band = `${line('fast')} ${c.slice().reverse().map((p, k) => `L${f1(x(n - k))},${f1(y(p.slow))}`).join(' ')}Z`;

  // the middle line runs from today to the likely arrival and stops there
  const arrivalWk = Number(r.likelyDays) > 0 ? Math.min(n, r.likelyDays / 7) : null;
  let mid = line('mid'); let arrival = null;
  if (arrivalWk != null) {
    const whole = Math.floor(arrivalWk);
    const pts = c.slice(0, whole + 1).map((p, i) => `${i ? 'L' : 'M'}${f1(x(i))},${f1(y(p.mid))}`);
    if (arrivalWk > whole) pts.push(`L${f1(x(arrivalWk))},${f1(y(r.goalKg))}`);
    mid = pts.join(' ');
    arrival = { x: f1(x(arrivalWk)), y: f1(y(r.goalKg)), date: r.likely };
  }
  const goalY = f1(y(r.goalKg));
  return {
    W, H, P, band, mid, arrival, goalY,
    goalLabel: { x: P, y: f1(goalY - 4), text: `Goal ${r.goalKg} kg` },
    // dates under the chart: today, the likely arrival, and where the chart ends. Labels that would collide are dropped.
    ticks: dedupe([
      { x: P, date: r.startDate || c[0].date, anchor: 'start' },
      ...(arrival ? [{ x: arrival.x, date: r.likely, anchor: arrival.x > W - 60 ? 'end' : 'middle', bold: true }] : []),
      { x: W - P, date: r.endDate || c[c.length - 1].date, anchor: 'end' },
    ]),
    labelY: H - 4,
    start: { x: f1(x(0)), y: f1(y(c[0].mid)) },
  };
}

/** drop a tick when it sits within 56 px of the one before it, so labels never overlap (the arrival tick is kept over the end tick) */
function dedupe(ticks) {
  const out = [];
  for (const t of ticks) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(t.x - prev.x) < 56) { if (t.bold) out[out.length - 1] = t; continue; }
    out.push(t);
  }
  return out;
}
