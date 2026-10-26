// Saved place + today's forecast for the hot-day water goal. Opt-in (off by default). Silent when offline or when the weather
// service does not answer: the goal simply stays as it was. Only a place name and rounded coordinates leave the browser.
import { useSyncExternalStore } from "react";
import { getLocalDate } from "./date";
import { adjustWater, cacheUsable, forecastUrl, geocodeUrl, parseForecast, parseGeocode } from "./weatherWater";

const KEY = "ff-weather-v1";
const read = () => { try { const j = JSON.parse(localStorage.getItem(KEY) || "null"); return j && typeof j === "object" ? j : { enabled: false }; } catch { return { enabled: false }; } };
let state = read();
const subs = new Set();
const save = (next) => { state = next; try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ } subs.forEach((f) => f()); };
export const getWeatherState = () => state;
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };

const getJson = async (url) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error("weather"); return await r.json(); } finally { clearTimeout(t); }
};

export const setWeatherEnabled = (enabled) => save({ ...state, enabled });
export const setWeatherPlace = (place) => save({ ...state, place, cache: null });
export const clearWeather = () => save({ enabled: false });
export async function searchPlaces(name) {
  if (String(name).trim().length < 2) return [];
  return parseGeocode(await getJson(geocodeUrl(name)));
}

/** Fetches today's forecast if needed. Never throws; on any problem the last forecast for today (if any) stays in use. */
export async function refreshWeather() {
  const s = state;
  if (!s.enabled || !s.place) return;
  const date = getLocalDate();
  const where = { date, lat: s.place.lat, lon: s.place.lon };
  if (cacheUsable(s.cache, where)) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  try {
    const f = parseForecast(await getJson(forecastUrl(s.place.lat, s.place.lon, date)), date);
    if (f) save({ ...state, cache: { date, lat: s.place.lat, lon: s.place.lon, maxC: f.maxC, at: Date.now() } });
  } catch { /* silent: the goal stays as it was */ }
}

/** Same rule without React (for code that already sits after early returns). */
export function currentBoost(baseMl) {
  const s = state, date = getLocalDate();
  const usable = s.enabled && s.place && s.cache && cacheUsable(s.cache, { date, lat: s.place.lat, lon: s.place.lon, offline: true });
  return adjustWater(baseMl, usable ? s.cache : null);
}

/** The water goal after the hot-day rule: { goalMl, bonusMl, reason }. Kicks off a refresh once per mount. */
export function useWaterBoost(baseMl) {
  const s = useSyncExternalStore(subscribe, getWeatherState);
  useRefreshOnce();
  const date = getLocalDate();
  const usable = s.enabled && s.place && s.cache && cacheUsable(s.cache, { date, lat: s.place.lat, lon: s.place.lon, offline: true });
  return adjustWater(baseMl, usable ? s.cache : null);
}
import { useEffect } from "react";
function useRefreshOnce() { useEffect(() => { refreshWeather(); }, []); }
