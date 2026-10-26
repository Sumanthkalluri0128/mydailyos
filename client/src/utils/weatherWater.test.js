import test from "node:test";
import assert from "node:assert";
import * as W from "./weatherWater.js";

// Fixtures shaped like real Open-Meteo answers.
const FORECAST = { latitude: 17.4, longitude: 78.5, daily_units: { temperature_2m_max: "°C" }, daily: { time: ["2026-10-26"], temperature_2m_max: [34.2] } };
const GEO = { results: [{ id: 1, name: "Hyderabad", latitude: 17.38405, longitude: 78.45636, country: "India", admin1: "Telangana" }, { id: 2, name: "Bad", latitude: null, longitude: 1 }] };

test("bonus grows with the heat and stays small", () => {
  assert.strictEqual(W.bonusFor(27.9, 2800), 0);
  assert.strictEqual(W.bonusFor(28, 2800), 200);
  assert.strictEqual(W.bonusFor(31, 2800), 300);
  assert.strictEqual(W.bonusFor(34, 2800), 400);
  assert.strictEqual(W.bonusFor(36, 2800), 500);
  assert.strictEqual(W.bonusFor(40, 2800), 550); // capped at 20% of the base goal (560 -> 550)
  assert.strictEqual(W.bonusFor(40, 1500), 300);
  assert.strictEqual(W.bonusFor(null, 2800), 0);
  assert.strictEqual(W.bonusFor(35, 0), 0);
});
test("goal and the reason shown to the person", () => {
  const r = W.adjustWater(2800, { maxC: 34.2 });
  assert.strictEqual(r.goalMl, 3200); assert.strictEqual(r.bonusMl, 400);
  assert.match(r.reason, /Hot day \(34°C expected\).*400 ml/);
  assert.deepStrictEqual(W.adjustWater(2800, null), { goalMl: 2800, bonusMl: 0, reason: "" });
  assert.strictEqual(W.adjustWater(2800, { maxC: 22 }).reason, "");
});
test("forecast and geocoding responses", () => {
  assert.deepStrictEqual(W.parseForecast(FORECAST, "2026-10-26"), { date: "2026-10-26", maxC: 34.2 });
  assert.strictEqual(W.parseForecast(FORECAST, "2026-10-27"), null);
  assert.strictEqual(W.parseForecast({}, "2026-10-26"), null);
  assert.strictEqual(W.parseForecast({ daily: { time: ["2026-10-26"], temperature_2m_max: [null] } }, "2026-10-26"), null);
  const places = W.parseGeocode(GEO);
  assert.strictEqual(places.length, 1); assert.deepStrictEqual([places[0].lat, places[0].lon], [17.38, 78.46]);
  assert.strictEqual(W.parseGeocode(null).length, 0);
});
test("urls send only rounded coordinates and a place name", () => {
  const u = W.forecastUrl(17.38405, 78.45636, "2026-10-26");
  assert.match(u, /latitude=17\.38&longitude=78\.46/); assert.ok(!/key|token|email/i.test(u));
  assert.match(W.geocodeUrl(" New Delhi "), /name=New%20Delhi/);
});
test("saved forecast: fresh for 3 hours, any age when offline, never for another day or place", () => {
  const now = Date.UTC(2026, 9, 26, 6, 0, 0);
  const c = { date: "2026-10-26", lat: 17.38, lon: 78.46, maxC: 34, at: now - 2 * 3600e3 };
  assert.strictEqual(W.cacheUsable(c, { date: "2026-10-26", lat: 17.38, lon: 78.46, now }), true);
  assert.strictEqual(W.cacheUsable({ ...c, at: now - 4 * 3600e3 }, { date: "2026-10-26", lat: 17.38, lon: 78.46, now }), false);
  assert.strictEqual(W.cacheUsable({ ...c, at: now - 4 * 3600e3 }, { date: "2026-10-26", lat: 17.38, lon: 78.46, now, offline: true }), true);
  assert.strictEqual(W.cacheUsable(c, { date: "2026-10-27", lat: 17.38, lon: 78.46, now, offline: true }), false);
  assert.strictEqual(W.cacheUsable(c, { date: "2026-10-26", lat: 28.6, lon: 77.2, now }), false);
  assert.strictEqual(W.cacheUsable(null, { date: "2026-10-26", lat: 1, lon: 1 }), false);
});
