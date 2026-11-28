// Daily check-in: ONE card on Home that asks only for what is still missing today (weigh-in, protein, water).
// More weigh-ins make the 7-day average (the number the goal card counts from) more accurate. Pure functions: no React, no storage.

export type CheckinItem = 'weight' | 'protein' | 'water';
export const DISMISS_KEY = 'checkin:dismissed';

/** Protein and water are only asked for from mid-afternoon (earlier, a low number just means the day has not happened yet). */
export const ASK_FROM_HOUR = 14;
const PROTEIN_LOW = 0.9;    // below 90% of target = under the bottom of the in-range band the server uses
const WATER_LOW = 0.7;

export function checkinItems(i: { hour: number; weighedToday: boolean; proteinG: number; proteinTarget: number; waterMl: number; waterTargetMl: number }): CheckinItem[] {
  const out: CheckinItem[] = [];
  if (!i.weighedToday) out.push('weight');
  if (i.hour >= ASK_FROM_HOUR && i.proteinTarget > 0 && i.proteinG < Math.round(PROTEIN_LOW * i.proteinTarget)) out.push('protein');
  if (i.hour >= ASK_FROM_HOUR && i.waterTargetMl > 0 && i.waterMl < WATER_LOW * i.waterTargetMl) out.push('water');
  return out;
}

/** Show the card when something is missing and it was not put away ("Not today") on this same date. */
export const shouldShow = (items: CheckinItem[], dismissedDate: string | null | undefined, today: string) => items.length > 0 && dismissedDate !== today;

/** Whole grams of protein, 1 to 400, or null. Accepts a comma as the decimal mark. */
export function parseGrams(text: string): number | null {
  const n = Number(String(text ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) && n >= 1 && n <= 400 ? Math.round(n) : null;
}

/** The quick-add route needs calories, so a protein-only entry is logged as an estimate of 4 kcal per gram. The card says so. */
export const proteinKcal = (g: number) => Math.round(g * 4);
