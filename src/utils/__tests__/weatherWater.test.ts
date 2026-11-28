import { adjustWater, bonusFor, cacheUsable, parseForecast, parseGeocode } from '../weatherWater';

const FORECAST = { daily: { time: ['2026-10-26'], temperature_2m_max: [34.2] } };
describe('hot-day water goal', () => {
  it('bonus is small and capped', () => {
    expect(bonusFor(27.9, 2800)).toBe(0);
    expect(bonusFor(28, 2800)).toBe(200);
    expect(bonusFor(34, 2800)).toBe(400);
    expect(bonusFor(40, 2800)).toBe(550);
    expect(bonusFor(null, 2800)).toBe(0);
  });
  it('shows why the goal changed, and says nothing without weather', () => {
    const r = adjustWater(2800, { maxC: 34.2 });
    expect(r.goalMl).toBe(3200);
    expect(r.reason).toBe('Hot day (34°C expected): your water goal is up by 400 ml.');
    expect(adjustWater(2800, null)).toEqual({ goalMl: 2800, bonusMl: 0, reason: '' });
  });
  it('reads Open-Meteo fixtures', () => {
    expect(parseForecast(FORECAST, '2026-10-26')).toEqual({ date: '2026-10-26', maxC: 34.2 });
    expect(parseForecast(FORECAST, '2026-10-27')).toBe(null);
    expect(parseGeocode({ results: [{ name: 'Hyderabad', latitude: 17.38405, longitude: 78.45636, country: 'India' }] })[0].lat).toBe(17.38);
  });
  it('saved forecast: fresh 3 h, any age offline, never another day', () => {
    const c = { date: '2026-10-26', lat: 17.38, lon: 78.46, maxC: 34, at: now() - 4 * 3600e3 };
    expect(cacheUsable(c, { date: '2026-10-26', lat: 17.38, lon: 78.46, now: now() })).toBe(false);
    expect(cacheUsable(c, { date: '2026-10-26', lat: 17.38, lon: 78.46, now: now(), offline: true })).toBe(true);
    expect(cacheUsable(c, { date: '2026-10-27', lat: 17.38, lon: 78.46, now: now(), offline: true })).toBe(false);
  });
});
function now() { return Date.UTC(2026, 9, 26, 6, 0, 0); }
