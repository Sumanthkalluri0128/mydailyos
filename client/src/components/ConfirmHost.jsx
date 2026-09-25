import { useEffect, useState } from "react";
import { resolveConfirm } from "../utils/confirm";
import "./confirm.css";

export default function ConfirmHost() {
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    const onConfirm = (event) => {
      setDialog(event.detail || null);
    };

    window.addEventListener("mydailyos:confirm", onConfirm);

    return () => {
      window.removeEventListener("mydailyos:confirm", onConfirm);
    };
  }, []);

  if (!dialog) return null;

  const close = (value) => {
    setDialog(null);
    resolveConfirm(value);
  };

  return (
    <div className="confirm-backdrop" role="presentation">
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mydailyos-confirm-title"
      >
        <div className="confirm-icon" aria-hidden="true">
          {dialog.danger ? "!" : "?"}
        </div>

        <h2 id="mydailyos-confirm-title">{dialog.title}</h2>
        <p>{dialog.message}</p>

        <div className="confirm-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => close(false)}
          >
            {dialog.cancelText}
          </button>

          <button
            type="button"
            className={dialog.danger ? "danger-button" : "primary-button"}
            onClick={() => close(true)}
          >
            {dialog.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
