import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";

// Loads a rarely-needed overlay (the assistant, the quick-add palette) AFTER the first screen is up, so it does not weigh on the first load.
// It mounts when the browser is idle, or at once when the person asks for it (an event or a key). The request that caused the mount is
// replayed after the code arrives, so the first tap on "Ask FlexFit" or the first Ctrl+K is never lost.
//   events:  window event names that mean "I want it now" (replayed as the same event)
//   keys:    (KeyboardEvent) => boolean for shortcuts that mean the same (replayed as the same key)
export default function LateMount({ load, events = [], keys, delay = 1800, ...props }) {
  const Lazy = useMemo(() => lazy(load), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [on, setOn] = useState(false);
  const pending = useRef(null);

  useEffect(() => {
    if (on) return undefined;
    const idle = window.requestIdleCallback ? (fn) => window.requestIdleCallback(fn, { timeout: delay }) : (fn) => setTimeout(fn, delay);
    const h = idle(() => setOn(true));
    const ask = (e) => { pending.current = e; setOn(true); };
    const key = (e) => { if (keys && keys(e)) { pending.current = e; setOn(true); } };
    events.forEach((n) => window.addEventListener(n, ask));
    window.addEventListener("keydown", key);
    return () => {
      if (window.cancelIdleCallback && typeof h === "number") window.cancelIdleCallback(h); else clearTimeout(h);
      events.forEach((n) => window.removeEventListener(n, ask));
      window.removeEventListener("keydown", key);
    };
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!on) return null;
  return (
    <Suspense fallback={null}>
      <Lazy {...props} />
      <Replay pending={pending} />
    </Suspense>
  );
}

// Mounts after the lazy component (a later sibling), when its listeners exist; then repeats what the person did.
function Replay({ pending }) {
  useEffect(() => {
    const e = pending.current; pending.current = null;
    if (!e) return;
    window.dispatchEvent(e instanceof KeyboardEvent ? new KeyboardEvent("keydown", { key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, bubbles: true }) : new CustomEvent(e.type, { detail: e.detail }));
  }, [pending]);
  return null;
}
