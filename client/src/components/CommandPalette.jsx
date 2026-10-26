// Ctrl/Cmd+K quick add (food, water, weight, workout, go to a page) and the "?" shortcuts list. Keyboard first, wide screens first.
import { useEffect, useMemo, useRef, useState } from "react";
import { API_URL } from "../config";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";
import { getLocalDate } from "../utils/date";
import { parseCommand, PAGE_WORDS } from "../utils/quickCommand";
import { isVisible } from "../utils/features";
import { sprite } from "../motion/chars";
import { useT } from "../i18n";
import "./palette.css";

const ICON = { water: ["gojo", "drink"], weight: ["zoro", "scale"], food: ["luffy", "eat"], workout: ["goku", "lift"], goto: ["kakashi", "plan"] };
const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;

async function run(cmd, go, t) {
  const today = getLocalDate();
  const post = (path, body) => apiFetch(`${API_URL}${path}`, { method: "POST", body: JSON.stringify(body) }).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok || j.success === false) throw new Error(j.message || "Could not save that"); return j; });
  try {
    if (cmd.kind === "water") { await post("/api/water", { date: today, amountMl: cmd.ml }); notify(t("palette.done.water", { n: cmd.ml }), "success"); window.dispatchEvent(new Event("ff:refresh")); }
    else if (cmd.kind === "weight") { await post("/api/weight", { date: today, weightKg: cmd.kg }); notify(t("palette.done.weight", { n: cmd.kg }), "success"); window.dispatchEvent(new Event("ff:refresh")); }
    else if (cmd.kind === "workout") {
      const r = await apiFetch(`${API_URL}/api/activities`); const j = await r.json(); const list = j.activities || [];
      const pick = (cmd.name && list.find((a) => a.name.toLowerCase().includes(cmd.name.toLowerCase()))) || list.find((a) => /walk/i.test(a.name)) || list[0];
      if (!pick) throw new Error("No activity found. Open Exercise to add one.");
      await post("/api/activities/logs", { activityId: pick._id, date: today, durationMinutes: cmd.minutes });
      notify(t("palette.done.workout", { n: cmd.minutes }) + ` · ${pick.name}`, "success"); window.dispatchEvent(new Event("ff:refresh"));
    }
    else if (cmd.kind === "food") { try { sessionStorage.setItem("ff_palette_food", cmd.query); } catch { /* ignore */ } go("foodLogger"); }
    else if (cmd.kind === "goto") go(cmd.page);
  } catch (e) { notify(e.message, "error"); }
}

export default function CommandPalette({ go }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  const lastG = useRef(0);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setHelp(false); setOpen((o) => !o); setQ(""); setSel(0); return; }
      if (e.key === "Escape") { setOpen(false); setHelp(false); return; }
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "?") { e.preventDefault(); setOpen(false); setHelp((h) => !h); return; }
      if (e.key.toLowerCase() === "g") { lastG.current = Date.now(); return; }
      if (Date.now() - lastG.current < 900) {
        const page = { h: "dashboard", f: "foodLogger", p: "planner", r: "progress" }[e.key.toLowerCase()];
        if (page) { lastG.current = 0; go(page); }
      }
    };
    const openIt = () => { setHelp(false); setOpen(true); setQ(""); setSel(0); };
    window.addEventListener("keydown", onKey); window.addEventListener("ff:palette", openIt);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("ff:palette", openIt); };
  }, [go]);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 0); }, [open]);

  const rows = useMemo(() => {
    const cmd = parseCommand(q);
    const base = [
      { key: "water", cmd: { kind: "water", ml: 250 }, label: `${t("palette.water")} · 250 ml`, ic: "water" },
      { key: "weight", cmd: null, label: `${t("palette.weight")} · weight 70.5`, ic: "weight", fill: "weight " },
      { key: "food", cmd: null, label: `${t("palette.food")} · food rice`, ic: "food", fill: "food " },
      { key: "workout", cmd: { kind: "workout", minutes: 30, name: "" }, label: `${t("palette.workout")} · 30 min`, ic: "workout" },
    ];
    if (cmd) {
      const label = cmd.kind === "water" ? `${t("palette.water")} · ${cmd.ml} ml` : cmd.kind === "weight" ? `${t("palette.weight")} · ${cmd.kg} kg` : cmd.kind === "workout" ? `${t("palette.workout")} · ${cmd.minutes} min${cmd.name ? ` · ${cmd.name}` : ""}` : cmd.kind === "food" ? `${t("palette.food")} · ${cmd.query}` : t("palette.goto", { page: Object.keys(PAGE_WORDS).find((k) => PAGE_WORDS[k] === cmd.page) || cmd.page });
      return [{ key: "cmd", cmd, label, ic: cmd.kind }];
    }
    const pages = Object.entries(PAGE_WORDS).filter(([, id], i, a) => a.findIndex((x) => x[1] === id) === i && (id === "profile" || isVisible(id)));
    const goRows = pages.filter(([w]) => !q.trim() || w.includes(q.trim().toLowerCase())).slice(0, 6).map(([w, id]) => ({ key: `go-${id}`, cmd: { kind: "goto", page: id }, label: t("palette.goto", { page: w }), ic: "goto" }));
    return q.trim() ? goRows : [...base, ...goRows.slice(0, 3)];
  }, [q, t]);

  const exec = async (r) => {
    if (r.fill) { setQ(r.fill); setSel(0); input.current?.focus(); return; }
    if (!r.cmd) return;
    setOpen(false); await run(r.cmd, go, t);
  };
  const onInputKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(rows.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (rows[sel]) exec(rows[sel]); }
  };

  if (help) {
    const KEYS = [["Ctrl / ⌘ + K", t("keys.palette")], ["?", t("keys.help")], ["Esc", t("keys.close")], ["g  then  h / f / p / r", t("keys.goto")]];
    return (
      <div className="pal-wrap" onClick={() => setHelp(false)}>
        <div className="pal pal-help" role="dialog" aria-label={t("keys.title")} onClick={(e) => e.stopPropagation()}>
          <h3>{t("keys.title")}</h3>
          <dl>{KEYS.map(([k, d]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{d}</dd></div>)}</dl>
        </div>
      </div>
    );
  }
  if (!open) return null;
  return (
    <div className="pal-wrap" onClick={() => setOpen(false)}>
      <div className="pal" role="dialog" aria-label={t("palette.title")} onClick={(e) => e.stopPropagation()}>
        <input ref={input} className="pal-input" value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onInputKey} placeholder={t("palette.placeholder")} aria-label={t("palette.title")} aria-controls="pal-list" autoComplete="off" />
        <ul id="pal-list" className="pal-list" role="listbox">
          {rows.length === 0 && <li className="pal-empty">{t("palette.empty")}</li>}
          {rows.map((r, i) => (
            <li key={r.key} role="option" aria-selected={i === sel} className={i === sel ? "on" : ""} onMouseEnter={() => setSel(i)} onClick={() => exec(r)}>
              <img src={sprite(ICON[r.ic][0], ICON[r.ic][1], r.key)} alt="" width="32" height="32" loading="lazy" />
              <span>{r.label}</span>
            </li>
          ))}
        </ul>
        <small className="pal-hint">{t("palette.hint")} · <button type="button" className="link-button" onClick={() => { setOpen(false); setHelp(true); }}>?</button></small>
      </div>
    </div>
  );
}
