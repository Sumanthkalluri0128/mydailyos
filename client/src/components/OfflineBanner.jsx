import { useEffect, useState, useSyncExternalStore } from "react";
import { getOfflineState, subscribeOffline } from "../offline/offlineApi";
import { syncNow } from "../config/api";
import "./offlineBanner.css";

/** One calm strip at the top: offline / changes waiting / syncing. Disappears when everything is up to date. */
export default function OfflineBanner() {
  const s = useSyncExternalStore(subscribeOffline, getOfflineState, getOfflineState);
  const [justSynced, setJustSynced] = useState(false);

  useEffect(() => {
    const done = () => { setJustSynced(true); window.setTimeout(() => setJustSynced(false), 2500); };
    window.addEventListener("flexfit:synced", done);
    return () => window.removeEventListener("flexfit:synced", done);
  }, []);

  let text = "", tone = "info", action = null;
  if (!s.online) { text = s.pending ? `You're offline · ${s.pending} change${s.pending > 1 ? "s" : ""} saved, will sync when you're back` : "You're offline · showing your last saved data"; tone = "warn"; }
  else if (s.syncing) text = "Syncing your changes…";
  else if (s.pending) { text = `${s.pending} change${s.pending > 1 ? "s" : ""} waiting to sync`; action = <button type="button" onClick={() => syncNow()}>Sync now</button>; }
  else if (s.lastError) { text = s.lastError; tone = "warn"; }
  else if (justSynced) { text = "All changes synced ✓"; tone = "ok"; }
  if (!text) return null;

  return (
    <div className={`offline-banner ${tone}`} role="status" aria-live="polite">
      <span>{text}</span>
      {action}
    </div>
  );
}
