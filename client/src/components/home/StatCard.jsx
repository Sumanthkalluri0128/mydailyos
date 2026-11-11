// ONE stat card for Home (water, steps, exercise, weight). Web and mobile share the same props, so sticker size,
// the ＋ button slot and the corner rules live here once instead of in per-card CSS.
//   kind: "water" | "steps" | "ex" | "w"  (colour only)    icon / tint: the badge    plus: { label, onClick, tour } adds the ＋ shortcut
//   Cards with a ＋ need ~190px for badge + ＋ + sticker; the stylesheet keys that off .sc-has-plus, never off the card's name.
import ErrorBoundary from "../ErrorBoundary";
export default function StatCard(props) {
  return <ErrorBoundary scope="home-card" name={`StatCard:${props.kind}`}><StatCardInner {...props} /></ErrorBoundary>;
}
import { apiFetch } from "../../config/api";
// Counts one open per card (name only, no person): tells you which Home cards nobody uses.
const countOpen = (kind) => { try { apiFetch("/api/telemetry/card", { method: "POST", body: JSON.stringify({ card: kind }) }).catch(() => {}); } catch { /* ignore */ } };
function StatCardInner({ kind, icon, tint, onOpen: open, plus, sticker, children }) {
  const onOpen = (e) => { if (e && e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return; countOpen(kind); if (open) open(e); };
  return (
    <article className={`sc sc-${kind}${plus ? " sc-has-plus" : ""}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={onOpen}>
      <span className={`ic ${tint} big`}>{icon}</span>
      {plus && <button type="button" className="sc-plus" data-tour={plus.tour} aria-label={plus.label} onClick={(e) => { e.stopPropagation(); plus.onClick(); }}>＋</button>}
      {children}
      {sticker}
    </article>
  );
}

/** The thin progress bar every card uses. */
export function StatBar({ pct }) {
  return <i className="sc-bar"><b style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></i>;
}
