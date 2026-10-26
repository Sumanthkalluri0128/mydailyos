// Browser reminders for medicines while FlexFit is open (opt-in in Health > Medicines > Manage). Quiet hours are respected by the server:
// anything that would ring between 22:00 and 07:00 moves to 07:00. No sound, no background service: when the tab is closed nothing rings.
import { useEffect } from "react";
import { API_URL } from "../config";
import { apiFetch } from "../config/api";
import { getLocalDate } from "../utils/date";
import { notify } from "../utils/notify";
import { NOTIFY_KEY } from "./Medicines";

export default function MedReminderHost() {
  useEffect(() => {
    let timers = []; let alive = true;
    const clear = () => { timers.forEach(clearTimeout); timers = []; };
    const plan = async () => {
      clear();
      let on = false; try { on = localStorage.getItem(NOTIFY_KEY) === "1" && typeof Notification !== "undefined" && Notification.permission === "granted"; } catch { /* ignore */ }
      if (!on) return;
      const d = new Date(); const now = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      try {
        const r = await apiFetch(`${API_URL}/api/meds/reminders?date=${getLocalDate()}&now=${now}`); const j = await r.json();
        if (!alive || !j.success) return;
        for (const x of j.reminders.filter((q) => !q.nextDay)) {
          const [h, m] = x.at.split(":").map(Number); const ms = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime() - Date.now();
          if (ms <= 0 || ms > 12 * 3600e3) continue;
          timers.push(setTimeout(() => {
            const body = `${x.name}${x.dose ? ` · ${x.dose}` : ""}`;
            try { new Notification("Medicine reminder", { body, silent: true }); } catch { notify(`Reminder: ${body}`, "info", 8000); }
          }, ms));
        }
      } catch { /* offline: try again at the next refresh */ }
    };
    plan();
    const again = setInterval(plan, 30 * 60e3);
    window.addEventListener("ff:meds", plan);
    return () => { alive = false; clear(); clearInterval(again); window.removeEventListener("ff:meds", plan); };
  }, []);
  return null;
}
