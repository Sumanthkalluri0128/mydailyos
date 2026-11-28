// What the Android home-screen widget (and any quick-glance surface) shows: calories left, water and progress bars.
// Pure: it only turns today's numbers into the small snapshot a widget needs (no React Native imports, so it is unit-tested).
// The widget itself lives in src/widgets/; docs/WIDGETS.md explains how the data reaches it.
export type DaySnapshotInput = {
  calorieTarget?: number | null;   // today's calorie budget (target + earned activity bonus)
  eaten?: number | null;
  burned?: number | null;          // extra kcal to add on top of the budget (0 when the budget already includes activity)
  waterMl?: number | null;
  waterTargetMl?: number | null;
  who?: string;
  gentle?: boolean;                // gentle mode: no calorie numbers
  hideNumbers?: boolean;           // safety setting: no calorie numbers either
  kj?: boolean;                    // show energy in kJ instead of kcal
  oz?: boolean;                    // show water in fl oz instead of ml
  protein?: number | null;         // grams eaten today
  proteinTarget?: number | null;
  steps?: number | null;
  stepsTarget?: number | null;
  streak?: number | null;          // current day streak (null = not known yet)
};
export type WidgetSnapshot = {
  caloriesLeft: number | null; caloriesText: string; waterMl: number; waterTargetMl: number | null; waterText: string; waterPct: number | null;
  who: string; addWaterMl: number; at: number;
  // display-ready pieces for the widget layout
  eaten: number; budget: number | null; caloriesPct: number | null; over: boolean; hidden: boolean;
  caloriesValue: string; caloriesUnit: string; waterValue: string; waterGoal: string; addWaterLabel: string;
  whoLabel: string; // the day's character, shown in the widget header
  // the themed widget (daily artwork) also shows these
  dateLabel: string;                 // "WED, OCT 29"
  proteinValue: string; proteinGoal: string; proteinPct: number | null;
  stepsValue: string; stepsGoal: string; stepsPct: number | null;
  streakDays: number | null; streakText: string;
  // today's four missions; null = not applicable (calorie mission is hidden in gentle mode / hidden numbers)
  missions: { protein: boolean | null; steps: boolean | null; calories: boolean | null; water: boolean | null };
  missionLabels: { protein: string; steps: string; calories: string; water: string };
};

