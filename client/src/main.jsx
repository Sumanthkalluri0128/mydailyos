import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AuthGate from "./auth/AuthGate";
import ToastHost from "./components/ToastHost";
import ConfirmHost from "./components/ConfirmHost";
import "./index.css";

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
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>
);
