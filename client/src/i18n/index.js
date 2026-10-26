// UI language. English is the source; Hindi, Telugu and Tamil are first drafts (see ./*.json, `_meta.needsReview`).
import { useEffect, useState } from "react";
import en from "./en.json";
import hi from "./hi.json";
import te from "./te.json";
import ta from "./ta.json";
import { makeT, isLang, LANGS } from "./core";

const DICTS = { en, hi, te, ta };
const KEY = "ff-lang";
const subs = new Set();
let lang = (() => { try { const v = localStorage.getItem(KEY); return isLang(v) ? v : "en"; } catch { return "en"; } })();
let tFn = makeT(DICTS, lang);
const apply = () => { try { document.documentElement.lang = lang; } catch { /* ignore */ } };
apply();

export const getLang = () => lang;
export const t = (key, vars) => tFn(key, vars);
export function setLang(next) {
  if (!isLang(next)) return;
  lang = next; tFn = makeT(DICTS, lang);
  try { localStorage.setItem(KEY, lang); } catch { /* private mode */ }
  apply(); subs.forEach((f) => f(lang));
}
export { LANGS };
export const needsReview = (l = lang) => !!DICTS[l]?._meta?.needsReview;
/** Re-renders the component when the language changes. Returns { t, lang }. */
export function useT() {
  const [l, setL] = useState(lang);
  useEffect(() => { subs.add(setL); return () => subs.delete(setL); }, []);
  return { t: (k, v) => tFn(k, v), lang: l };
}
