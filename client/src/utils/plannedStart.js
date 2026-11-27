// A planned workout that the person pressed "Start" on: carried from the planner to the Gym log, which walks through its exercises (see planStart.js).
// Kept per account for the browser session, so a refresh in the middle of a workout does not lose it; if storage is blocked it is kept in memory.
import { useSyncExternalStore } from "react";
import { currentOwner } from "./cacheOwner";
import { cleanStart as clean } from "./planStart";

const key = () => `ff-plan-start:${currentOwner() || "anon"}`;
const listeners = new Set();
let mem = null, memOnly = false;
let cache = { raw: "\u0000", val: null };

function rawNow() { if (!memOnly) { try { return sessionStorage.getItem(key()); } catch { memOnly = true; } } return mem; }
function snap() {
  const raw = rawNow();
  if (raw === cache.raw) return cache.val;
  let val = null;
  try { val = clean(JSON.parse(raw || "null")); } catch { val = null; }
  cache = { raw, val };
  return val;
}
function write(v) {
  const raw = v ? JSON.stringify(v) : null;
  if (!memOnly) { try { if (raw) sessionStorage.setItem(key(), raw); else sessionStorage.removeItem(key()); } catch { memOnly = true; } }
  if (memOnly) mem = raw;
  listeners.forEach((f) => f());
}

export const readPlannedStart = snap;
/** `item` is a planner item ({ _id, date, title, kind, exercises }). */
export function beginPlannedStart(item) { write(clean({ item: { id: item._id || item.id, date: item.date, title: item.title, kind: item.kind, exercises: item.exercises }, skipped: [] })); }
export function skipPlannedStep(stepKey) { const c = snap(); if (c && !c.skipped.includes(stepKey)) write({ ...c, skipped: [...c.skipped, stepKey] }); }
export function endPlannedStart() { write(null); }
export function usePlannedStart() { return useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, snap, () => null); }