export const ADD_WATER_ML = 250;
// The day's character (same order as motion/chars.ts DAY_ORDER, Sunday first). Kept here as plain text so the headless widget code never loads the sticker tables.
const DAY_WHO = ['naruto', 'zoro', 'luffy', 'goku', 'tanjiro', 'gojo', 'asta'];
export const dayWho = (ms = Date.now()) => DAY_WHO[new Date(ms).getDay()];
const NAMES: Record<string, string> = { jinwoo: 'Jin-Woo' };
export const whoLabel = (who: string) => NAMES[who] || (who ? who.charAt(0).toUpperCase() + who.slice(1) : '');
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** 1761868800000 -> "WED, OCT 29" (no Intl: the widget runs in a headless JS context). */
export const dateLabel = (ms = Date.now()) => { const d = new Date(ms); return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`; };
/** 10000 -> "10k", 7500 -> "7.5k", 800 -> "800" */
const short = (x: number) => (x >= 1000 ? `${String(Math.round(x / 100) / 10).replace(/\.0$/, '')}k` : String(Math.round(x)));
const ML_PER_OZ = 29.5735;
const KJ_PER_KCAL = 4.184;
const n = (x: any) => (Number.isFinite(Number(x)) && x !== null && x !== '' ? Number(x) : null);
/** 1234567 -> "1,234,567" (no Intl: the widget runs in a headless JS context). */
export const group = (x: number) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function buildSnapshot(i: DaySnapshotInput, now = Date.now()): WidgetSnapshot {
  const target = n(i.calorieTarget), eaten = n(i.eaten) ?? 0, burned = n(i.burned) ?? 0;
  const left = target === null ? null : Math.round(target - eaten + burned);
  const water = Math.max(0, Math.round(n(i.waterMl) ?? 0)), wt = n(i.waterTargetMl);
  const hidden = !!(i.gentle || i.hideNumbers);
  const e = (kcal: number) => (i.kj ? Math.round(kcal * KJ_PER_KCAL) : Math.round(kcal));
  const eu = i.kj ? 'kJ' : 'kcal';
  const w = (ml: number) => (i.oz ? Math.round(ml / ML_PER_OZ) : Math.round(ml));
  const wu = i.oz ? 'fl oz' : 'ml';
  const over = left !== null && left < 0;
  const budget = target === null ? null : Math.round(target + burned);
  const prot = n(i.protein), protT = n(i.proteinTarget), stp = n(i.steps), stpT = n(i.stepsTarget), strk = n(i.streak);
  const pct = (a: number | null, t: number | null) => (a !== null && t ? Math.min(100, Math.max(0, Math.round((a / t) * 100))) : null);
  const waterDone = wt ? water >= wt : null;
  return {
    caloriesLeft: left,
    // gentle mode / hidden numbers: calorie numbers are never shown, here too
    caloriesText: hidden ? 'Eating well today' : left === null ? 'Set a calorie goal' : left >= 0 ? `${left} kcal left` : `${-left} kcal over`,
    waterMl: water, waterTargetMl: wt,
    waterText: wt ? `${water} / ${Math.round(wt)} ml` : `${water} ml`,
    waterPct: wt ? Math.min(100, Math.round((water / wt) * 100)) : null,
    who: i.who || dayWho(now), addWaterMl: ADD_WATER_ML, at: now,
    eaten: Math.round(eaten), budget, over, hidden,
    caloriesPct: !hidden && budget && budget > 0 ? Math.min(100, Math.max(0, Math.round((eaten / budget) * 100))) : null,
    caloriesValue: hidden ? 'Eating well' : left === null ? '—' : group(e(Math.abs(left))),
    caloriesUnit: hidden ? 'today' : left === null ? 'set a goal' : `${eu} ${over ? 'over' : 'left'}`,
    waterValue: group(w(water)),
    waterGoal: wt ? `of ${group(w(wt))} ${wu}` : wu,
    addWaterLabel: `+${w(ADD_WATER_ML)} ${wu}`,
    whoLabel: whoLabel(i.who || dayWho(now)),
    dateLabel: dateLabel(now),
    proteinValue: prot === null ? '—' : group(prot), proteinGoal: protT ? `/ ${group(protT)} g` : 'g', proteinPct: pct(prot, protT),
    stepsValue: stp === null ? '—' : group(stp), stepsGoal: stpT ? `/ ${short(stpT)}` : '', stepsPct: pct(stp, stpT),
    streakDays: strk === null ? null : Math.max(0, Math.round(strk)),
    streakText: strk === null ? '—' : strk <= 0 ? 'Start today' : `${Math.round(strk)} DAY${Math.round(strk) === 1 ? '' : 'S'}`,
    missions: {
      protein: prot === null || !protT ? null : prot >= protT,
      steps: stp === null || !stpT ? null : stp >= stpT,
      calories: hidden || budget === null ? null : eaten > 0 && eaten <= budget,
      water: waterDone,
    },
    missionLabels: { protein: 'Protein', steps: stpT ? `${short(stpT)} steps` : 'Steps', calories: 'Budget', water: 'Water' },
  };
}

/** Is a snapshot from an earlier day? A widget must not show yesterday's numbers as today's. */
export function snapshotIsStale(s: Pick<WidgetSnapshot, 'at'>, now = Date.now()): boolean {
  const a = new Date(s.at), b = new Date(now);
  return a.getFullYear() !== b.getFullYear() || a.getMonth() !== b.getMonth() || a.getDate() !== b.getDate();
}
