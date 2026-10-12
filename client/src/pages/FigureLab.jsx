// Figure lab: open the app with #figures on the address (no sign-in needed) to look at the whole 3D set,
// the suggested mix per screen, and tick the ones you want. Picks are copied as text to send back.
import { useMemo, useState } from "react";
import { CHARS, FIG_WHO, FIG_POSES, figure } from "../motion/chars";
import Buddy from "../motion/Buddy";

const MIX = [
  ["Welcome / Profile", "goku", "say"], ["Exercise screen", "zoro", "workout"], ["Bodyweight / empty exercise", "naruto", "workout"],
  ["Food logging", "luffy", "eat"], ["Water", "tanjiro", "drink"], ["Health & Steps", "inosuke", "walk"],
  ["Habits & streaks", "zenitsu", "dance"], ["Sleep tab", "gojo", "sleep"], ["Progress / tips", "kakashi", "study"], ["Badges & level up", "jinwoo", "sit"],
];
const POSE_LABEL = { say: "Say Hi", dance: "Dance", eat: "Eat", drink: "Drink", workout: "Workout", walk: "Walk", sit: "Sit", study: "Study", phone: "Phone", sleep: "Sleep" };

export default function FigureLab() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute("data-theme") || "dark");
  const [picked, setPicked] = useState(() => new Set(MIX.map(([, w, p]) => `${w}-${p}`)));
  const [who, setWho] = useState("all");
  const [copied, setCopied] = useState(false);
  const flip = () => { const t = theme === "dark" ? "light" : "dark"; setTheme(t); document.documentElement.setAttribute("data-theme", t); try { localStorage.setItem("mydailyos_theme", t); } catch { /* ignore */ } };
  const toggle = (k) => setPicked((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const list = useMemo(() => [...picked].sort().join(", "), [picked]);
  const copy = async () => { try { await navigator.clipboard.writeText(list); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { window.prompt("Copy your picks:", list); } };
  const shown = who === "all" ? FIG_WHO : [who];
  const card = { background: "var(--surface, rgba(128,128,160,.12))", border: "1px solid rgba(128,128,160,.25)", borderRadius: 16, padding: 12 };
  const fig = (k, size) => (
    <button type="button" onClick={() => toggle(k)} aria-pressed={picked.has(k)} title={k}
      style={{ ...card, padding: 8, cursor: "pointer", outline: picked.has(k) ? "3px solid #6847e8" : "none", position: "relative", textAlign: "center" }}>
      <img src={figure(...k.split("-"))} alt={k} loading="lazy" style={{ width: "100%", height: size, objectFit: "contain" }} />
      <div style={{ fontSize: 12, marginTop: 4 }}>{CHARS[k.split("-")[0]]} · {POSE_LABEL[k.split("-")[1]]}</div>
      {picked.has(k) && <span style={{ position: "absolute", top: 6, right: 8, background: "#6847e8", color: "#fff", borderRadius: 99, padding: "0 7px", fontSize: 13 }}>✓</span>}
    </button>
  );
  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 16px 80px", color: "var(--text, inherit)" }}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <h1 style={{ margin: 0, flex: 1 }}>FlexFit figure lab</h1>
        <button className="secondary-button" onClick={flip}>{theme === "dark" ? "☀ Light" : "🌙 Dark"}</button>
        <a className="secondary-button" href={window.location.pathname}>Open the app</a>
      </header>
      <p>Tap a figure to select or deselect it. The suggested mix is pre-selected. The same figures are already used in the app (add <code>?figs=off</code> to the address to compare with the old sticker art).</p>

      <h2>Suggested mix, one per screen</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12 }}>
        {MIX.map(([spot, w, p]) => (
          <div key={spot}>{fig(`${w}-${p}`, 130)}<div style={{ fontSize: 12, textAlign: "center", opacity: .8, marginTop: 4 }}>{spot}</div></div>
        ))}
      </div>

      <h2 style={{ marginTop: 28 }}>How they look inside the app (real page headers)</h2>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
        <Buddy who="zoro" scene="lift" size={76} says="Let's lift!" /><Buddy who="tanjiro" scene="drink" size={76} says="Sip time!" />
        <Buddy who="inosuke" scene="walk" size={76} says="Let's move!" /><Buddy who="zenitsu" scene="habit" size={76} says="Keep the streak!" />
        <Buddy who="kakashi" scene="chart" size={76} says="Look at you go!" /><Buddy who="luffy" scene="eat" size={76} says="What's on the plate?" />
        <Buddy who="jinwoo" scene="levelup" size={72} /><Buddy who="gojo" scene="sleep" size={72} />
      </div>

      <h2 style={{ marginTop: 28 }}>All 100 figures</h2>
      <div className="serving-chips" style={{ marginBottom: 12 }}>
        {["all", ...FIG_WHO].map((w) => <button key={w} type="button" className={who === w ? "chip active" : "chip"} onClick={() => setWho(w)}>{w === "all" ? "Everyone" : CHARS[w]}</button>)}
      </div>
      {shown.map((w) => (
        <section key={w} style={{ marginBottom: 18 }}>
          <h3 style={{ margin: "6px 0" }}>{CHARS[w]}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 10 }}>{FIG_POSES.map((p) => <div key={p}>{fig(`${w}-${p}`, 96)}</div>)}</div>
        </section>
      ))}

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "10px 16px", background: "rgba(10,12,30,.92)", color: "#fff", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <strong>{picked.size} selected</strong>
        <span style={{ flex: 1, fontSize: 12, opacity: .75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 120 }}>{list}</span>
        <button className="secondary-button" onClick={copy}>{copied ? "Copied ✓" : "Copy my picks"}</button>
      </div>
    </main>
  );
}
