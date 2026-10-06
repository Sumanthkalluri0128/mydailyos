import { useEffect, useState } from "react";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";
import { getLocalDate } from "../utils/date";
import "../auth/account.css";

// Dietitian report (PDF) + opt-in weekly progress email.
export default function ReportControls() {
  const [days, setDays] = useState(30);
  const [diary, setDiary] = useState(true);
  const [weekly, setWeekly] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch("/api/profile").then((r) => r.json()).then((d) => d.success && setWeekly(!!d.profile?.notify?.weeklyEmail)).catch(() => {});
  }, []);

  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { notify(e.message || "Something went wrong", "error"); } finally { setBusy(false); } };

  const downloadPdf = () => run(async () => {
    const to = getLocalDate();
    const d = new Date(); d.setDate(d.getDate() - (days - 1));
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const res = await apiFetch(`/api/account/report.pdf?from=${from}&to=${to}&diary=${diary}`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Could not create the report");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = `flexfit-report-${from}_${to}.pdf`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  const toggleWeekly = (on) => run(async () => {
    const res = await apiFetch("/api/profile", { method: "PATCH", body: JSON.stringify({ notify: { weeklyEmail: on } }) });
    if (!res.ok) throw new Error("Could not save that setting");
    setWeekly(on);
    notify(on ? "You'll get a summary email every Monday." : "Weekly emails are off.", "success");
  });

  const sendNow = () => run(async () => {
    const res = await apiFetch("/api/progress/weekly/email", { method: "POST", body: JSON.stringify({ end: getLocalDate() }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.message || "Could not send the email");
    notify(d.message || "Sent.", "success");
  });

  return (
    <div className="account-form data-controls">
      <h2>Reports & emails</h2>
      <p className="card-description">Share a clean PDF with your dietitian or doctor, or get a weekly summary by email.</p>
      <div className="data-actions">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Report length">
          <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
        </select>
        <label><input type="checkbox" checked={diary} onChange={(e) => setDiary(e.target.checked)} /> Include food diary</label>
        <button className="secondary-button" disabled={busy} onClick={downloadPdf}>⬇ Dietitian report (PDF)</button>
      </div>
      <label className="toggle-row"><input type="checkbox" checked={weekly} disabled={busy} onChange={(e) => toggleWeekly(e.target.checked)} /> Email me a weekly summary every Monday</label>
      <button className="secondary-button" disabled={busy} onClick={sendNow}>✉️ Email me this week's summary now</button>
    </div>
  );
}
