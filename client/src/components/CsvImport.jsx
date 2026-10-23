import { useState } from "react";
import { API_URL } from "../config";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";
import "./logging2.css";

const LABEL = { date: "Date", meal: "Meal", food: "Food name", calories: "Calories", protein: "Protein", carbohydrates: "Carbs", fat: "Fat", fiber: "Fibre", sugar: "Sugar", sodium: "Sodium", weight: "Weight" };

// Import food logs or weight history from another app's CSV: choose columns, see a dry-run summary, then confirm. Same file twice adds nothing.
export default function CsvImport() {
  const [csv, setCsv] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("");
  const [mapping, setMapping] = useState(null);
  const [order, setOrder] = useState("dmy");
  const [pv, setPv] = useState(null);
  const [busy, setBusy] = useState(false);

  const call = async (path, over = {}) => {
    const body = { csv, kind: over.kind ?? (kind || undefined), mapping: over.mapping ?? mapping ?? undefined, dateOrder: over.order ?? order };
    const r = await apiFetch(`${API_URL}/api/import/${path}`, { method: "POST", body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || "Could not read that file");
    return j;
  };
  const preview = async (over = {}) => {
    setBusy(true);
    try { const j = await call("preview", over); setPv(j); setKind(j.kind); setMapping(j.mapping); } catch (e) { notify(e.message, "error"); setPv(null); } finally { setBusy(false); }
  };
  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 3_000_000) return notify("That file is over 3 MB. Split it into smaller files.", "error");
    const rd = new FileReader();
    rd.onload = () => { setCsv(String(rd.result)); setName(f.name); setPv(null); setMapping(null); setKind(""); };
    rd.readAsText(f);
  };
  const setCol = (field, v) => { const m = { ...mapping }; if (v === "") delete m[field]; else m[field] = Number(v); setMapping(m); preview({ mapping: m }); };
  const commit = async () => {
    setBusy(true);
    try { const j = await call("commit"); notify(`Imported ${j.saved}. Skipped ${j.skippedDuplicates} already here and ${j.skippedProblems} with problems.`, "success"); setPv(null); setCsv(""); setName(""); }
    catch (e) { notify(e.message, "error"); } finally { setBusy(false); }
  };
  const s = pv?.summary;
  return (
    <div className="large-card csv-import">
      <h3>Import from another app</h3>
      <p className="card-description">Works with CSV files from MyFitnessPal, HealthifyMe or any spreadsheet. Export formats change, so you check the columns before anything is saved.</p>
      <input type="file" accept=".csv,text/csv" onChange={onFile} aria-label="Choose a CSV file" />
      {csv && <button className="secondary-button" disabled={busy} onClick={() => preview()}>Read {name}</button>}
      {pv && (
        <>
          <div className="repeat-row">
            <label>It contains <select value={kind} onChange={(e) => { setKind(e.target.value); preview({ kind: e.target.value, mapping: undefined }); }}><option value="food">Food logs</option><option value="weight">Weight history</option></select></label>
            <label>Dates like 03/04/2026 are <select value={order} onChange={(e) => { setOrder(e.target.value); preview({ order: e.target.value }); }}><option value="dmy">day / month</option><option value="mdy">month / day</option></select></label>
          </div>
          <div className="csv-map">
            {pv.fields.map((f) => { const key = f === "weight" ? "weight" : f; return (
              <label key={f} style={{ display: "contents" }}><span>{LABEL[f] || f}</span>
                <select value={mapping?.[key] ?? ""} onChange={(e) => setCol(key, e.target.value)}><option value="">(not in file)</option>{pv.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}</select></label>
            ); })}
          </div>
          {pv.missing.length > 0 && <p className="warn-line">Choose the {pv.missing.join(" and ")} column to continue.</p>}
          {s && (
            <div className="fit-preview" role="status">
              <strong>Dry run: nothing is saved yet</strong>
              <p>{s.toImport} to import{s.from ? `, ${s.from} to ${s.to} (${s.days} day${s.days === 1 ? "" : "s"})` : ""}. {s.duplicates} already in the app, {s.problems} with problems.{s.totalKcal !== undefined ? ` ${s.totalKcal.toLocaleString()} kcal in total.` : ""}</p>
              {s.ambiguousDates > 0 && <p className="warn-line">{s.ambiguousDates} dates could be read two ways. Check the day / month setting above.</p>}
              {s.blankMacros > 0 && <p className="warn-line">{s.blankMacros} protein, carb or fat cells were blank and are saved as 0, not guessed.</p>}
              {s.problemSample.map((p) => <p key={p.line} className="warn-line">Row {p.line}: {p.message}</p>)}
              {s.sample.length > 0 && <small>First rows: {s.sample.slice(0, 4).map((r) => `${r.date} ${r.name || `${r.weightKg} kg`}`).join(" · ")}</small>}
              <button className="primary-button" disabled={busy || !s.toImport} onClick={commit}>Import {s.toImport}</button>
            </div>
          )}
          <small>{pv.cultNote}</small>
        </>
      )}
    </div>
  );
}
