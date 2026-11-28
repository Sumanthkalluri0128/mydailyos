// "You haven't logged lunch yet" reminders, one per meal, that fire ONLY when that particular meal is still missing.
// Pure date maths (no React Native imports) so it can be unit-tested with plain Node.
//
// A local notification cannot look at the food log at the moment it fires, so we schedule one-off nudges and re-plan whenever the
// app opens, a meal is logged or a meal is skipped: that meal's nudge for today (and its follow-up) is dropped as soon as the meal
// has an entry or you tap "Skipped it". Each meal can be switched on or off on its own, and an optional follow-up re-asks once.

export type MealKey = 'breakfast' | 'lunch' | 'dinner' | 'snacks';
export type MealTimes = Record<MealKey, string>; // "HH:mm"
export type MealsOn = Record<MealKey, boolean>;

export const MEAL_KEYS: MealKey[] = ['breakfast', 'lunch', 'dinner', 'snacks'];
export const DEFAULT_MEAL_TIMES: MealTimes = { breakfast: '10:00', lunch: '14:30', dinner: '21:00', snacks: '17:30' };
export const DEFAULT_MEALS_ON: MealsOn = { breakfast: true, lunch: true, dinner: true, snacks: false };
export const DEFAULT_FOLLOW_UP_MIN = 45;

export const MEAL_NUDGE_TEXT: Record<MealKey, { title: string; body: string; followTitle: string; followBody: string }> = {
  breakfast: { title: '🌅 Breakfast not logged', body: 'Add what you had so your day adds up. Tap to log it.', followTitle: '🌅 Still no breakfast logged', followBody: 'Had it already? Log it in ten seconds. Skipped it? Tap "Skipped it".' },
  lunch: { title: '☀️ Lunch not logged', body: 'Log lunch. It takes ten seconds.', followTitle: '☀️ Still no lunch logged', followBody: 'Had it already? Log it now. Skipped it? Tap "Skipped it".' },
  dinner: { title: '🌙 Dinner not logged', body: 'Log dinner to close out today.', followTitle: '🌙 Still no dinner logged', followBody: 'Log it to close out the day, or tap "Skipped it".' },
  snacks: { title: '🍎 Any snacks to log?', body: 'If you had a snack today, add it so your day adds up.', followTitle: '🍎 Snack check', followBody: 'Had a snack? Log it. No snack today? Tap "Skipped it".' },
};

export type Nudge = { meal: MealKey; at: Date; followUp: boolean };

const atTime = (base: Date, time: string, plusDays: number): Date => {
  const [h, m] = time.split(':').map(Number);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + plusDays, h || 0, m || 0, 0, 0);
};

export type PlanOpts = {
  /** Which meals to nudge for (default: breakfast, lunch, dinner). */
  on?: Partial<MealsOn>;
  /** Meals the person said they skipped today: no nudge and no follow-up for those today. */
  skipped?: Iterable<string>;
  /** Minutes after the first nudge to ask once more if the meal is still missing. 0 = never. */
  followUpMin?: number;
  /** Don't fire inside quiet hours ("HH:mm" start/end). Meal nudges are shifted to the quiet end rather than dropped when inside. */
};

/**
 * @param now      current time
 * @param times    when to nudge for each meal
 * @param logged   meals that already have an entry today
 * @param horizon  how many days ahead to schedule (today counts as day 0)
 */
export function planMealNudges(now: Date, times: MealTimes, logged: Iterable<string>, horizon = 3, opts: PlanOpts = {}): Nudge[] {
  const done = new Set(logged);
  const skipped = new Set(opts.skipped || []);
  const on: MealsOn = { ...DEFAULT_MEALS_ON, ...(opts.on || {}) };
  const follow = Math.max(0, Math.round(opts.followUpMin ?? DEFAULT_FOLLOW_UP_MIN));
  const out: Nudge[] = [];
  for (const meal of MEAL_KEYS) {
    if (!on[meal] || !times[meal]) continue;
    for (let day = 0; day < horizon; day += 1) {
      if (day === 0 && (done.has(meal) || skipped.has(meal))) continue; // that meal is handled today
      const at = atTime(now, times[meal], day);
      if (at.getTime() > now.getTime() + 60_000) out.push({ meal, at, followUp: false });
      if (follow > 0) {
        const f = new Date(at.getTime() + follow * 60_000);
        // The follow-up must still be today and in the future (an 11:30 pm nudge does not spill into tomorrow).
        if (f.getTime() > now.getTime() + 60_000 && f.getDate() === at.getDate()) out.push({ meal, at: f, followUp: true });
      }
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export const isHHmm = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
