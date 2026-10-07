// One rigged character (skeleton + IK, see rig.js). Still until you hover it (mouse) or tap it (touch, plays 4s). Nothing runs in the background.
import { useCallback, useEffect, useRef } from "react";
import { render, stillT } from "./rig";

const calm = () => typeof document !== "undefined" && (document.documentElement.classList.contains("ff-calm") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

export default function RigBuddy({ who, act, size = 96, label, className = "" }) {
  const box = useRef(null), raf = useRef(0), tmo = useRef(0);
  const draw = useCallback((t) => { if (box.current) box.current.innerHTML = render(who, act, t, { bg: false, size }); }, [who, act, size]);
  const stop = useCallback(() => { cancelAnimationFrame(raf.current); raf.current = 0; clearTimeout(tmo.current); draw(stillT(act)); }, [draw, act]);
  const play = useCallback((ms) => {
    if (calm() || raf.current) return;
    const t0 = performance.now(), base = stillT(act);
    const tick = (n) => { draw(base + (n - t0) / 1000); raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
    if (ms) { clearTimeout(tmo.current); tmo.current = setTimeout(stop, ms); }
  }, [draw, stop, act]);

  useEffect(() => { draw(stillT(act)); return () => { cancelAnimationFrame(raf.current); raf.current = 0; clearTimeout(tmo.current); }; }, [draw, act]);

  return (
    <span ref={box} className={`bd bd-rig ${className}`} style={{ width: size, height: size }} role="img" aria-label={label}
      onPointerEnter={(e) => { if (e.pointerType !== "touch") play(); }}
      onPointerLeave={(e) => { if (e.pointerType !== "touch") stop(); }}
      onPointerDown={(e) => { if (e.pointerType === "touch") (raf.current ? stop() : play(4000)); }} />
  );
}
