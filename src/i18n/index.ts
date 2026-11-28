// UI language on mobile. English is the source; Hindi, Telugu and Tamil are first drafts (see ./*.json, `_meta.needsReview`).
// Same files as the web app. Fix wording there with `node tools/i18n.js export|import` and copy the JSON back.
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './en.json';
import hi from './hi.json';
import te from './te.json';
import ta from './ta.json';
import { makeT, isLang, LANGS, type Lang } from './core';

const DICTS: Record<string, any> = { en, hi, te, ta };
const KEY = 'ff-lang';
let lang: Lang = 'en';
let tFn = makeT(DICTS, lang);
const subs = new Set<(l: Lang) => void>();
let loaded = false;

export async function loadLang(): Promise<void> {
  if (loaded) return; loaded = true;
  try { const v = await AsyncStorage.getItem(KEY); if (isLang(v) && v !== lang) { lang = v; tFn = makeT(DICTS, lang); subs.forEach((f) => f(lang)); } } catch { /* keep English */ }
}
export const getLang = () => lang;
export const t = (key: string, vars?: Record<string, any>) => tFn(key, vars);
export async function setLang(next: Lang): Promise<void> {
  if (!isLang(next)) return;
  lang = next; tFn = makeT(DICTS, lang);
  AsyncStorage.setItem(KEY, next).catch(() => {});
  subs.forEach((f) => f(lang));
}
export const needsReview = (l: string = lang) => !!DICTS[l]?._meta?.needsReview;
export { LANGS };
export function useT() {
  const [l, setL] = useState<Lang>(lang);
  useEffect(() => { loadLang(); subs.add(setL); return () => { subs.delete(setL); }; }, []);
  return { t: (k: string, v?: Record<string, any>) => tFn(k, v), lang: l };
}
