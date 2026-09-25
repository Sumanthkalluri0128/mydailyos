let resolver = null;

export function confirmAction(message, options = {}) {
  return new Promise((resolve) => {
    if (resolver) {
      resolver(false);
    }

    resolver = resolve;

    window.dispatchEvent(
      new CustomEvent("mydailyos:confirm", {
        detail: {
          message: String(message || ""),
          title: options.title || "Are you sure?",
          confirmText: options.confirmText || "Confirm",
          cancelText: options.cancelText || "Cancel",
          danger: options.danger !== false,
        },
      })
    );
  });
}

export function resolveConfirm(value) {
  if (resolver) {
    const current = resolver;
    resolver = null;
    current(Boolean(value));
  }
}
