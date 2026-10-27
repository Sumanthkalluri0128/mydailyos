import { useEffect, useState } from "react";
import { apiFetch } from "../config/api";
import { currentOwner } from "./cacheOwner";
import { parseFlags, flagsFresh, flagOn } from "./flags";

// Saved per signed-in person (a different person on the same browser never sees someone else's flags).
const keyFor = () => `ff_flags:${currentOwner()}`;
const listeners = new Set();
let memory = null; // { owner, flags }

function readSaved() {
  try { const e = JSON.parse(localStorage.getItem(keyFor()) || "null"); return e && { at: Number(e.at), flags: parseFlags(e.flags) }; } catch { return null; }
}
export function getFlags() {
  const owner = currentOwner();
  if (!memory || memory.owner !== owner) memory = { owner, flags: readSaved()?.flags || {} };
  return memory.flags;
}
/** Loads flags: instantly from the saved copy; asks the server when the copy is old and we are online. Never throws. */
export async function refreshFlags({ force = false } = {}) {
  if (!currentOwner()) return getFlags();
  const saved = readSaved();
  if (!force && flagsFresh(saved)) return getFlags();
  if (typeof navigator !== "undefined" && navigator.onLine === false) return getFlags();
  try {
    const res = await apiFetch("/api/flags");
    if (!res.ok) return getFlags();
    const d = await res.json();
    const flags = parseFlags(d.flags);
    try { localStorage.setItem(keyFor(), JSON.stringify({ at: Date.now(), flags })); } catch { /* storage full or blocked: the in-memory copy still works */ }
    memory = { owner: currentOwner(), flags };
    listeners.forEach((fn) => fn());
  } catch { /* offline or server asleep: keep what we have */ }
  return getFlags();
}
/** React hook: const on = useFlag("new-chart"); false until the server says otherwise. */
export function useFlag(key, fallback = false) {
  const [, tick] = useState(0);
  useEffect(() => { const fn = () => tick((n) => n + 1); listeners.add(fn); refreshFlags(); return () => listeners.delete(fn); }, []);
  return flagOn(getFlags(), key, fallback);
}
