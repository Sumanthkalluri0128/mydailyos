// Pure translation core (twin of web/client/src/i18n/core.js). t(key, vars): chosen language -> English -> the key itself.
export const LANGS = ['en', 'hi', 'te', 'ta'] as const;
export type Lang = typeof LANGS[number];
export type Dict = Record<string, any>;
export const fill = (str: string, vars?: Record<string, any>) =>
  String(str).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
export function makeT(dicts: Record<string, Dict>, lang: string) {
  const pick = (d: Dict | undefined, key: string) => (d && typeof d[key] === 'string' && d[key] !== '' && !key.startsWith('_') ? (d[key] as string) : undefined);
  return (key: string, vars?: Record<string, any>) => fill(pick(dicts[lang], key) ?? pick(dicts.en, key) ?? key, vars);
}
export const isLang = (x: any): x is Lang => (LANGS as readonly string[]).includes(x);
export const missingKeys = (dicts: Record<string, Dict>, lang: string) => Object.keys(dicts.en || {}).filter((k) => !k.startsWith('_') && !(typeof dicts[lang]?.[k] === 'string' && dicts[lang][k] !== ''));
export function placeholderProblems(dicts: Record<string, Dict>, lang: string) {
  const ph = (s: string) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
  return Object.keys(dicts.en || {}).filter((k) => !k.startsWith('_') && typeof dicts[lang]?.[k] === 'string' && ph(dicts[lang][k]) !== ph(dicts.en[k]));
}
