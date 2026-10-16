// A little stage between sections: today's character and a random rival who, every few seconds, fight, dance or hang out.
// Tap the stage to start something. Fights: charge, clash (shake + POW), retreat. Dances: hop and swap happy stickers.
import { useEffect, useMemo, useState } from "react";
import "./stickers.css";
import { ALL, dayChar, stickerFor } from "./chars";

const WORDS = ["POW!", "BAM!", "WHAM!", "KAPOW!", "CLANG!"];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const calm = () => typeof document !== "undefined" && (document.documentElement.classList.contains("ff-calm") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

export default function BuddyStage({ size = 120, className = "" }) {
  const pair = useMemo(() => { const a = dayChar(); return [a, pick(ALL.filter((k) => k !== a))]; }, []);
  const [mode, setMode] = useState("idle");
  const [step, setStep] = useState(0);
  const [word, setWord] = useState(WORDS[0]);
  const still = calm();

  useEffect(() => { // pick the next activity at random
    if (still) return undefined;
    const t = setTimeout(() => setMode((m) => pick(["fight", "dance", "dance", "fight", "idle"].filter((x) => x !== m))), mode === "idle" ? rnd(1800, 3200) : rnd(3200, 5200));
    return () => clearTimeout(t);
  }, [mode, still]);

  useEffect(() => { // beat of the current activity
    if (still || mode === "idle") return undefined;
    setStep(0);
    const t = setInterval(() => setStep((s) => s + 1), mode === "fight" ? 480 : 420);
    return () => clearInterval(t);
  }, [mode, still]);

  const phase = step % 4;                       // fight: 0 charge, 1-2 clash, 3 retreat
  const clash = mode === "fight" && (phase === 1 || phase === 2);
  useEffect(() => { if (clash && phase === 1) setWord(pick(WORDS)); }, [clash, phase]);
  const reach = mode === "fight" ? (phase === 0 || phase === 3 ? size * 0.12 : size * 0.34) : 0;
  const scenes = mode === "fight" ? ["fight", "powerup"] : mode === "dance" ? ["cheer", "victory", "wave", "levelup"] : ["wave", "think"];
  const pose = (i) => stickerFor(pair[i], mode === "fight" && (phase === 3) ? "sad" : scenes[(i + step) % scenes.length], i * 7 + (mode === "idle" ? 0 : step >> 1));
  const hopY = (i) => (mode === "dance" ? ((step + i) % 2 ? -size * 0.16 : 0) : 0);

  return (
    <div className={`bs ${className}`} style={{ "--bsh": `${size * 1.3}px` }} onClick={() => setMode((m) => (m === "fight" ? "dance" : "fight"))} role="img" aria-label="Two characters playing — tap to change the game">
      {pair.map((who, i) => (
        <span key={who} className={`bs-c ${clash ? "is-shake" : ""}`} style={{ "--bx": `${i === 0 ? reach : -reach}px`, "--bf": i === 0 ? 1 : -1, translate: `0 ${hopY(i)}px` }}>
          <img src={pose(i).src} alt="" width={size} height={size} draggable="false" />
        </span>
      ))}
      {clash && <span className="bs-word">{word}</span>}
    </div>
  );
}
