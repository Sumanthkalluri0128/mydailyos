import { useEffect, useRef, useState } from "react";
import Buddy from "../motion/Buddy";
import { LOCALES, speechSupported, startListening } from "../utils/speech";
import "./logging1.css";

// Character mic: tap, speak ("do roti aur dal"), the heard text goes to the editable review. Nothing is logged from here.
export default function VoiceMic({ onText, onError }) {
  const [on, setOn] = useState(false);
  const [locale, setLocale] = useState(() => { try { return localStorage.getItem("ff-voice-locale") || "en-IN"; } catch { return "en-IN"; } });
  const [live, setLive] = useState("");
  const h = useRef(null);
  useEffect(() => () => h.current?.stop(), []);
  if (!speechSupported()) return null;
  const toggle = () => {
    if (on) { h.current?.stop(); return; }
    setLive(""); setOn(true);
    h.current = startListening(locale, {
      onResult: (t, final) => { setLive(t); if (final) onText?.(t); },
      onEnd: () => setOn(false),
      onError: (m) => { setOn(false); onError?.(m); },
    });
  };
  return (
    <span className="voice-mic-wrap">
      <button type="button" className={`secondary-button voice-mic${on ? " listening" : ""}`} onClick={toggle} aria-pressed={on} aria-label={on ? "Stop listening" : "Speak your meal"}>
        <Buddy scene={on ? "powerup" : "wave"} size={28} talk={false} /> {on ? "Listening…" : "Speak"}
      </button>
      <select value={locale} onChange={(e) => { setLocale(e.target.value); try { localStorage.setItem("ff-voice-locale", e.target.value); } catch { /* private mode */ } }} aria-label="Speech language">
        {LOCALES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
      </select>
      <span className="sr-only" aria-live="polite">{on ? `Heard: ${live}` : ""}</span>
      {on && live && <small> “{live}”</small>}
    </span>
  );
}
