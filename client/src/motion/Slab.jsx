// A flat sticker turned into a physical object.
//
// <Slab size={96} face={<img …/>} wall={<img …/>} yaw={0|180} lean={10} look={16} />
//
// The picture is stacked in several layers along the Z axis: the front and back are the real art (with the
// baked bevel lighting), the ones in between are a dark silhouette of the same art, which forms the thick edge of
// a die-cut figure. Everything sits inside one CSS 3D scene with its own perspective, so when the figure
// turns around (yaw 0 -> 180) you see it go edge-on and show its thickness, it leans toward its direction of
// travel, sways a little when idle and (when `look` is set) tilts to follow the pointer.
import "./slab.css";

// Layer depths as a fraction of the half-thickness; the two ends are the front / back faces. About one layer per pixel of thickness keeps the edge solid when it turns edge-on.
const zs = (T) => { const n = Math.max(7, Math.min(13, Math.ceil(T / 0.8) + 1)); return Array.from({ length: n }, (_, i) => -1 + (2 * i) / (n - 1)); };

// One shared pointer listener: every slab that asked to `look` turns a little toward the cursor.
let raf = 0, px = -1, py = -1, bound = false;
const clamp = (v) => Math.max(-1, Math.min(1, v));
function aim() {
  raf = 0;
  const vh = window.innerHeight;
  document.querySelectorAll(".sl[data-look]").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.bottom < -60 || r.top > vh + 60) return;
    const a = +el.dataset.look, dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height * 0.4);
    el.style.setProperty("--ry", `${(clamp(dx / 420) * a).toFixed(1)}deg`);
    el.style.setProperty("--rx", `${(-clamp(dy / 420) * a * 0.45).toFixed(1)}deg`);
  });
}
function bind() {
  if (bound || typeof window === "undefined") return;
  bound = true;
  window.addEventListener("pointermove", (e) => { px = e.clientX; py = e.clientY; if (!raf) raf = requestAnimationFrame(aim); }, { passive: true });
}
bind();

export default function Slab({ size, face, wall, depth = 0.065, yaw = 0, lean = 0, look = 0, sway = true, className = "", style }) {
  const half = (size * depth) / 2, Z = zs(size * depth);
  return (
    <span className={`sl ${className}`} data-look={look || undefined} style={{ width: size, height: size, "--yaw": `${yaw}deg`, "--lean": `${lean}deg`, "--sd": `${-((size * 7.3) % 5).toFixed(2)}s`, ...style }}>
      <span className={`sl-sw${sway ? " on" : ""}`}>
        {Z.map((z, i) => (
          <span key={i} className={`sl-l ${Math.abs(z) === 1 ? "sl-face" : "sl-wall"}`} style={{ transform: `translateZ(${(z * half).toFixed(2)}px)` }}>{Math.abs(z) === 1 ? face : wall || face}</span>
        ))}
      </span>
    </span>
  );
}

// Flat version of the same picture, used for cast shadows (no thickness needed).
export const Flat = ({ size, face, className = "" }) => <span className={`sl-flat ${className}`} style={{ width: size, height: size }}>{face}</span>;
