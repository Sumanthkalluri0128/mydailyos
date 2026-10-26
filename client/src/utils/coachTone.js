// Coach tone + gentle mode. The copy comes from the server (/api/coach/tone) and is cached on this device so the characters
// can speak synchronously. Gentle mode adds the `ff-gentle` class to <html>, which hides calorie numbers (see coachcards.css).
import { useEffect, useState } from "react";
import { API_URL } from "../config";
import { apiFetch } from "../config/api";
import { setToneBundle } from "../motion/talk";

const KEY = "ff-coach-tone";
let state = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } })();
const subs = new Set();
function apply(s) {
  state = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
  document.documentElement.classList.toggle("ff-gentle", !!s?.gentle);
  setToneBundle(s && s.tone !== "funny" ? s : null);
  subs.forEach((f) => f(s));
}
if (state) { document.documentElement.classList.toggle("ff-gentle", !!state.gentle); setToneBundle(state.tone !== "funny" ? state : null); }

export async function loadTone() {
  try { const r = await apiFetch(`${API_URL}/api/coach/tone`); if (r.ok) apply(await r.json()); } catch { /* keep the cached copy offline */ }
}
export async function saveToneSettings(patch) {
  const r = await apiFetch(`${API_URL}/api/coach/settings`, { method: "PUT", body: JSON.stringify(patch) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || "Could not save that");
  apply(j);
  return j;
}
export const getTone = () => state?.tone || "funny";
export const isGentle = () => !!state?.gentle;
export function useCoachTone() {
  const [s, setS] = useState(state);
  useEffect(() => { subs.add(setS); return () => subs.delete(setS); }, []);
  return s || { tone: "funny", gentle: false, tones: ["gentle", "strict", "funny"] };
}
