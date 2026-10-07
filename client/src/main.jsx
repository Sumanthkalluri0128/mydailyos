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
import "./motion/motion.css"; // animation kit: last so its press/reduced-motion rules win

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
  setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastHost />
    <ConfirmHost />
    <ServerWakeBanner />
    <OfflineBanner />
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>
);

// Offline support: the service worker caches the app shell so the site opens with no connection (production builds only).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* unsupported / blocked: the site still works online */ });
  });
}
