// Plain-language insights from a window of daily history rows (same shape as /api/progress/history).
export type Day = { date: string; calories: number; protein: number; waterMl: number; exerciseMinutes: number; caloriesBurned: number; steps?: number; weighIn?: boolean };
export type Insight = { icon: string; title: string; detail: string; tone: 'good' | 'warn' | 'info' };
export type Targets = { calories?: number | null; protein?: number | null; waterMl?: number | null; steps?: number | null; exerciseMinutes?: number | null };

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const isWeekend = (date: string) => { const d = new Date(`${date}T00:00:00`).getDay(); return d === 0 || d === 6; };

export function buildInsights(days: Day[], t: Targets): Insight[] {
  const out: Insight[] = [];
  const logged = days.filter((d) => d.calories > 0);
  if (days.length < 3) return [{ icon: '🌱', title: 'Keep logging', detail: 'Insights appear after a few days of data.', tone: 'info' }];

  const consistency = Math.round((logged.length / days.length) * 100);
  out.push(consistency >= 80
    ? { icon: '🔥', title: `Logged ${logged.length} of ${days.length} days`, detail: 'Excellent consistency — that is what drives results.', tone: 'good' }
    : { icon: '📝', title: `Food logged on ${logged.length} of ${days.length} days`, detail: 'Logging every day, even roughly, makes your numbers far more reliable.', tone: 'warn' });

  if (t.calories && logged.length >= 3) {
    const a = avg(logged.map((d) => d.calories));
    const diff = Math.round(a - t.calories);
    out.push(Math.abs(diff) <= t.calories * 0.08
      ? { icon: '🎯', title: 'Calories on target', detail: `You average ${Math.round(a)} kcal, within 8% of your ${t.calories} kcal goal.`, tone: 'good' }
      : { icon: diff > 0 ? '📈' : '📉', title: diff > 0 ? `About ${diff} kcal over your goal` : `About ${-diff} kcal under your goal`, detail: `Daily average ${Math.round(a)} kcal vs goal ${t.calories} kcal.`, tone: 'warn' });
  }

  if (t.protein && logged.length >= 4) {
    const wk = logged.filter((d) => isWeekend(d.date)); const wd = logged.filter((d) => !isWeekend(d.date));
    if (wk.length >= 2 && wd.length >= 2) {
      const a = avg(wk.map((d) => d.protein)); const b = avg(wd.map((d) => d.protein));
      if (a < b * 0.8) out.push({ icon: '🍗', title: 'Protein dips on weekends', detail: `${Math.round(a)} g on weekends vs ${Math.round(b)} g on weekdays. Plan a protein-rich meal for Saturday and Sunday.`, tone: 'warn' });
    }
    const hit = logged.filter((d) => d.protein >= t.protein! * 0.9).length;
    if (hit >= logged.length * 0.7) out.push({ icon: '💪', title: 'Protein goal met most days', detail: `${hit} of ${logged.length} logged days at or near ${t.protein} g.`, tone: 'good' });
    else if (hit < logged.length * 0.4) out.push({ icon: '🥚', title: 'Protein is low', detail: `You reached ~${t.protein} g on only ${hit} of ${logged.length} days. Eggs, dal, paneer, curd or soya chunks help.`, tone: 'warn' });
  }

  if (t.waterMl) {
    const hit = days.filter((d) => d.waterMl >= t.waterMl! * 0.9).length;
    out.push(hit >= days.length * 0.6
      ? { icon: '💧', title: 'Hydration is solid', detail: `Water goal met on ${hit} of ${days.length} days.`, tone: 'good' }
      : { icon: '🥤', title: 'Drink more water', detail: `Goal met on only ${hit} of ${days.length} days. A glass with every meal adds up quickly.`, tone: 'warn' });
  }

  const stepDays = days.filter((d) => (d.steps || 0) > 0);
  if (t.steps && stepDays.length >= 3) {
    const a = Math.round(avg(stepDays.map((d) => d.steps || 0)));
    out.push(a >= t.steps
      ? { icon: '👟', title: `Averaging ${a.toLocaleString()} steps`, detail: 'You are beating your daily step goal.', tone: 'good' }
      : { icon: '🚶', title: `Averaging ${a.toLocaleString()} steps`, detail: `${(t.steps - a).toLocaleString()} short of ${t.steps.toLocaleString()}. A 15-minute walk after meals adds roughly 1,500 steps.`, tone: 'info' });
  }

  const active = days.filter((d) => d.exerciseMinutes > 0).length;
  if (t.exerciseMinutes) out.push(active >= days.length * 0.5
    ? { icon: '🏋️', title: `Active on ${active} of ${days.length} days`, detail: 'Great rhythm. Keep at least one rest day.', tone: 'good' }
    : { icon: '🏃', title: `Workouts on ${active} of ${days.length} days`, detail: 'Even 20 minutes on 3–4 days a week moves the needle.', tone: 'info' });
  return out;
}
