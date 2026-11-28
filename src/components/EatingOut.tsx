import React, { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useCoachTone } from '../utils/coachTone';
import { useThemedStyles } from './UI';
import { useNotifications } from './Notifications';
import { Chip } from './Chip';
import { get, post, today } from '../config/api';

/** Restaurant / party / no idea exactly: log an estimate, optionally as a range — the middle counts, the range is kept in the note. */
export function EatingOut({ meal, onLogged }: { meal: string; onLogged: () => void }) {
  const { S, colors } = useThemedStyles();
  const { success, error } = useNotifications();
  const [name, setName] = useState('');
  const [low, setLow] = useState('');
  const [high, setHigh] = useState('');
  const [busy, setBusy] = useState(false);
  const [dishes, setDishes] = useState<{ name: string; small: number; regular: number; large: number }[]>([]);
  const padPct = useCoachTone().eatingOutPadPct || 15; // raised during festival / trip mode
  const [pad, setPad] = useState(true); // restaurant food hides oil and big portions: add 15% by default
  const lo = Number(low.replace(',', '.')) || 0, hi = Number(high.replace(',', '.')) || 0;
  const mid = lo > 0 && hi >= lo ? Math.round((lo + hi) / 2) : lo > 0 && !hi ? lo : 0;
  const valid = !!name.trim() && mid > 0;

  // Typical calories for restaurant dishes you type, so you pick a size instead of guessing.
  useEffect(() => {
    const q = name.trim();
    if (q.length < 3) { setDishes([]); return; }
    const t = setTimeout(() => { get<any>(`/api/foods/dish-range?q=${encodeURIComponent(q)}`).then((r) => setDishes(r.dishes || [])).catch(() => setDishes([])); }, 350);
    return () => clearTimeout(t);
  }, [name]);
  const useRange = (v: number) => { setLow(String(Math.round(v * 0.9))); setHigh(String(Math.round(v * 1.1))); };

  const save = async () => {
    setBusy(true);
    try {
      await post('/api/food-logs/quick', { date: today(), mealType: meal, name: name.trim(), calories: mid, caloriesLow: hi ? lo : 0, caloriesHigh: hi || 0, padPct: pad ? padPct : 0, clientId: `eo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` });
      success('Logged', `About ${pad ? Math.round(mid * (1 + padPct / 100)) : mid} kcal added to ${meal}.`);
      setName(''); setLow(''); setHigh('');
      onLogged();
    } catch (e: any) { error('Could not log that', e.network ? 'Eating-out estimates need a connection for now.' : e.message); }
    finally { setBusy(false); }
  };

  return (
    <View>
      <Text style={[S.muted, { marginBottom: 10 }]}>No exact numbers? Enter a guess, or a range and we’ll log the middle. Restaurant portions usually run bigger than home ones — lean high when unsure.</Text>
      <TextInput accessibilityLabel="What did you eat" style={S.input} value={name} onChangeText={setName} placeholder="What was it? e.g. Biryani at Paradise" placeholderTextColor={colors.muted} maxLength={80} />
      {dishes.length > 0 && !lo && (
        <View style={{ marginBottom: 8 }}>
          <Text style={[S.muted, { marginBottom: 4 }]}>Typical for this dish — tap a size:</Text>
          {dishes.slice(0, 3).map((d) => (
            <View key={d.name} style={{ marginBottom: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink }} numberOfLines={1}>{d.name}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <Chip small label={`Small ~${d.small}`} onPress={() => useRange(d.small)} />
                <Chip small label={`Regular ~${d.regular}`} onPress={() => useRange(d.regular)} />
                <Chip small label={`Large ~${d.large}`} onPress={() => useRange(d.large)} />
              </View>
            </View>
          ))}
        </View>
      )}
      <View style={S.row}>
        <TextInput accessibilityLabel="Calories, low estimate" style={[S.input, { flex: 1, marginRight: 8 }]} keyboardType="decimal-pad" value={low} onChangeText={setLow} placeholder="kcal (low)" placeholderTextColor={colors.muted} />
        <TextInput accessibilityLabel="Calories, high estimate" style={[S.input, { flex: 1 }]} keyboardType="decimal-pad" value={high} onChangeText={setHigh} placeholder="high (optional)" placeholderTextColor={colors.muted} />
      </View>
      {mid > 0 && <Text style={[S.muted, { marginBottom: 8 }]}>Will log about {mid} kcal{hi ? ` (range ${lo}–${hi})` : ''} to {meal}.</Text>}
      <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: pad }} onPress={() => setPad((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ fontSize: 20, marginRight: 8 }}>{pad ? '☑️' : '⬜'}</Text>
        <Text style={[S.muted, { flex: 1 }]}>{`Add a ${padPct}% safety buffer for hidden oil and bigger portions (recommended)`}</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={busy || !valid} onPress={save} style={[S.button, { opacity: busy || !valid ? 0.5 : 1 }]}><Text style={S.buttonText}>Log estimate</Text></TouchableOpacity>
    </View>
  );
}
