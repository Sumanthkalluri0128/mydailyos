// Servings scaling for an imported recipe. Amounts scale; calories and macros PER SERVING stay the same, totals change.
export function scaleQuantity(q, from, to) {
  const f = Number(from), t = Number(to), n = Number(q);
  if (!(f > 0) || !(t > 0) || !Number.isFinite(n)) return n;
  const out = (n * t) / f;
  return out >= 100 ? Math.round(out) : Math.round(out * 10) / 10;
}
/** Items keep their ORIGINAL amounts (baseQuantity); the shown amount is always scaled from that, so 4 -> 2 -> 4 returns to the original. */
export function scaleItems(items, from, to) {
  return items.map((i) => (i.quantity === null || i.quantity === undefined || i.quantity === "" ? i : { ...i, quantity: scaleQuantity(i.baseQuantity ?? i.quantity, from, to) }));
}
export const withBase = (items) => items.map((i) => ({ ...i, baseQuantity: i.quantity }));
export const totalFromPerServing = (perServing, servings) => Object.fromEntries(Object.entries(perServing || {}).map(([k, x]) => [k, Math.round(Number(x) * Number(servings) * 10) / 10]));
