// "This week" on the Today tab: how the smart plan thinks you are doing, what it changed and why, and the one-tap suggestions.
// Everything shown here comes from the server (lib/bodyPlanAdapt.js); this only displays it. Each fact appears once.
export default function AdaptCard({ adapt, onApply, busy }) {
  if (!adapt) return null;
  const b = adapt.body;
  return (
    <section className="wp-card wp-adapt" aria-label="How your plan is adapting">
      <h3 className="wp-h">{adapt.status.headline}</h3>
      <p>{adapt.status.detail}</p>
      {adapt.changes.length > 0 && (
        <details open={adapt.changes.length <= 2}>
          <summary>What changed this week, and why</summary>
          <ul className="wp-list">{adapt.changes.map((c) => <li key={c.id}><b>{c.title}.</b> <span className="wp-muted">{c.detail}</span></li>)}</ul>
        </details>
      )}
      {adapt.suggestions.map((sg) => (
        <div key={sg.id} className={`wp-sugg${sg.level === "alert" ? " alert" : ""}`} role={sg.level === "alert" ? "alert" : undefined}>
          <b>{sg.title}</b>
          <p className="wp-muted">{sg.detail} {sg.why ? <i>{sg.why}</i> : null}</p>
          {sg.apply && <button type="button" className="wp-btn soft" disabled={busy} onClick={() => onApply(sg.apply)}>Yes, update my plan</button>}
        </div>
      ))}
      <details>
        <summary>Is it working?</summary>
        <p className="wp-muted">{b.detail}</p>
        {b.ratePerWeekKg !== null && <p className="wp-muted">Weight trend: {b.ratePerWeekKg > 0 ? "+" : ""}{b.ratePerWeekKg} kg a week{b.waistChangeCm !== null ? ` · waist ${b.waistChangeCm > 0 ? "+" : ""}${b.waistChangeCm} cm over 5 weeks` : ""}{b.liftsTracked ? ` · ${b.liftsProgressing} of ${b.liftsTracked} lifts moving up` : ""}</p>}
        <p className="wp-muted">Cardio this week: {adapt.cardio.doneMin} of {adapt.cardio.targetMin} minutes (builds toward {adapt.cardio.fullTargetMin}).</p>
      </details>
    </section>
  );
}
