// Simple vs advanced mode. The server decides what is unlocked (/api/coach/features); this cache lets the nav render at once.
// If nothing is known yet (first run offline) everything stays visible, so a network problem never hides a feature.
import { useEffect, useState } from "react";
import { API_URL } from "../config";
import { apiFetch } from "../config/api";
import { notify } from "./notify";
import { t } from "../i18n";

const KEY = "ff-features";
let state = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } })();
const subs = new Set();
function apply(s) {
  state = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
  subs.forEach((f) => f(s));
}
export const isVisible = (id) => !state || !Array.isArray(state.visible) || state.visible.includes(id);
export const getFeatures = () => state;

const NAME_KEY = { recipes: "nav.recipes", health: "nav.health", goals: "nav.goals", habit: "nav.habit", achievements: "nav.goals", weekly: "nav.progress", northstar: "nav.goals" };
export async function loadFeatures() {
  try {
    const r = await apiFetch(`${API_URL}/api/coach/features`);
    if (!r.ok) return;
    const j = await r.json();
    const fresh = j.newlyUnlocked || [];
    apply(j);
    // First visit: the sensei explains simple mode once (nothing is announced about the starting set).
    if (fresh.length) {
      const first = !localStorage.getItem("ff-features-intro");
      try { localStorage.setItem("ff-features-intro", "1"); } catch { /* ignore */ }
      if (!first) {
        const names = fresh.filter((id) => NAME_KEY[id]).map((id) => t(NAME_KEY[id]));
        if (names.length) notify(t("mode.unlocked", { name: [...new Set(names)].join(", ") }), "success", 5200);
      } else if (!j.showAll) notify(t("mode.sensei"), "info", 5200);
      apiFetch(`${API_URL}/api/coach/features/seen`, { method: "POST", body: JSON.stringify({ ids: fresh }) }).catch(() => {});
    }
  } catch { /* keep the cached copy */ }
}
export async function setShowAll(on) {
  const r = await apiFetch(`${API_URL}/api/coach/features`, { method: "PUT", body: JSON.stringify({ showAll: !!on }) });
  if (!r.ok) throw new Error("Could not save that");
  apply(await r.json());
}
export function useFeatures() {
  const [s, setS] = useState(state);
  useEffect(() => { subs.add(setS); return () => subs.delete(setS); }, []);
  return s || { showAll: true, visible: null, locked: [] };
}
