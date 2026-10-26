// Pure translation core (no React, no storage) so it can be tested and copied to mobile unchanged.
// t(key, vars): chosen language -> English -> the key itself. {name} placeholders are filled from vars.
export const LANGS = ["en", "hi", "te", "ta"];
export function fill(str, vars) {
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
}
export function makeT(dicts, lang) {
  const pick = (d, key) => (d && typeof d[key] === "string" && d[key] !== "" && !key.startsWith("_") ? d[key] : undefined);
  return (key, vars) => {
    const raw = pick(dicts[lang], key) ?? pick(dicts.en, key) ?? key;
    return fill(raw, vars);
  };
}
export const isLang = (x) => LANGS.includes(x);
// Which keys a language still lacks (they will show English).
export const missingKeys = (dicts, lang) => Object.keys(dicts.en || {}).filter((k) => !k.startsWith("_") && !(dicts[lang] && typeof dicts[lang][k] === "string" && dicts[lang][k] !== ""));
// Placeholders must match the English string, or the translated line would show "{what}" or lose a value.
export function placeholderProblems(dicts, lang) {
  const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(",");
  return Object.keys(dicts.en || {}).filter((k) => !k.startsWith("_") && typeof dicts[lang]?.[k] === "string" && ph(dicts[lang][k]) !== ph(dicts.en[k]));
}
