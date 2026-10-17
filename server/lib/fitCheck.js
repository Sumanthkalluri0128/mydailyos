// "Will this fit?" — what one food does to today's budget and to the week, before it is eaten. Pure.
const n0 = (x) => Number(x) || 0;

/**
 * @param add   {calories, protein}   the food being considered (already scaled to the portion)
 * @param today {eaten, budget, protein, proteinTarget}
 * @param week  {budget, usedBeforeToday, daysLeft} (daysLeft counts today)
 */
function previewFit({ add, today, week = null }) {
  const eatenAfter = n0(today.eaten) + n0(add.calories);
  const leftAfter = Math.round(n0(today.budget) - eatenAfter);
  const status = leftAfter < 0 ? 'over' : leftAfter < n0(today.budget) * 0.1 ? 'tight' : 'fits';
  const out = { status, eatenAfter: Math.round(eatenAfter), leftAfter, proteinAfter: Math.round(n0(today.protein) + n0(add.protein)), proteinTarget: n0(today.proteinTarget) || null, week: null, message: '' };
  if (week && n0(week.budget) > 0) {
    const used = n0(week.usedBeforeToday) + eatenAfter;
    const weekLeft = Math.round(week.budget - used);
    const otherDays = Math.max(0, n0(week.daysLeft) - 1);
    out.week = { weekLeft, perDayAfter: otherDays > 0 ? Math.round(weekLeft / otherDays) : null, absorbed: leftAfter < 0 && weekLeft >= 0 };
  }
  if (status === 'fits') out.message = `Fits. You would have ${leftAfter} kcal left today.`;
  else if (status === 'tight') out.message = `Fits, just. About ${leftAfter} kcal left, so keep the rest of today light.`;
  else if (out.week && out.week.absorbed) out.message = `${-leftAfter} kcal over today, but your week can absorb it. That leaves about ${out.week.perDayAfter ?? 0} kcal a day for the rest of the week.`;
  else out.message = `${-leftAfter} kcal over today. Not a problem on its own. A half portion or a lighter next meal would balance it.`;
  return out;
}

module.exports = { previewFit };
