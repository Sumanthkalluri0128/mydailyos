// Roaming cast: Zoro, Naruto, Luffy and Jin-Woo wander the WHOLE page (login, signup and every screen), fighting with their own
// signature moves, eating, lifting, drinking and dancing while they travel. Tap one and it dashes somewhere new and does a move.
import { useEffect, useRef, useState } from "react";
import "./roamers.css";
import { CHARS, sprite } from "./chars";

const MOVES = {
  zoro:    { fight: ["Three-sword style!", "Oni Giri!", "108 Pound Phoenix!"], fx: "#22c55e", eat: "Sake time!" },
  naruto:  { fight: ["Rasengan!", "Shadow clone jutsu!", "Believe it!"],      fx: "#38bdf8", eat: "Ichiraku ramen!" },
  luffy:   { fight: ["Gum-Gum Pistol!", "Gear 2!", "Gum-Gum Bazooka!"],       fx: "#ef4444", eat: "MEAT!!" },
  jinwoo:  { fight: ["Shadow strike!", "Arise!", "Shadow exchange!"],         fx: "#8b5cf6", eat: "Recovering HP…" },
};
const POSE = { fight: "lift", eat: "eat", drink: "drink", lift: "lift", dance: "cheer", walk: "walk", wave: "wave", task: "task", rest: "sad" };
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const calm = () => document.documentElement.classList.contains("ff-calm") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function Roamers() {
  const small = typeof window !== "undefined" && window.innerWidth < 640;
  const size = small ? 68 : 96;
  const keys = useRef(Object.keys(CHARS).slice(0, small ? 3 : 4)).current;
  const spot = () => ({ x: rnd(8, Math.max(60, window.innerWidth - size - 8)), y: rnd(70, Math.max(120, window.innerHeight - size - 12)) });
  const [cast, setCast] = useState(() => keys.map((who) => ({ who, ...spot(), pose: "walk", anim: "idle", flip: 1, say: "", fx: false })));
  const busy = useRef(false);
  const timers = useRef([]);
  const still = useRef(false);

  const patch = (who, p) => setCast((c) => c.map((m) => (m.who === who ? { ...m, ...p } : m)));
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.current.push(t); };
  const go = (who, to, pose = "walk", anim = "run") => {
    setCast((c) => c.map((m) => (m.who === who ? { ...m, ...to, pose, anim, flip: to.x < m.x ? -1 : 1 } : m)));
  };

  const fight = (a, b) => {
    const mid = spot(), gap = size * 0.55;
    go(a, { x: mid.x - gap, y: mid.y }); go(b, { x: mid.x + gap, y: mid.y });
    later(() => { // clash
      const m = pick(MOVES[a].fight);
      patch(a, { pose: "lift", anim: "shake", say: m, fx: true, flip: 1 });
      patch(b, { pose: "lift", anim: "shake", say: pick(MOVES[b].fight), fx: true, flip: -1 });
    }, 1900);
    later(() => { patch(a, { say: "", fx: false }); patch(b, { say: "", fx: false }); go(a, spot()); go(b, spot()); }, 4200);
    later(() => { busy.current = false; }, 6200);
  };

  const solo = (who, kind) => { // travel to a spot, then do the thing there
    go(who, spot());
    later(() => patch(who, { pose: POSE[kind], anim: kind === "dance" ? "dance" : kind === "lift" ? "lift" : "eat", say: kind === "eat" ? MOVES[who].eat : kind === "dance" ? "♪ ♫" : "" }), 1900);
    later(() => patch(who, { say: "", pose: "walk", anim: "idle" }), 4600);
  };

  const scene = () => {
    if (busy.current || still.current) return;
    const kind = pick(["fight", "fight", "feast", "train", "dance", "patrol"]);
    const [a, b, c, d] = [...keys].sort(() => Math.random() - 0.5);
    if (kind === "fight") { busy.current = true; fight(a, b); if (c) solo(c, "eat"); if (d) solo(d, "dance"); }
    else if (kind === "feast") { solo(a, "eat"); solo(b, "drink"); if (c) go(c, spot()); }
    else if (kind === "train") { solo(a, "lift"); solo(b, "lift"); }
    else if (kind === "dance") keys.forEach((k) => solo(k, "dance"));
    else keys.forEach((k) => go(k, spot()));
  };

  useEffect(() => {
    still.current = calm();
    keys.forEach((w) => ["walk", "lift", "eat", "drink", "cheer", "wave", "task", "sad"].forEach((s) => { const i = new Image(); i.src = sprite(w, s); }));
    const id = setInterval(scene, 6500);
    later(scene, 800);
    return () => { clearInterval(id); timers.current.forEach(clearTimeout); };
  }, []);

  const poke = (who) => { // tap: dash somewhere new and show off a signature move
    const m = pick(MOVES[who].fight);
    go(who, spot(), "walk", "run");
    later(() => patch(who, { pose: "lift", anim: "shake", say: m, fx: true }), 1100);
    later(() => patch(who, { pose: "cheer", anim: "dance", say: "", fx: false }), 2600);
    later(() => patch(who, { pose: "walk", anim: "idle" }), 4200);
  };

  return (
    <div className="rm-layer" aria-hidden="true">
      {cast.map((m) => (
        <button key={m.who} type="button" tabIndex={-1} className="rm-c" title={CHARS[m.who]} onClick={() => poke(m.who)}
          style={{ transform: `translate(${m.x}px, ${m.y}px)`, "--sz": `${size}px`, "--fx": MOVES[m.who].fx }}>
          {m.say && <span className="rm-say">{m.say}</span>}
          {m.fx && <span className="rm-burst" />}
          <span className="rm-f" style={{ transform: `scaleX(${m.flip})` }}>
            <img className={`rm-img rm-${m.anim}`} src={sprite(m.who, m.pose)} width={size} height={size} alt="" draggable="false" />
          </span>
        </button>
      ))}
    </div>
  );
}
