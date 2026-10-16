// Profile switches for the anime companions: roaming characters on/off, calm motion on/off.
import { useState } from "react";
import { companionsEnabled, setCompanionsEnabled } from "../motion/Companions";

export default function CharacterSettings() {
  const [roam, setRoam] = useState(companionsEnabled());
  const [calm, setCalm] = useState(() => { try { return localStorage.getItem("ff_calm_motion") === "1"; } catch { return false; } });
  const toggleCalm = (v) => {
    setCalm(v);
    try { localStorage.setItem("ff_calm_motion", v ? "1" : "0"); } catch { /* ignore */ }
    document.documentElement.classList.toggle("ff-calm", v);
  };
  return (
    <section className="card" style={{ display: "grid", gap: 10, padding: 16, margin: "12px 0" }}>
      <h3 style={{ margin: 0 }}>Characters</h3>
      <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input type="checkbox" checked={roam} onChange={(e) => { setRoam(e.target.checked); setCompanionsEnabled(e.target.checked); }} />
        <span>Roaming companions (tap to chat, drag to throw)</span>
      </label>
      <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input type="checkbox" checked={calm} onChange={(e) => toggleCalm(e.target.checked)} />
        <span>Calm motion (fewer animations)</span>
      </label>
    </section>
  );
}
