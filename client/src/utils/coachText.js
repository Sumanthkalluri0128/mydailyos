// The Coach's words in the person's language. The server decides WHAT to say (an action id, numbers); this file turns that into text with the
// translation function it is given. Every line falls back to the server's English when no translation exists, so nothing is ever blank.
// Pure (no React, no storage): shared byte-for-byte with the phone app (tools/checkSharedFiles.mjs).
const num = (x) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };
const fmt = (n) => Math.round(num(n)).toLocaleString();

/** t(key, vars), or `fallback` when the key has no text in any language. */
export function tr(t, key, vars, fallback) {
  const s = t(key, vars);
  return s === key ? fallback : s;
}

export function applyLabel(t, a) {
  if (!a) return "";
  if (a.type === "steps") return t("coach.apply.steps", { n: fmt(a.stepsTarget) });
  if (a.type === "dietBreak") return t("coach.apply.dietBreak", { days: a.days });
  if (a.type === "targetDate") return t("coach.apply.date", { date: a.byDate });
  if ((a.type === "pace" || a.type === "calorie") && num(a.planPaceKg) > 0) return t("coach.apply.pace", { pace: a.planPaceKg });
  return t("coach.apply.target", { kcal: fmt(a.calorieTarget) });
}

/** Values the weekly lines can mention, taken from the decision's own numbers. */
function weeklyVars(w) {
  const m = (w && w.metrics) || {};
  const ap = (w && w.apply) || {};
  return {
    rate: Math.abs(num(m.rateKgWk)).toFixed(2), plan: num(m.targetLossKgWk).toFixed(2), min: 6, have: num(m.weighIns14), food: num(m.foodDays14),
    adh: Math.round(num(m.adherence) * 100), avg: fmt(m.stepsAvg), target: fmt(m.stepsTarget), sessions: num(m.sessionsPerWeek).toFixed(1), planned: num(m.plannedDays),
    to: fmt(ap.stepsTarget), plus: ap.stepsTarget ? fmt(num(ap.stepsTarget) - num(ap.from)) : "", kcal: ap.calorieTarget ? fmt(ap.calorieTarget) : "100", day: num(m.cycleDay), len: num(m.cycleLen),
  };
}

export function weeklyHeadline(t, w) {
  if (!w) return "";
  return tr(t, `coach.w.${w.action}.head`, weeklyVars(w), w.headline);
}

/** The server's lines; the first one is replaced by a translated line when this action has one. Other lines stay as the server wrote them. */
export function weeklyMessages(t, w) {
  if (!w) return [];
  const msgs = Array.isArray(w.messages) ? w.messages.slice() : [];
  const first = tr(t, `coach.w.${w.action}.m1`, weeklyVars(w), null);
  if (first === null) return msgs;
  return [first];                      // a translated action carries its whole explanation in this one line
}

export function nextText(t, n, band) {
  if (!n) return { title: "", detail: "" };
  const k = n.kind;
  const title = k === "decision" ? n.title : tr(t, `coach.next.${k}.title`, null, n.title);
  let detail = tr(t, `coach.next.${k}.detail`, null, n.detail);
  if (k === "train" && band && band !== "green") detail = `${detail} ${tr(t, `coach.band.${band}`, null, "")}`.trim();
  return { title, detail };
}

export const bandNote = (t, band, fallback) => (band ? tr(t, `coach.band.${band}`, null, fallback) : fallback);
export const refreshNote = (t, w) => (w && w.refreshReason ? tr(t, `coach.refreshed.${w.refreshReason}`, null, "") : "");

export function offerTexts(t, o) {
  if (!o) return null;
  const date = o.date ? { title: t("coach.offer.date.title", { date: o.date.newDate }), detail: t("coach.offer.date.detail") } : null;
  const pace = o.pace ? {
    title: t("coach.offer.pace.title", { to: o.pace.toPace }),
    detail: `${t("coach.offer.pace.detail", { perDay: fmt(o.pace.perDayLess), kcal: fmt(o.pace.kcal), finish: o.pace.finishDate })}${o.pace.reachesDate ? ` ${t("coach.offer.pace.onTime")}` : ""} ${t("coach.offer.caveat")}`,
  } : null;
  const currentDate = o.date ? o.date.newDate : "";
  return {
    title: t("coach.offer.title", { weeks: o.behindWeeks }), body: t("coach.offer.body", { date: currentDate || o.refDate }), date, pace,
    noPace: !o.pace && o.paceBlocked ? tr(t, `coach.offer.noPace.${o.paceBlocked}`, null, "") : "",
  };
}

/** Advisories (tips that need both coaches): title and, where the sentence is fixed, the detail, in the person's language. Others keep the server text. */
export function advisoryText(t, a) {
  if (!a) return { title: "", detail: "" };
  return { title: tr(t, `coach.adv.${a.id}.title`, a.vars || null, a.title), detail: tr(t, `coach.adv.${a.id}.detail`, a.vars || null, a.detail) };
}
