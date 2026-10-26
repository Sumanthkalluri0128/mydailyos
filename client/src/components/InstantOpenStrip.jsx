// Shown while the dashboard is painted from the last saved copy: the day's character and "updated X min ago".
// The server may still be waking up (free hosting), so the numbers are real but possibly a little old.
import { useEffect, useState } from "react";
import Buddy from "../motion/Buddy";
import { ageLabel, freshness } from "../utils/freshness";

export default function InstantOpenStrip({ at, refreshing }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  const label = ageLabel(at, now);
  if (!label) return null;
  return (
    <div className={`io-strip io-${freshness(at, now)}`} role="status" aria-live="polite">
      <Buddy scene="wave" size={40} talk={false} />
      <span><strong>Your last saved day</strong> · updated {label}{refreshing ? " · refreshing…" : ""}</span>
    </div>
  );
}
