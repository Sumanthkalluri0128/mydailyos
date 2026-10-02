// A proper labelled progress bar: "1,240 / 1,800 kcal", fill, percentage and what's left.
export default function GoalBar({ value = 0, target = 0, unit = "", color = "var(--md-primary)", overIsBad = false, decimals = 0, hint }) {
  const ratio = target > 0 ? value / target : 0;
  const pct = Math.round(ratio * 100);
  const over = ratio > 1;
  const fmt = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: decimals });
  const left = target - value;
  const caption = hint ?? (left >= 0 ? `${fmt(left)} ${unit} left` : `${fmt(-left)} ${unit} over`);
  return (
    <div className="goalbar">
      <div className="goalbar-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, pct)} aria-label={`${pct}% of target`}>
        <div className={`goalbar-fill${over && overIsBad ? " over" : ""}`} style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%`, background: over && overIsBad ? undefined : color }} />
      </div>
      <div className="goalbar-meta">
        <strong className={over && overIsBad ? "over" : ""}>{pct}%</strong>
        <span>{caption}</span>
      </div>
    </div>
  );
}
