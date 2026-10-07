import { useEffect, useState } from "react";
import { API_URL } from "../config";
import "./offlineBanner.css";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IDLE_MS = 10 * 60 * 1000; // free hosting sleeps after ~15 min; re-check if the tab was away this long

// Pings /api/health as soon as the app opens (so the server starts waking before the first real request) and, if it takes
// more than a couple of seconds, says what is happening instead of leaving a blank screen.
export default function ServerWakeBanner() {
  const [waking, setWaking] = useState(false);
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let hiddenAt = 0;

    const wake = async () => {
      const t0 = Date.now();
      const show = setTimeout(() => !cancelled && setWaking(true), 2500);
      const tick = setInterval(() => setSecs(Math.round((Date.now() - t0) / 1000)), 1000);
      for (let attempt = 0; attempt < 10 && !cancelled; attempt += 1) {
        const ctl = new AbortController();
        const abort = setTimeout(() => ctl.abort(), 70000);
        try {
          const r = await fetch(`${API_URL}/api/health`, { cache: "no-store", signal: ctl.signal });
          clearTimeout(abort);
          if (r.ok) break;
        } catch {
          clearTimeout(abort);
          if (!navigator.onLine) break; // genuinely offline: the offline banner handles that
        }
        await sleep(2500);
      }
      clearTimeout(show);
      clearInterval(tick);
      if (!cancelled) { setWaking(false); setSecs(0); }
    };

    const onVisibility = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > IDLE_MS) { hiddenAt = 0; wake(); }
    };
    wake();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  if (!waking) return null;
  return (
    <div className="offline-banner warn" role="status" aria-live="polite">
      <span>⏳ Waking up the server{secs > 0 ? ` (${secs}s)` : ""}… free hosting sleeps when idle, this takes up to a minute. Your saved data is shown meanwhile.</span>
    </div>
  );
}
