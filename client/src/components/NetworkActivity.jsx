import { useSyncExternalStore } from "react";
import { subscribe, getActivity } from "../utils/netActivity";
import "./networkActivity.css";

/**
 * Always answers "is something running?". Nothing for fast requests; after 0.7 s a thin moving bar and a small pill
 * ("Saving..."), after 5 s it says the server is slow but the entry is safe, and while the server is waking up it says so.
 * It never blocks a tap: the screen stays usable underneath.
 */
export default function NetworkActivity() {
  const a = useSyncExternalStore(subscribe, getActivity, getActivity);
  if (a.phase === "idle") return null;
  return (
    <div className={`net-activity ${a.phase}`} role="status" aria-live="polite">
      <div className="net-activity-bar" aria-hidden="true" />
      <div className="net-activity-pill">
        <span className="net-activity-spin" aria-hidden="true" />
        <span>{a.message}</span>
      </div>
    </div>
  );
}
