import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AuthGate from "./auth/AuthGate";
import ToastHost from "./components/ToastHost";
import ConfirmHost from "./components/ConfirmHost";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastHost />
    <ConfirmHost />
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>
);
