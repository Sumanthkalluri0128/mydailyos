// Water screen: opt-in hot-day boost. Pick a city once (no location permission); only the place name and rounded coordinates are sent.
import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSyncExternalStore } from 'react';
import { useThemedStyles } from './UI';
import { Chip } from './Chip';
import { ATTRIBUTION } from '../utils/weatherWater';
import { Place, clearWeather, getWeatherState, searchPlaces, setWeatherPlace } from '../utils/weatherStore';

const subscribeNone = () => () => {};
export function WeatherWaterCard({ reason }: { reason: string }) {
  const { S, colors: c } = useThemedStyles();
  const s = useSyncExternalStore(subscribeNone, getWeatherState);
  const st = getWeatherState();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [note, setNote] = useState('');
  const [, force] = useState(0);
  const search = async () => { setNote(''); try { setResults(await searchPlaces(q)); } catch { setNote('Could not search for places right now. Try again later.'); } };
  void s;
  return (
    <View style={S.card}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: c.ink }}>Hot-day boost</Text>
      <Text style={S.muted}>Raise today's goal a little when it is hot where you are. Off by default.</Text>
      {st.enabled && st.place ? (
        <>
          <Text style={{ color: c.ink, marginTop: 8 }}><Text style={{ fontWeight: '800' }}>{st.place.name}</Text>{st.place.admin ? `, ${st.place.admin}` : ''} · {reason || (st.cache ? `${Math.round(st.cache.maxC)}°C expected today: no extra water needed.` : 'Weather not loaded yet. Your normal goal is used.')}</Text>
          <TouchableOpacity onPress={() => { clearWeather(); force((n) => n + 1); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.primary, fontWeight: '800' }}>Turn off</Text></TouchableOpacity>
        </>
      ) : (
        <>
          <TextInput value={q} onChangeText={setQ} placeholder="City, e.g. Hyderabad" placeholderTextColor={c.muted} onSubmitEditing={search} accessibilityLabel="City"
            style={{ minHeight: 44, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 10, color: c.ink, backgroundColor: c.card, marginTop: 8 }} />
          <TouchableOpacity onPress={search} disabled={q.trim().length < 2} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: q.trim().length < 2 ? c.muted : c.primary, fontWeight: '800' }}>Find</Text></TouchableOpacity>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{results.map((p) => <Chip key={`${p.lat}${p.lon}`} small label={`${p.name}${p.admin ? `, ${p.admin}` : ''}, ${p.country}`} onPress={() => { setWeatherPlace(p); setResults([]); setQ(''); }} />)}</View>
          {!!note && <Text style={S.muted}>{note}</Text>}
        </>
      )}
      <Text style={[S.muted, { fontSize: 11, marginTop: 6 }]}>{ATTRIBUTION}. Only the city name and rounded coordinates are sent. Free non-commercial service.</Text>
    </View>
  );
}
