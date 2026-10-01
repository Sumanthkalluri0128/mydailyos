import { useMemo } from "react";
import { movingAverage } from "../utils/trend";

// Raw daily weights as dots, with a smoothed 7-day moving average line on top,
// so day-to-day water-weight noise doesn't hide the real trend.
export default function WeightTrendChart({ logs }) {
  const data = useMemo(
    () => movingAverage((logs || []).map((l) => ({ date: l.date, value: Number(l.weightKg) })), 7),
    [logs]
  );

  if (data.length < 2) {
    return (
      <div className="card weight-trend">
        <h2>Weight trend</h2>
        <p className="card-description">Log your weight on at least two days to see your trend line.</p>
      </div>
    );
  }

  const W = 640, H = 220, PAD = { l: 44, r: 12, t: 12, b: 26 };
  const vals = data.flatMap((d) => [d.value, d.avg]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const spread = Math.max(max - min, 1);
  const lo = min - spread * 0.15, hi = max + spread * 0.15;
  const x = (i) => PAD.l + (i / (data.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const line = (key) => data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");
  const last = data[data.length - 1];
  const ticks = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1];

  return (
    <div className="card weight-trend">
      <div className="section-header">
        <div>
          <h2>Weight trend</h2>
          <p>7-day moving average smooths out daily ups and downs.</p>
        </div>
        <div className="trend-now">
          <strong>{last.avg.toFixed(1)} kg</strong>
          <small>trend</small>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weight trend chart" className="trend-svg">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="trend-grid" />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="trend-label">{t.toFixed(1)}</text>
          </g>
        ))}
        {data.map((d, i) => <circle key={d.date} cx={x(i)} cy={y(d.value)} r="3" className="trend-dot" />)}
        <path d={line("avg")} className="trend-line" fill="none" />
        <text x={PAD.l} y={H - 6} className="trend-label">{data[0].date}</text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end" className="trend-label">{last.date}</text>
      </svg>
      <div className="trend-legend"><span className="lg-dot" /> Daily weight <span className="lg-line" /> 7-day average</div>
    </div>
  );
}
