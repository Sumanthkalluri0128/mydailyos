import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AuthGate from "./auth/AuthGate";
import ToastHost from "./components/ToastHost";
import ConfirmHost from "./components/ConfirmHost";
import OfflineBanner from "./components/OfflineBanner";
import ServerWakeBanner from "./components/ServerWakeBanner";
import "./index.css";
import "./styles/redesign.css"; // refines App.css without replacing it
import "./motion/motion.css"; // older animation kit (mostly switched off, see buddy.css)
import "./motion/stickers.css";
import "./motion/base.css"; // speech bubble, tap marker, calm mode: last so it wins
import "./motion/fun.css"; // animated backdrop + lively UI motion
import "./styles/polish.css"; // logging/profile layout tidy-up
import "./styles/stability.css"; // last: nothing moves, hides or blocks what you tap
import FunBackdrop from "./motion/FunBackdrop";
import Companions from "./motion/Companions";
import { installTapMarker } from "./motion/tapMarker";
import { setTelemetry } from "./offline/offlineApi";
import { report } from "./utils/telemetryClient";
import ErrorBoundary from "./components/ErrorBoundary";
import { installChunkRecovery } from "./utils/chunkRecovery";

installChunkRecovery(); // an old tab after a new deploy reloads itself once instead of going blank

setTelemetry(report); // lets the offline layer say when a sync failed or a change had to be dropped

installTapMarker();
try { if (localStorage.getItem("ff_calm_motion") === "1") document.documentElement.classList.add("ff-calm"); } catch { /* ignore */ }

// Apply the saved theme BEFORE anything renders, so the sign-in / reset pages (which render outside <App />) honour it too.
try {
  const saved = localStorage.getItem("mydailyos_theme");
  if (saved === "light" || saved === "dark") document.documentElement.setAttribute("data-theme", saved);
} catch { /* privacy mode: fall back to the system setting */ }

// On phones the on-screen keyboard can cover the field being typed in. When a field gains
// focus, wait for the keyboard to open, then scroll that field to the middle of the view.
document.addEventListener("focusin", (event) => {
  const el = event.target;
  if (!(el instanceof HTMLElement) || !el.matches("input, textarea, select")) return;
  if (!window.matchMedia("(pointer: coarse)").matches) return;
  setTimeout(() => {
    if (!el.isConnected || el.closest('[aria-modal="true"], .wp-sheet, .nv-sheet')) return; // sheets handle their own scrolling
    const vv = window.visualViewport; const r = el.getBoundingClientRect();
    const top = 64, bottom = (vv ? vv.height : window.innerHeight) - 8;
    if (r.top < top || r.bottom > bottom) el.scrollIntoView({ block: "center", behavior: "auto" });
  }, 300);
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <FunBackdrop />
    <ToastHost />
    <Companions />
    <ConfirmHost />
    <ServerWakeBanner />
    <OfflineBanner />
    <ErrorBoundary scope="tab" name="root">
      <AuthGate>
        <App />
      </AuthGate>
    </ErrorBoundary>
  </React.StrictMode>
);

// Offline support: the service worker caches the app shell so the site opens with no connection (production builds only).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* unsupported / blocked: the site still works online */ });
  });
}
