export function notify(message, type = "info", duration = 3200) {
  window.dispatchEvent(
    new CustomEvent("mydailyos:toast", {
      detail: {
        message: String(message || ""),
        type,
        duration,
      },
    })
  );
}
