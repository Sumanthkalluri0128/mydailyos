// The weekly review as a compact summary: what went well / what to change / one thing for next week.
// Built only from numbers the coach already sends (nothing invented), in kind wording. Shared by web and mobile (keep identical).
const MAX_WELL = 3, MAX_CHANGE = 2;

export function weekSummary({ review, tips = [], challenge = null, bossName = "", win = "" } = {}) {
  const well = [];
  if (win) well.push(win);                                                   // the server's single best win of the week, when the app has it
  const days = Number(review?.loggedDays) || 0;
  if (days >= 4) well.push(`You logged ${days} of 7 days.`);
  else if (days >= 1) well.push(`You showed up and logged on ${days} day${days === 1 ? "" : "s"}.`);
  if (Number(review?.avgProtein) > 0) well.push(`Protein averaged ${Math.round(review.avgProtein)} g a day.`);
  if (challenge?.defeated) well.push(`You beat ${bossName || "the boss"} this week.`);
  if (!well.length) well.push("A fresh week is a fresh start. One small log is enough to begin.");
  const change = tips.slice(0, MAX_CHANGE).map((t) => ({ id: t.id, icon: t.icon, title: t.title }));
  const first = tips[0];
  return {
    headline: review?.headline || "Your week", score: review?.score ?? null, loggedDays: days,
    well: well.slice(0, MAX_WELL), change,
    next: first ? { id: first.id, icon: first.icon, title: first.title, detail: first.detail } : null,
  };
}
