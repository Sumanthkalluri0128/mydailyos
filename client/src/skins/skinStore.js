// Which skin is active right now, and the little bit of state around it.
//  - auto (default): one skin per day, picked by pickSkin() from the person's sex (profile) and the local date.
//  - "day": the person pressed Shuffle, so that skin is used for the rest of today, then auto resumes tomorrow.
//  - "pin": the person locked a skin; it stays until they unlock it.
import { useSyncExternalStore } from "react";
import { getLocalDate } from "../utils/date";
import { SKIN_BY_ID, poolFor, pickSkin, shuffleSkin, skinCss } from "./skins";

const PREF_KEY = "ff_skin_pref";
const SEX_KEY = "ff_sex";
const SALT_KEY = "ff_skin_salt";
const THEME_KEY = "mydailyos_theme"; // light / dark choice owned by App.jsx

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode: lasts until reload */ } };
const readPref = () => { try { return JSON.parse(read(PREF_KEY) || "null"); } catch { return null; } };

let sex = read(SEX_KEY) || "";
let salt = read(SALT_KEY) || "";
let pref = readPref();
let state = compute();
const listeners = new Set();

function compute() {
  const date = getLocalDate();
  const pool = poolFor(sex);
  const ok = (id) => SKIN_BY_ID[id] && pool.some((s) => s.id === id);
  let skin = null, mode = "auto";
  if (pref?.mode === "pin" && ok(pref.id)) { skin = SKIN_BY_ID[pref.id]; mode = "pin"; }
  else if (pref?.mode === "day" && pref.date === date && ok(pref.id)) { skin = SKIN_BY_ID[pref.id]; mode = "day"; }
  if (!skin) skin = pickSkin({ sex, date, salt });
  return { skin, mode, date };
}

function apply(skin) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!document.getElementById("ff-skins")) {
    const el = document.createElement("style");
    el.id = "ff-skins";
    el.textContent = skinCss();
    document.head.appendChild(el);
  }
  root.setAttribute("data-ff-skin", skin.family); // colours and layout come from the family
  root.setAttribute("data-ff-scene", skin.id);
  root.setAttribute("data-ff-char", skin.char);
  // Always-dark skins force dark; the others follow the person's light / dark choice (or the system setting).
  const saved = read(THEME_KEY);
  const system = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  root.setAttribute("data-theme", skin.force || (saved === "light" || saved === "dark" ? saved : system));
}

function commit() {
  const next = compute();
  const changed = next.skin.id !== state.skin.id || next.mode !== state.mode || next.date !== state.date;
  state = changed ? next : state;
  apply(state.skin);
  if (changed) listeners.forEach((l) => l());
}

let timer = null;
function scheduleMidnight() {
  clearTimeout(timer);
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
  timer = setTimeout(() => { commit(); scheduleMidnight(); }, Math.max(1000, next - now));
}

/** Call once before the first render (main.jsx) so there is no flash of the wrong colours. */
export function initSkins() {
  apply(state.skin);
  scheduleMidnight();
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (!document.hidden) commit(); });
}

/** App.jsx calls this when the profile loads, so the right set (women / men) is used from then on. */
export function setSkinProfile(profile) {
  const nextSex = profile?.sex === "female" || profile?.sex === "male" ? profile.sex : "";
  const nextSalt = String(profile?._id || profile?.id || profile?.email || "");
  if (nextSex === sex && nextSalt === salt) return;
  sex = nextSex; salt = nextSalt;
  write(SEX_KEY, sex || null); write(SALT_KEY, salt || null);
  commit();
}

export function shuffleToday() {
  const next = shuffleSkin({ sex, currentId: state.skin.id });
  pref = { mode: "day", id: next.id, date: getLocalDate() };
  write(PREF_KEY, JSON.stringify(pref));
  commit();
}
export function togglePin() {
  pref = state.mode === "pin" ? null : { mode: "pin", id: state.skin.id };
  write(PREF_KEY, pref ? JSON.stringify(pref) : null);
  commit();
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
export function useSkin() {
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  return { skin: s.skin, mode: s.mode, shuffle: shuffleToday, togglePin };
}
