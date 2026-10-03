// Weight-based daily targets (Mifflin-St Jeor + activity multiplier), mirrors the mobile app.
const MULT = { sedentary: 1.2, light: 1.375, moderate: 1.55, very_active: 1.725, extra_active: 1.9 };

export function expectedEnergy(profile) {
  const w = Number(profile?.currentWeightKg);
  const h = Number(profile?.heightCm);
  const age = Number(profile?.age);
  if (!(w > 0 && h > 0 && age > 0)) return null;
  const base = 10 * w + 6.25 * h - 5 * age;
  const sex = profile?.sex;
  const bmr = sex === "male" ? base + 5 : sex === "female" ? base - 161 : base - 78;
  const tdee = bmr * (MULT[profile?.activityLevel] || MULT.moderate);
  const target = Number(profile?.goals?.targetWeightKg);
  const direction = !target ? "maintain" : target < w - 0.4 ? "lose" : target > w + 0.4 ? "gain" : "maintain";
  const adjust = direction === "lose" ? -500 : direction === "gain" ? 300 : 0;
  const floor = sex === "male" ? 1500 : 1200;
  return {
    weightKg: w,
    tdee: Math.round(tdee),
    direction,
    calorieTarget: Math.round(Math.max(floor, tdee + adjust) / 10) * 10,
  };
}

/** ~35 ml per kg, rounded to 50 ml, kept between 1.5 L and 5 L. */
export function waterTargetMl(weightKg) {
  const w = Number(weightKg);
  if (!(w > 0)) return null;
  return Math.min(5000, Math.max(1500, Math.round((w * 35) / 50) * 50));
}

export function calorieBalance(energy, eaten, burned) {
  const budget = energy.calorieTarget + burned;
  const net = energy.tdee + burned - eaten;
  return { budget, remaining: budget - eaten, net, isDeficit: net >= 0, fatKg: Math.abs(net) / 7700 };
}

export const estimateBurn = (met, weightKg, minutes) => ((met * 3.5 * weightKg) / 200) * minutes;

/** ~0.0005 kcal per step per kg of body weight (10,000 steps at 70 kg is about 350 kcal). Mirrors the server. */
export const stepCalories = (steps, weightKg) => Math.round(Math.max(0, Number(steps) || 0) * (Number(weightKg) || 70) * 0.0005);
