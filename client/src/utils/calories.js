export function calculateBMR({
  weightKg,
  heightCm,
  age,
  sex,
}) {
  if (!weightKg || !heightCm || !age) {
    return null;
  }

  const weight = Number(weightKg);
  const height = Number(heightCm);
  const years = Number(age);

  if (sex === "male") {
    return 10 * weight + 6.25 * height - 5 * years + 5;
  }

  if (sex === "female") {
    return 10 * weight + 6.25 * height - 5 * years - 161;
  }

  return null;
}

export function calculateTDEE({
  weightKg,
  heightCm,
  age,
  sex,
  activityLevel,
}) {
  const bmr = calculateBMR({
    weightKg,
    heightCm,
    age,
    sex,
  });

  if (bmr === null) {
    return null;
  }

  const activityMultipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    very_active: 1.725,
    extra_active: 1.9,
  };

  const multiplier =
    activityMultipliers[activityLevel];

  if (!multiplier) {
    return null;
  }

  return bmr * multiplier;
}