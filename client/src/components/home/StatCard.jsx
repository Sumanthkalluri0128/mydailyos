// ONE stat card for Home (water, steps, exercise, weight). Web and mobile share the same props, so sticker size,
// the ＋ button slot and the corner rules live here once instead of in per-card CSS.
//   kind: "water" | "steps" | "ex" | "w"  (colour only)    icon / tint: the badge    plus: { label, onClick, tour } adds the ＋ shortcut
//   Cards with a ＋ need ~190px for badge + ＋ + sticker; the stylesheet keys that off .sc-has-plus, never off the card's name.
export default function StatCard({ kind, icon, tint, onOpen, plus, sticker, children }) {
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
