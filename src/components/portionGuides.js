// Portion guides: typical sizes drawn as simple shapes (no photos). Sizes are typical household values, not lab measurements:
// fill your own katori / glass with water and pour it into a measuring cup once to learn yours. Shared by web and mobile (keep identical).
export const GUIDES = [
  { id: "katori", title: "Katori", note: "Typical steel katori. Level full, not heaped.",
    items: [{ id: "s", label: "Small", amount: 100, unit: "ml", scale: 0.8 }, { id: "m", label: "Medium", amount: 150, unit: "ml", scale: 1 }, { id: "l", label: "Large", amount: 200, unit: "ml", scale: 1.2 }] },
  { id: "roti", title: "Roti", note: "Width across, flat on the plate. Thicker or oilier rotis weigh more.",
    items: [{ id: "s", label: "Phulka", amount: 15, unit: "cm", scale: 0.75 }, { id: "m", label: "Regular", amount: 20, unit: "cm", scale: 1 }, { id: "l", label: "Large", amount: 25, unit: "cm", scale: 1.25 }] },
  { id: "ladle", title: "Ladle (kadchi)", note: "Level ladle of dal or curry. Ladles vary a lot: measure yours once.",
    items: [{ id: "s", label: "Small", amount: 60, unit: "ml", scale: 0.8 }, { id: "m", label: "Medium", amount: 90, unit: "ml", scale: 1 }] },
  { id: "glass", title: "Glass", note: "Filled to about a finger below the rim.",
    items: [{ id: "s", label: "Small", amount: 150, unit: "ml", scale: 0.85 }, { id: "m", label: "Regular", amount: 200, unit: "ml", scale: 1 }, { id: "l", label: "Tall", amount: 250, unit: "ml", scale: 1.15 }] },
  { id: "spoon", title: "Spoon", note: "Level measuring spoons (a table spoon from the cutlery drawer is often smaller).",
    items: [{ id: "t", label: "Teaspoon", amount: 5, unit: "ml", scale: 0.8 }, { id: "tb", label: "Tablespoon", amount: 15, unit: "ml", scale: 1.15 }] },
];
export const guideText = (g, i) => `${i.label}: about ${i.amount} ${i.unit}`;
