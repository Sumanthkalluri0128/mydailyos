import { useEffect, useState } from "react";
import "./fatloss.css";
import { apiFetch } from "../config/api";
import { getLocalDate } from "../utils/date";

// Correlations in the person's OWN data (sleep, skipped breakfast, quiet days, the heaviest weekday).
export default function PatternsCard() {
  const [d, setD] = useState(null);
  useEffect(() => { apiFetch(`/api/plan/patterns?today=${getLocalDate()}`).then((r) => (r.ok ? r.json() : null)).then((j) => j?.success && setD(j)).catch(() => {}); }, []);
  if (!d) return null;
  return (
    <div className="fl-card">
      <h3>Patterns in your own data</h3>
      {d.insights.length === 0 && <p>Keep logging and patterns will appear here. They need a few weeks of data{d.hasSleep ? "" : ", and sleep from Health Connect on the phone app makes them much sharper"}.</p>}
      {d.insights.map((i) => <div key={i.id} className="fl-find"><span aria-hidden="true">{i.icon}</span><div><strong>{i.title}</strong><p>{i.detail}</p></div></div>)}
    </div>
  );
}
