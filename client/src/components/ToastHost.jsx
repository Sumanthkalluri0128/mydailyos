import { useEffect, useState } from "react";
import "./toast.css";

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
          <span className="toast-icon" aria-hidden="true">
            {toast.type === "success"
              ? "✓"
              : toast.type === "error"
                ? "!"
                : toast.type === "warning"
                  ? "⚠"
                  : "i"}
          </span>
          <span className="toast-message">{toast.message}</span>
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
