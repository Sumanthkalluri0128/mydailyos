// Home's numbers follow the saved Body plan: when a body goal is saved, the plan's calories (GET /api/body-plan, the same call the
// Body plan page makes) become the day's calorie target, so the budget, ring and macro targets on Home match Body > Eating exactly.
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../config/api";
import { getLocalDate } from "../../utils/date";

export function usePlanProfile(profile, refreshKey) {
  const [kcal, setKcal] = useState(null);
  const has = !!profile?.goals?.bodyType;
  useEffect(() => {
    if (!has) { setKcal(null); return undefined; }
    let live = true;
    (async () => {
      try {
        const r = await apiFetch(`/api/body-plan?date=${getLocalDate()}`);
        const j = await r.json();
        const c = r.ok && j && j.plan && j.plan.ready ? Number(j.plan.calories) : 0;
        if (live) setKcal(c > 0 ? Math.round(c) : null);
      } catch (_) { /* keep the profile's own number */ }
    })();
    return () => { live = false; };
  }, [has, refreshKey, profile?.goals?.weeklyPaceKg, profile?.goals?.targetWeightKg, profile?.goals?.bodyType, profile?.currentWeightKg]);
  return useMemo(() => (kcal && profile ? { ...profile, goals: { ...(profile.goals || {}), calorieMode: "manual", calorieTarget: kcal } } : profile), [profile, kcal]);
}
