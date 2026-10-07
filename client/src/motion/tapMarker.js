// Shows a dot + ring exactly where you press, on mouse and touch. Call once at start-up.
export function installTapMarker() {
  if (typeof document === "undefined" || window.__ffTap) return;
  window.__ffTap = true;
  document.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const m = document.createElement("span");
    m.className = "ff-tap";
    m.style.left = `${e.clientX}px`;
    m.style.top = `${e.clientY}px`;
    m.innerHTML = "<b></b><i></i>";
    document.body.appendChild(m);
    setTimeout(() => m.remove(), 750);
  }, { capture: true, passive: true });
}
