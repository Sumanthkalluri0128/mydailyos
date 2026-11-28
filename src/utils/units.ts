// Unit conversion + formatting. Data is ALWAYS stored metric (kg, kcal, ml);
// these helpers only translate at the edges (display and text input).

export type WeightUnit = 'kg' | 'lb';
export type EnergyUnit = 'kcal' | 'kJ';
export type VolumeUnit = 'ml' | 'oz';

export const KG_PER_LB = 0.45359237;
export const KJ_PER_KCAL = 4.184;
export const ML_PER_OZ = 29.5735295625; // US fluid ounce

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const kcalToKj = (kcal: number) => kcal * KJ_PER_KCAL;
export const kjToKcal = (kj: number) => kj / KJ_PER_KCAL;
export const mlToOz = (ml: number) => ml / ML_PER_OZ;
export const ozToMl = (oz: number) => oz * ML_PER_OZ;

const round = (n: number, d: number) => {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
};

export function weightValue(kg: number, unit: WeightUnit): number {
  return round(unit === 'lb' ? kgToLb(kg) : kg, 1);
}
export function energyValue(kcal: number, unit: EnergyUnit): number {
  return Math.round(unit === 'kJ' ? kcalToKj(kcal) : kcal);
}
export function volumeValue(ml: number, unit: VolumeUnit): number {
  return unit === 'oz' ? round(mlToOz(ml), 1) : Math.round(ml);
}

export const fmtWeight = (kg: number | null | undefined, unit: WeightUnit) =>
  kg === null || kg === undefined || !Number.isFinite(Number(kg)) ? '--' : `${weightValue(Number(kg), unit).toFixed(1)} ${unit}`;
export const fmtEnergy = (kcal: number | null | undefined, unit: EnergyUnit) =>
  `${energyValue(Number(kcal) || 0, unit).toLocaleString()} ${unit}`;
export const fmtVolume = (ml: number | null | undefined, unit: VolumeUnit) =>
  `${volumeValue(Number(ml) || 0, unit).toLocaleString()} ${unit}`;

/** User typed a number in their preferred unit → canonical metric value (NaN-safe: returns null when invalid). */
export function parseWeightInput(text: string, unit: WeightUnit): number | null {
  const n = Number(String(text).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return round(unit === 'lb' ? lbToKg(n) : n, 2);
}
export function parseVolumeInput(text: string, unit: VolumeUnit): number | null {
  const n = Number(String(text).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return unit === 'oz' ? Math.round(ozToMl(n)) : Math.round(n);
}
export function parseEnergyInput(text: string, unit: EnergyUnit): number | null {
  const n = Number(String(text).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return unit === 'kJ' ? Math.round(kjToKcal(n)) : Math.round(n);
}

/** Sensible one-tap water amounts per unit, always returned in ml. */
export function waterPresets(unit: VolumeUnit): number[] {
  return unit === 'oz' ? [Math.round(ozToMl(8)), Math.round(ozToMl(12)), Math.round(ozToMl(16)), Math.round(ozToMl(24))] : [250, 500, 750, 1000];
}
