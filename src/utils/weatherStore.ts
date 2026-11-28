// Saved place + today's forecast for the hot-day water goal (mobile). Opt-in, off by default, silent when offline or when the
// weather service does not answer. Only a place name and rounded coordinates leave the phone. No location permission is needed.
import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { today } from '../config/api';
import { adjustWater, cacheUsable, forecastUrl, geocodeUrl, parseForecast, parseGeocode } from './weatherWater';

export type Place = { name: string; admin: string; country: string; lat: number; lon: number };
type State = { enabled: boolean; place?: Place; cache?: { date: string; lat: number; lon: number; maxC: number; at: number } | null };
const KEY = 'flexfit_weather_v1';
let state: State = { enabled: false };
const subs = new Set<() => void>();
const save = (next: State) => { state = next; AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {}); subs.forEach((f) => f()); };
AsyncStorage.getItem(KEY).then((raw) => { try { const j = JSON.parse(raw || 'null'); if (j && typeof j === 'object') { state = j; subs.forEach((f) => f()); } } catch {} }).catch(() => {});

export const getWeatherState = () => state;
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

async function getJson(url: string) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error('weather'); return await r.json(); } finally { clearTimeout(t); }
}
export const setWeatherPlace = (place: Place) => save({ enabled: true, place, cache: null });
export const clearWeather = () => save({ enabled: false });
export async function searchPlaces(name: string): Promise<Place[]> {
  if (name.trim().length < 2) return [];
  return parseGeocode(await getJson(geocodeUrl(name)));
}

/** Fetches today's forecast if needed. Never throws; on any problem the last forecast for today (if any) stays in use. */
export async function refreshWeather() {
  const s = state;
  if (!s.enabled || !s.place) return;
  const date = today();
  const where = { date, lat: s.place.lat, lon: s.place.lon };
  if (cacheUsable(s.cache, where)) return;
  try {
    const f = parseForecast(await getJson(forecastUrl(s.place.lat, s.place.lon, date)), date);
    if (f) save({ ...state, cache: { date, lat: s.place.lat, lon: s.place.lon, maxC: f.maxC, at: Date.now() } });
  } catch { /* silent: the goal stays as it was */ }
}

/** The water goal after the hot-day rule: { goalMl, bonusMl, reason }. */
export function useWaterBoost(baseMl: number) {
  const s = useSyncExternalStore(subscribe, getWeatherState);
  useEffect(() => { refreshWeather(); }, [s.enabled, s.place?.lat, s.place?.lon]);
  const usable = s.enabled && s.place && s.cache && cacheUsable(s.cache, { date: today(), lat: s.place.lat, lon: s.place.lon, offline: true });
  return adjustWater(baseMl, usable ? s.cache : null);
}
