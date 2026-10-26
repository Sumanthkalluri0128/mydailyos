// Water page: opt-in hot-day boost. Pick a city once (no location permission needed); we only send the place name and rounded coordinates.
import { useState } from "react";
import { getWeatherState, setWeatherEnabled, setWeatherPlace, clearWeather, searchPlaces, refreshWeather } from "../utils/weatherStore";
import { ATTRIBUTION } from "../utils/weatherWater";
import { notify } from "../utils/notify";

export default function WeatherWaterCard({ boost }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);
  const st = getWeatherState();
  const search = async () => {
    setBusy(true);
    try { setResults(await searchPlaces(q)); } catch { notify("Could not search for places right now. Try again later.", "info"); } finally { setBusy(false); }
  };
  const choose = (p) => { setWeatherPlace(p); setWeatherEnabled(true); setResults([]); setQ(""); refreshWeather().then(() => force((n) => n + 1)); };
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ margin: 0 }}>Hot-day boost</h3>
      <p className="water-target-note">Raise today's goal a little when it is hot where you are. Off by default.</p>
      {st.enabled && st.place ? (
        <>
          <p><strong>{st.place.name}</strong>{st.place.admin ? `, ${st.place.admin}` : ""} · {boost.reason || (st.cache ? `${Math.round(st.cache.maxC)}°C expected today: no extra water needed.` : "Weather not loaded yet. Your normal goal is used.")}</p>
          <button className="secondary-button" onClick={() => { clearWeather(); force((n) => n + 1); }}>Turn off</button>
        </>
      ) : (
        <div>
          <label>City<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Hyderabad" onKeyDown={(e) => e.key === "Enter" && search()} /></label>
          <button className="primary-button" disabled={busy || q.trim().length < 2} onClick={search}>Find</button>
          <ul style={{ listStyle: "none", padding: 0 }}>{results.map((p) => <li key={`${p.lat}${p.lon}`}><button className="chip" onClick={() => choose(p)}>{p.name}{p.admin ? `, ${p.admin}` : ""}, {p.country}</button></li>)}</ul>
        </div>
      )}
      <p className="md-sub" style={{ fontSize: ".8rem" }}>{ATTRIBUTION}. Only the city name and rounded coordinates are sent. Free non-commercial service.</p>
    </div>
  );
}
