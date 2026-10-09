// A little stage between sections: today's character and a random rival who, every few seconds, fight, dance or just hang out.
// Tap the stage to start something. Fights: charge, clash (shake + POW), retreat. Dances: hop, sway, flip, music notes.
import { useEffect, useMemo, useState } from "react";
import "./characters.css";
import { CHARS, dayChar, sprite, wallOf } from "./chars";
import Slab from "./Slab";

const IDLE = { zoro: "wave", jinwoo: "wave", naruto: "task", luffy: "task", goku: "wave", gojo: "wave" };
const DANCE = { zoro: ["cheer", "wave"], jinwoo: ["cheer", "wave"], naruto: ["task", "walk"], luffy: ["task", "walk"], goku: ["cheer", "wave"], gojo: ["cheer", "wave"] };
const WORDS = ["POW!", "BAM!", "WHAM!", "KAPOW!", "CLANG!"];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const calm = () => typeof document !== "undefined" && (document.documentElement.classList.contains("ff-calm") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

export default function BuddyStage({ size = 120, className = "" }) {
  const pair = useMemo(() => { const a = dayChar(); return [a, pick(Object.keys(CHARS).filter((k) => k !== a))]; }, []);
  const [mode, setMode] = useState("idle");
  const [step, setStep] = useState(0);
  const [word, setWord] = useState(WORDS[0]);
  const still = calm();

  useEffect(() => { // preload every pose this pair can use
    pair.forEach((w) => ["walk", "lift", IDLE[w], ...DANCE[w]].forEach((s) => { const i = new Image(); i.src = sprite(w, s); }));
  }, [pair]);

  useEffect(() => { // pick the next activity at random
    if (still) return undefined;
    const t = setTimeout(() => setMode((m) => pick(["fight", "dance", "dance", "fight", "idle"].filter((x) => x !== m))), mode === "idle" ? rnd(1800, 3200) : rnd(4500, 7500));
    return () => clearTimeout(t);
  }, [mode, still]);

  useEffect(() => { // beat of the current activity
    if (still || mode === "idle") return undefined;
    setStep(0);
    const t = setInterval(() => setStep((s) => s + 1), mode === "fight" ? 480 : 420);
    return () => clearInterval(t);
  }, [mode, still]);

  const phase = step % 4; // fight: 0 charge, 1-2 clash, 3 retreat
  const clash = mode === "fight" && (phase === 1 || phase === 2);
  useEffect(() => { if (mode === "fight" && phase === 1) setWord(pick(WORDS)); }, [mode, phase]);

  const gap = size * 1.05, reach = gap / 2 + size * 0.22;
  const view = pair.map((who, i) => {
    let s = IDLE[who], anim = "idle", tx = 0, flip = i === 1 ? -1 : 1;
    if (mode === "fight") {
      if (phase === 0) { s = "walk"; tx = reach; anim = "run"; } else if (clash) { s = "lift"; tx = reach; anim = "shake"; } else { s = "walk"; tx = 0; anim = "idle"; flip = -flip; }
    } else if (mode === "dance") {
      s = DANCE[who][(step + i) % 2]; anim = i ? "dance2" : "dance"; flip = (step + i) % 2 ? -flip : flip;
    }
    return { who, s, anim, tx: i === 0 ? tx : -tx, flip };
  });

  const caption = mode === "fight" ? `${CHARS[pair[0]]} vs ${CHARS[pair[1]]}!` : mode === "dance" ? "Dance party!" : `${CHARS[pair[0]]} is on duty today`;
  return (
    <div className={`bds ${className}`} style={{ "--sz": `${size}px`, "--gap": `${gap}px` }} onClick={() => { setMode((m) => (m === "fight" ? "dance" : "fight")); }} role="img" aria-label={caption}>
      <div className="bds-row">
        {view.map((v, i) => (
          <span key={v.who} className="bds-c" style={{ transform: `translateX(${v.tx}px)` }}>
            <span className="bds-f">
              <span className={`bds-img bds-${v.anim}`} style={{ width: size, height: size }}>
                <Slab size={size} yaw={v.flip === 1 ? 0 : 180} lean={-v.flip * (v.anim === "run" ? 26 : 12)} look={10} face={<img className="bdi-pic" src={sprite(v.who, v.s)} alt="" width={size} height={size} draggable="false" />} wall={<img className="bdi-pic" src={wallOf(sprite(v.who, v.s))} alt="" width={size} height={size} draggable="false" />} />
              </span>
            </span>
          </span>
        ))}
        {clash && <span key={`${step}`} className="bds-hit">💥<b>{word}</b></span>}
        {mode === "dance" && <span className="bds-notes" aria-hidden="true"><i>♪</i><i>♫</i><i>♪</i></span>}
      </div>
      <div className="bds-cap">{caption}</div>
    </div>
  );
}
