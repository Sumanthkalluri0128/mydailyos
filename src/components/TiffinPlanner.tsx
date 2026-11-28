// Plan tomorrow's lunch tonight. Canteen favourites and recent lunches are one tap; it goes into the planner like any planned food.
import { useCallback, useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useThemedStyles, Button } from './UI';
import { Chip } from './Chip';
import { useNotifications } from './Notifications';
import { read, write, newClientId } from '../utils/offline';
import { today } from '../config/api';

const pad = (n: number) => String(n).padStart(2, '0');
export function tomorrowStr(): string { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function TiffinPlanner() {
  const { S, colors } = useThemedStyles();
  const { success, error } = useNotifications();
  const tomorrow = tomorrowStr();
  const [d, setD] = useState<any>(null);
  const [form, setForm] = useState<{ name: string; calories: string; protein: string } | null>(null);
  const load = useCallback(() => { read<any>(`/api/tiffin?date=${tomorrow}`).then((j) => j?.planned && setD(j)).catch(() => {}); }, [tomorrow]);
  useEffect(() => { load(); }, [load]);
  const plan = async (f: any) => {
    try {
      const r = await write('POST', '/api/meal-plans', { date: tomorrow, mealType: 'lunch', foodId: f._id, quantity: f.servingSize || 1, today: today(), clientId: newClientId('tf') }, f.name);
      success(r.queued ? 'Queued' : 'Planned', `${f.name} for tomorrow's lunch.`); load();
    } catch (e: any) { error('Could not plan that', e.message); }
  };
  const unplan = async (it: any) => { try { await write('DELETE', `/api/meal-plans/${it._id}`, {}, 'Remove planned food'); load(); } catch (e: any) { error('Could not remove it', e.message); } };
  const saveFav = async () => {
    if (!form) return;
    try {
      await write('POST', '/api/tiffin/favorites', { name: form.name.trim(), calories: Number(form.calories), protein: form.protein === '' ? undefined : Number(form.protein) }, 'Canteen favourite');
      setForm(null); load();
    } catch (e: any) { error('Could not save it', e.message); }
  };
  const dropFav = async (f: any) => { try { await write('DELETE', `/api/tiffin/favorites/${f._id}`, {}, 'Remove favourite'); load(); } catch (e: any) { error('Could not remove it', e.message); } };
  if (!d) return null;
  const evening = new Date().getHours() >= 17;
  return (
    <View style={[S.card, { marginBottom: 12 }]}>
      <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16 }}>🍱 Tomorrow's lunch</Text>
      <Text style={S.muted}>{evening ? "Tonight is a good time to sort tomorrow's lunch." : 'Plan it ahead so lunch is one less decision.'}</Text>
      {d.planned.map((it: any) => (
        <View key={it._id} style={[S.row, { marginTop: 6 }]}>
          <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: colors.ink }}>{it.foodName}</Text><Text style={S.muted}>{Math.round(it.calories)} kcal · {Math.round(it.protein)} g protein</Text></View>
          <TouchableOpacity onPress={() => unplan(it)} accessibilityRole="button" accessibilityLabel={`Remove ${it.foodName}`} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.muted, fontSize: 18 }}>✕</Text></TouchableOpacity>
        </View>
      ))}
      {!d.planned.length && <Text style={[S.muted, { marginTop: 6 }]}>Nothing planned yet. Pick a favourite:</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
        {d.favourites.map((f: any) => <Chip key={f._id} small label={`⭐ ${f.name} · ${Math.round(f.calories)} kcal`} onPress={() => plan(f)} />)}
        {d.recent.map((f: any) => <Chip key={f._id} small label={`${f.name} · ${Math.round(f.calories)} kcal`} onPress={() => plan(f)} />)}
      </View>
      {d.favourites.map((f: any) => (
        <TouchableOpacity key={`rm-${f._id}`} onPress={() => dropFav(f)} accessibilityRole="button" accessibilityLabel={`Remove favourite ${f.name}`} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={S.muted}>✕ Remove favourite: {f.name}</Text>
        </TouchableOpacity>
      ))}
      {form ? (
        <View style={{ marginTop: 8 }}>
          <TextInput accessibilityLabel="Dish name" style={S.input} value={form.name} maxLength={80} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Canteen dish, e.g. Rajma chawal" placeholderTextColor={colors.muted} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput accessibilityLabel="Calories" style={[S.input, { flex: 1 }]} keyboardType="decimal-pad" value={form.calories} onChangeText={(v) => setForm({ ...form, calories: v })} placeholder="kcal" placeholderTextColor={colors.muted} />
            <TextInput accessibilityLabel="Protein in grams, optional" style={[S.input, { flex: 1 }]} keyboardType="decimal-pad" value={form.protein} onChangeText={(v) => setForm({ ...form, protein: v })} placeholder="protein g (optional)" placeholderTextColor={colors.muted} />
          </View>
          <Button title="Save favourite" disabled={!form.name.trim() || !(Number(form.calories) > 0)} onPress={saveFav} />
          <Chip small label="Cancel" onPress={() => setForm(null)} />
        </View>
      ) : <View style={{ marginTop: 6 }}><Chip small label="＋ Save a canteen favourite" onPress={() => setForm({ name: '', calories: '', protein: '' })} /></View>}
      <Text style={[S.muted, { marginTop: 6 }]}>Your own numbers: we never guess what a canteen dish contains. Switch on the evening reminder under Reminders; it follows your quiet hours and daily limit.</Text>
    </View>
  );
}
