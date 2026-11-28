// Hot-day water goal: pure rules and URL / response helpers. Weather comes from Open-Meteo (free for non-commercial use,
// no key, data CC BY 4.0). Only a place name and rounded coordinates are ever sent; nothing that identifies the person.
export const HOT_FROM_C = 28;
export const ATTRIBUTION = "Weather data by Open-Meteo.com (CC BY 4.0)";
export const MAX_AGE_MS = 3 * 60 * 60 * 1000; // a saved forecast is trusted for 3 hours

const roundTo = (n, step) => Math.round(n / step) * step;

/** Extra millilitres for a hot day. Small on purpose: 200 ml from 28 C up to 600 ml from 38 C, never more than 20% of the base goal. */
export function bonusFor(maxC, baseMl) {
  const t = Number(maxC), base = Number(baseMl);
  if (!Number.isFinite(t) || !(base > 0) || t < HOT_FROM_C) return 0;
  const step = t >= 38 ? 600 : t >= 35 ? 500 : t >= 32 ? 400 : t >= 30 ? 300 : 200;
  return Math.max(0, Math.min(step, roundTo(base * 0.2, 50)));
}

/** { goalMl, bonusMl, reason }. Unknown weather changes nothing and says nothing. */
export function adjustWater(baseMl, weather) {
  const base = Number(baseMl);
  const maxC = weather && Number.isFinite(Number(weather.maxC)) ? Number(weather.maxC) : null;
  const bonus = maxC === null ? 0 : bonusFor(maxC, base);
  return {
    goalMl: base + bonus, bonusMl: bonus,
    reason: bonus ? `Hot day (${Math.round(maxC)}°C expected): your water goal is up by ${bonus} ml.` : "",
  };
}

const r2 = (n) => Math.round(Number(n) * 100) / 100;
export function forecastUrl(lat, lon, date) {
  return `https://api.open-meteo.com/v1/forecast?latitude=${r2(lat)}&longitude=${r2(lon)}&daily=temperature_2m_max&timezone=auto&start_date=${date}&end_date=${date}`;
}
export function geocodeUrl(name) {
  return `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(String(name).trim())}&count=5&language=en&format=json`;
}

/** Today's highest temperature from an Open-Meteo forecast response, or null if the response is not what we expect. */
export function parseForecast(json, date) {
  const times = json?.daily?.time, temps = json?.daily?.temperature_2m_max;
  if (!Array.isArray(times) || !Array.isArray(temps)) return null;
  const i = times.indexOf(date);
  const v = i >= 0 && typeof temps[i] === "number" ? temps[i] : NaN;
  return Number.isFinite(v) && v > -90 && v < 70 ? { date, maxC: v } : null;
}
export function parseGeocode(json) {
  const list = Array.isArray(json?.results) ? json.results : [];
  return list.filter((r) => typeof r.latitude === "number" && typeof r.longitude === "number" && r.name)
    .map((r) => ({ name: r.name, admin: r.admin1 || "", country: r.country || "", lat: r2(r.latitude), lon: r2(r.longitude) }));
}

/** Can the saved forecast be used? Same day and same place; fresh within MAX_AGE_MS, or any age when `offline` (silent fallback). */
export function cacheUsable(cache, { date, lat, lon, now = Date.now(), offline = false }) {
  if (!cache || cache.date !== date || r2(cache.lat) !== r2(lat) || r2(cache.lon) !== r2(lon)) return false;
  return offline || now - Number(cache.at) < MAX_AGE_MS;
}
