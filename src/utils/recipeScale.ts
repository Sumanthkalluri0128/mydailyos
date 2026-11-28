// Servings scaling for an imported recipe (same rules as the web app's recipeScale.js).
// Amounts scale; calories and macros PER SERVING stay the same, totals change.
export function scaleQuantity(q: number, from: number, to: number): number {
  const f = Number(from), t = Number(to), n = Number(q);
  if (!(f > 0) || !(t > 0) || !Number.isFinite(n)) return n;
  const out = (n * t) / f;
  return out >= 100 ? Math.round(out) : Math.round(out * 10) / 10;
}
export type ScaledItem = { quantity: number | string | null; baseQuantity?: number | string | null; [k: string]: any };
/** Items keep their ORIGINAL amounts (baseQuantity); the shown amount is always scaled from that, so 4 -> 2 -> 4 returns to the original. */
export const scaleItems = <T extends ScaledItem>(items: T[], from: number, to: number): T[] =>
  items.map((i) => (i.quantity === null || i.quantity === undefined || i.quantity === '' ? i : { ...i, quantity: scaleQuantity(Number(i.baseQuantity ?? i.quantity), from, to) }));
export const withBase = <T extends ScaledItem>(items: T[]): T[] => items.map((i) => ({ ...i, baseQuantity: i.quantity }));
export const totalFromPerServing = (perServing: Record<string, number>, servings: number) =>
  Object.fromEntries(Object.entries(perServing || {}).map(([k, x]) => [k, Math.round(Number(x) * Number(servings) * 10) / 10]));
