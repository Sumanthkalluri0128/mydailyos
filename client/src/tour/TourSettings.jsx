// Profile > Help: replay the tour, and switch tours and tips off or on.
import { setNever, startTour, useTour } from "./store";

export default function TourSettings({ onStart }) {
  const t = useTour();
  return (
    <section className="card" style={{ display: "grid", gap: 10, padding: 16, margin: "12px 0" }} aria-label="Help and tour">
      <h3 style={{ margin: 0 }}>Help and tour</h3>
      <button type="button" className="secondary-button" style={{ minHeight: 44 }} onClick={() => { startTour("profile"); onStart && onStart(); }}>🧭 Take the app tour (1 min)</button>
      <label style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 44 }}>
        <input type="checkbox" checked={!!t.never} onChange={(e) => setNever(e.target.checked)} />
        <span>Don’t show tours or tips again</span>
      </label>
      <p style={{ margin: 0, opacity: 0.75, fontSize: ".9rem" }}>You can always replay a screen’s tips with the ? button on that screen.</p>
    </section>
  );
}
