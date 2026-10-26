// "Season recap" card: pure layout -> list of drawing ops. Two renderers: canvas (web download/share) and SVG text (also used on mobile).
// Nothing is sent anywhere. Health numbers are drawn only when `data.showHealth` is true.
export const W = 1080, H = 1350;
const approxWidth = (text, size, weight = 600) => text.length * size * (weight >= 700 ? 0.6 : 0.55);
export function fit(text, size, maxWidth, weight = 600) {
  let t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (approxWidth(t, size, weight) <= maxWidth) return t;
  while (t.length > 1 && approxWidth(`${t}…`, size, weight) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthLabel = (ym) => { const [y, m] = String(ym).split("-").map(Number); return `${MONTHS[(m || 1) - 1]} ${y}`; };
const dayShort = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1].slice(0, 3)}`; };

/** data = /api/wrapped result. opts: { accent, characterName }  ->  { w, h, ops } */
export function buildCard(data, { accent = "#6847e8", characterName = "" } = {}) {
  const ops = []; const M = 80, IN = W - 2 * M;
  const rect = (x, y, w, h, fill, r = 0) => ops.push({ t: "rect", x, y, w, h, fill, r });
  const text = (x, y, s, size, fill, { weight = 700, align = "left", max = IN } = {}) => ops.push({ t: "text", x, y, text: fit(s, size, max, weight), size, fill, weight, align });
  rect(0, 0, W, H, "#14121f");
  rect(0, 0, W, 520, accent, 0);
  rect(0, 480, W, 80, "#14121f", 40);
  text(M, 120, "SEASON RECAP", 34, "#ffffff", { weight: 800 });
  text(M, 190, monthLabel(data.month), 76, "#ffffff", { weight: 800 });
  const name = (characterName || data.character?.who || "").toString();
  text(M, 330, name ? `Your partner: ${name}` : "Your season", 52, "#ffffff", { weight: 800 });
  if (data.character) text(M, 400, `${data.character.stickers} of their stickers collected`, 34, "#ffffffd9");
  // big numbers
  const box = (x, label, value) => { rect(x, 610, 440, 230, "#211e33", 36); text(x + 40, 690, label, 30, "#b9b4d6"); text(x + 40, 800, String(value), 96, "#ffffff", { weight: 800, max: 360 }); };
  box(M, "Best streak (days)", data.longestStreak ?? 0);
  box(W - M - 440, "Days logged", data.daysLogged ?? 0);
  let y = 930;
  if (data.bestWeek) { text(M, y, `Best week: ${dayShort(data.bestWeek.start)} · ${data.bestWeek.days} days`, 40, "#ffffff"); y += 70; }
  if (data.favouriteFoods?.length) { text(M, y, "Favourite foods", 30, "#b9b4d6"); y += 52; text(M, y, data.favouriteFoods.map((f) => f.name).join("  ·  "), 40, "#ffffff"); y += 70; }
  text(M, y, `Characters unlocked: ${data.charactersUnlocked ?? 0}  ·  Stickers: ${data.stickersTotal ?? 0}`, 36, "#ffffff"); y += 70;
  if (data.showHealth) {
    const bits = [];
    if (data.workoutDays !== null && data.workoutDays !== undefined) bits.push(`${data.workoutDays} workout days`);
    if (data.avgCalories) bits.push(`${data.avgCalories} kcal a day`);
    if (data.weightChangeKg !== null && data.weightChangeKg !== undefined) bits.push(`${data.weightChangeKg > 0 ? "+" : ""}${data.weightChangeKg} kg`);
    if (bits.length) text(M, y, bits.join("  ·  "), 34, accent);
  }
  text(M, H - 60, "FlexFit", 34, "#8d88ad", { weight: 800 });
  return { w: W, h: H, ops };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function toSvg(card) {
  const body = card.ops.map((o) => (o.t === "rect"
    ? `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="${o.r}" fill="${o.fill}"/>`
    : `<text x="${o.align === "right" ? o.x : o.x}" y="${o.y}" font-size="${o.size}" font-weight="${o.weight}" fill="${o.fill}" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" text-anchor="${o.align === "center" ? "middle" : o.align === "right" ? "end" : "start"}">${esc(o.text)}</text>`)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${card.w}" height="${card.h}" viewBox="0 0 ${card.w} ${card.h}">${body}</svg>`;
}
/** Draws on a 2D canvas context. Optional `sticker` (an already-loaded Image) is drawn top right. */
export function drawCanvas(ctx, card, sticker) {
  for (const o of card.ops) {
    if (o.t === "rect") {
      ctx.fillStyle = o.fill; ctx.beginPath();
      if (o.r && ctx.roundRect) ctx.roundRect(o.x, o.y, o.w, o.h, o.r); else ctx.rect(o.x, o.y, o.w, o.h);
      ctx.fill();
    } else {
      ctx.fillStyle = o.fill; ctx.font = `${o.weight} ${o.size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; ctx.textAlign = o.align === "center" ? "center" : o.align === "right" ? "right" : "left";
      ctx.fillText(o.text, o.x, o.y);
    }
    if (o === card.ops[3] && sticker) { try { ctx.drawImage(sticker, card.w - 80 - 360, 90, 360, 360); } catch { /* ignore */ } }
  }
}
