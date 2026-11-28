// Constants, the Food type and the blank form used by the Log food screen and its pieces. Split out of app/food.tsx.
export const meals = ['breakfast', 'lunch', 'dinner', 'snacks'];
export const MEAL_LABEL: Record<string, string> = { breakfast: '🌅 Breakfast', lunch: '☀️ Lunch', dinner: '🌙 Dinner', snacks: '🍎 Snacks' };
export const MEAL_ICON: Record<string, string> = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snacks: '🍎' };
export const MEAL_NAME: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
export const MEAL_COLOR: Record<string, string> = { breakfast: '#F2B84B', lunch: '#4FB286', dinner: '#7A6FF0', snacks: '#E8708A' };
export const num = (v: string) => Number(String(v).replace(',', '.'));

export const MICRO_FIELDS = [['iron', 'Iron (mg)'], ['calcium', 'Calcium (mg)'], ['potassium', 'Potassium (mg)'], ['magnesium', 'Magnesium (mg)'], ['zinc', 'Zinc (mg)'], ['vitaminA', 'Vitamin A (µg)'], ['vitaminB12', 'Vitamin B12 (µg)'], ['vitaminC', 'Vitamin C (mg)'], ['vitaminD', 'Vitamin D (µg)'], ['folate', 'Folate (µg)']] as const;
export type MicroKey = typeof MICRO_FIELDS[number][0];
export const blankMicro = () => Object.fromEntries(MICRO_FIELDS.map(([k]) => [k, ''])) as Record<MicroKey, string>;

export type Food = {
  _id: string; name: string; brand?: string; servingSize: number; servingUnit: string;
  calories: number; protein: number; carbohydrates: number; fat: number; fiber: number; sugar: number;
  isCustom: boolean; isFavorite: boolean; notes?: string;
  units?: { label: string; quantity: number }[]; sodium?: number; barcode?: string;
  confidence?: { id: string; label: string };
} & Partial<Record<MicroKey, number | null>>;

export const emptyDraft = { name: '', brand: '', servingSize: '100', servingUnit: 'g', calories: '', protein: '', carbohydrates: '', fat: '', fiber: '', sugar: '', notes: '', sodium: '0', barcode: '', units: [] as { label: string; quantity: number }[], ...blankMicro() };
