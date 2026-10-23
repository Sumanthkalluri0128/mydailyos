import "./logging2.css";

const LABEL = { low: "Low", medium: "Medium", high: "High" };

// Low / medium / high glycemic load for ONE serving, only for foods that have a published value. Other foods show nothing.
export function GlycemicTag({ food }) {
  const g = food?.glycemic;
  if (!g?.known) return null;
  const band = g.glBand || g.giBand;
  return <span className={`gly-tag gly-${band}`} title={`GI ${g.gi}${g.gl !== null ? `, glycemic load ${g.gl} per serving` : ""}. ${g.note || ""} Source: ${g.source}`}>{g.glBand ? `${LABEL[band]} GL` : `${LABEL[band]} GI`}</span>;
}

// Pairing tip + source for the selected food.
export function PairingTip({ food }) {
  if (!food?.pairing && !food?.glycemic?.known) return null;
  return (
    <div className="pairing-tip">
      {food.glycemic?.known && <p><GlycemicTag food={food} /> GI {food.glycemic.gi}{food.glycemic.gl !== null ? ` · load ${food.glycemic.gl} per serving` : ""}{food.glycemic.verified === false ? " (value being verified)" : ""}</p>}
      {food.pairing && <p>💡 {food.pairing}</p>}
    </div>
  );
}
