import { useEffect, useState } from "react";
import "./toast.css";
import Buddy, { sceneForText } from "../motion/Buddy";

export default function ToastHost() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const onToast = (event) => {
      const detail = event.detail || {};
      const id = `${Date.now()}-${Math.random()}`;

      setToasts((current) => [
        ...current,
        {
          id,
          message: detail.message,
          type: detail.type || "info",
          kind: detail.kind,
          sub: detail.sub,
          action: detail.action,
        },
      ]);

      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, Number(detail.duration) || 3200);
    };

    window.addEventListener("mydailyos:toast", onToast);
    return () => window.removeEventListener("mydailyos:toast", onToast);
  }, []);

  function close(id) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}`}
          role={toast.type === "error" ? "alert" : "status"}
        >
          {toast.kind === "undo" || toast.kind === "undone" ? (
            <Buddy scene={toast.kind === "undo" ? "health" : "cheer"} size={46} label="" who="kakashi" talk={false} />
          ) : toast.type === "success" || toast.type === "error" || toast.type === "warning" ? (
            <Buddy scene={sceneForText(toast.message, toast.type)} size={46} label="" />
          ) : (
            <span className="toast-icon" aria-hidden="true">i</span>
          )}
          <span className="toast-message">{toast.message}{toast.sub && <small className="toast-sub">{toast.sub}</small>}</span>
          {toast.action && (
            <button type="button" className="toast-action" onClick={() => { toast.action.onClick?.(); close(toast.id); }}>{toast.action.label}</button>
          )}
          <button
            type="button"
            className="toast-close"
            onClick={() => close(toast.id)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
