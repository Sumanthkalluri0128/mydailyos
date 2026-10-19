// Micronutrient keys, labels and units. Must match server/lib/rda.js (values themselves always come from the server).
export const MICROS = [
  { key: "iron", label: "Iron", unit: "mg" },
  { key: "calcium", label: "Calcium", unit: "mg" },
  { key: "potassium", label: "Potassium", unit: "mg" },
  { key: "magnesium", label: "Magnesium", unit: "mg" },
  { key: "zinc", label: "Zinc", unit: "mg" },
  { key: "vitaminA", label: "Vitamin A", unit: "µg RAE" },
  { key: "vitaminB12", label: "Vitamin B12", unit: "µg" },
  { key: "vitaminC", label: "Vitamin C", unit: "mg" },
  { key: "vitaminD", label: "Vitamin D", unit: "µg" },
  { key: "folate", label: "Folate", unit: "µg" },
];
export const hasMicro = (food, key) => food && food[key] !== null && food[key] !== undefined && food[key] !== "" && Number.isFinite(Number(food[key]));
/** "Iron 2.4 mg · Calcium 60 mg" for the micronutrients a food actually has (unknown ones are left out, never shown as 0). */
export const microSummary = (food) => MICROS.filter((m) => hasMicro(food, m.key)).map((m) => `${m.label} ${Math.round(Number(food[m.key]) * 10) / 10} ${m.unit}`).join(" · ");
