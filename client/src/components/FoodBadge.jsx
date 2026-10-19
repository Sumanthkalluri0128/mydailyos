// Confidence badge on a food: Verified (source-backed), Typical (approximate) or Added by you. Icon + words, never colour alone.
const B = {
  verified: { icon: "🛡️", text: "Verified", tip: "Values come from a named source (for example IFCT or USDA)." },
  typical: { icon: "≈", text: "Typical", tip: "Typical, approximate values. Duplicate the food to adjust them." },
  user: { icon: "✎", text: "Added by you", tip: "You added or edited this food." },
};
export default function FoodBadge({ food }) {
  const b = B[food?.confidence] || B.typical;
  return <span className={`food-badge fb-${food?.confidence || "typical"}`} title={b.tip}><i aria-hidden="true">{b.icon}</i> {b.text}</span>;
}
