// Monthly "season recap" image. Drawn in this browser on a canvas: nothing is uploaded and no server image API is used.
// Health numbers stay off unless you switch them on.
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "../config";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";
import { getLocalDate } from "../utils/date";
import { buildCard, drawCanvas, monthLabel } from "../utils/wrappedCard";
import { accent, CHARS, sprite } from "../motion/chars";
import "./bodyprogress.css";

const ym = (d) => d.slice(0, 7);
const prevMonth = (m) => { const [y, mo] = m.split("-").map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`; };
const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

export default function WrappedCard() {
  const thisMonth = ym(getLocalDate());
  const [month, setMonth] = useState(thisMonth);
  const [health, setHealth] = useState(false);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const canvas = useRef(null);

  useEffect(() => {
    if (!open) return undefined; let alive = true;
    apiFetch(`${API_URL}/api/wrapped?month=${month}&health=${health ? 1 : 0}`).then((r) => r.json()).then((j) => alive && j.success && setData(j.wrapped)).catch(() => {});
    return () => { alive = false; };
  }, [open, month, health]);

  const paint = useCallback(async () => {
    if (!data || !canvas.current) return null;
    const who = data.character?.who;
    const card = buildCard(data, { accent: (who && accent[who]) || "#6847e8", characterName: who ? CHARS[who] || who : "" });
    const c = canvas.current; c.width = card.w; c.height = card.h;
    drawCanvas(c.getContext("2d"), card, who ? await loadImg(sprite(who, "victory", month)) : null);
    return c;
  }, [data, month]);
  useEffect(() => { paint(); }, [paint]);

  const blob = async () => { const c = await paint(); return c ? new Promise((res) => c.toBlob(res, "image/png")) : null; };
  const download = async () => {
    try { const b = await blob(); if (!b) return; const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `flexfit-recap-${month}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    catch { notify("Could not make the image. If you added a sticker from another site, try again.", "error"); }
  };
  const share = async () => {
    try {
      const b = await blob(); const file = new File([b], `flexfit-recap-${month}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "My FlexFit season recap" }); else await download();
    } catch (e) { if (e?.name !== "AbortError") notify("Sharing is not available here. Use Download instead.", "info"); }
  };

  return (
    <section className="large-card bp-card" aria-label="Monthly recap">
      <div className="md-head"><h3>Season recap</h3><button type="button" className="secondary-button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? "Hide" : "Make my card"}</button></div>
      {open && (
        <>
          <p className="bp-sub">A picture of your month with your streak, best week, favourite foods and characters. Made on this device. Nothing is uploaded.</p>
          <div className="md-days" role="group" aria-label="Month">
            {[thisMonth, prevMonth(thisMonth)].map((m) => <button key={m} type="button" aria-pressed={month === m} className={month === m ? "on" : ""} style={{ width: "auto", padding: "0 14px", minHeight: 44 }} onClick={() => setMonth(m)}>{monthLabel(m)}</button>)}
          </div>
          <label className="cc-switch" style={{ marginTop: 10 }}><input type="checkbox" checked={health} onChange={(e) => setHealth(e.target.checked)} /> <span>Include my health numbers (workout days, calories, weight change)</span></label>
          <canvas ref={canvas} className="bp-canvas" aria-label={`Season recap preview for ${monthLabel(month)}`} />
          <div className="md-actions"><button type="button" className="primary-button" onClick={download}>Download image</button><button type="button" className="secondary-button" onClick={share}>Share…</button></div>
        </>
      )}
    </section>
  );
}
