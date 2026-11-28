import React, { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from './UI';
import { Chip } from './Chip';
import { ServingsStepper, clampServings } from './ServingsStepper';
import { get } from '../config/api';
import { recordPortion, usualPortion } from '../utils/portionPresets';

export type PickFood = { _id: string; name: string; servingSize: number; servingUnit: string; calories: number; units?: { label: string; quantity: number }[] };

/** Search foods (catalogue + mine), then choose an amount. Calls onPick(food, quantityInTheFoodsOwnUnit). Needs a connection. */
export function FoodSearch({ onPick, onCancel, actionLabel = 'Add' }: { onPick: (f: PickFood, qty: number) => void; onCancel?: () => void; actionLabel?: string }) {
  const { S, colors } = useThemedStyles();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PickFood[]>([]);
  const [food, setFood] = useState<PickFood | null>(null);
  const [qty, setQty] = useState('');
  const [servings, setServings] = useState(1);
  const [usual, setUsual] = useState<number | null>(null); // what you usually have of this food (after two uses)
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return undefined; }
    const t = setTimeout(() => {
      get<any>(`/api/foods?search=${encodeURIComponent(q.trim())}&limit=12`)
        .then((r) => { setResults(r.foods || []); setOffline(false); })
        .catch(() => setOffline(true));
    }, 110);
    return () => clearTimeout(t);
  }, [q]);

  if (food) {
    return (
      <View style={{ paddingVertical: 8 }}>
        <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: 6 }}>{food.name}</Text>
        <View style={{ marginBottom: 10 }}>
          <ServingsStepper value={servings} onChange={(n) => { setServings(n); setQty(String(Math.round(n * (food.servingSize || 1) * 100) / 100)); }} />
          <Text style={[S.muted, { marginTop: 6 }]}>1 serving = {food.servingSize} {food.servingUnit} · about {Math.round(food.calories * servings)} kcal{usual ? ` · starts at your usual ${usual} ${food.servingUnit}` : ''}</Text>
        </View>
        <View style={S.row}>
          <TextInput accessibilityLabel="Amount" style={[S.input, { flex: 1, marginBottom: 0 }]} keyboardType="decimal-pad" value={qty} onChangeText={(v) => { setQty(v); const n = Number(String(v).replace(',', '.')); if (n > 0 && food.servingSize > 0) setServings(clampServings(n / food.servingSize)); }} />
          <Text style={{ marginLeft: 10, color: colors.muted, fontWeight: '700' }}>{food.servingUnit}</Text>
        </View>
        {!!food.units?.length && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
            {food.units.map((u) => <Chip key={u.label} small label={`1 ${u.label}`} onPress={() => { setQty(String(u.quantity)); if (food.servingSize > 0) setServings(clampServings(u.quantity / food.servingSize)); }} />)}
          </View>
        )}
        <View style={[S.row, { marginTop: 8 }]}>
          <TouchableOpacity testID="food-add" accessibilityRole="button" onPress={() => { const n = Number(String(qty).replace(',', '.')); if (n > 0) { recordPortion(food._id, food.name, n); onPick(food, n); } }} style={[S.button, { flex: 1, marginRight: 8, opacity: Number(qty) > 0 ? 1 : 0.5 }]}><Text style={S.buttonText}>{actionLabel}</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => setFood(null)} style={{ padding: 12 }}><Text style={{ color: colors.primary, fontWeight: '700' }}>Back</Text></TouchableOpacity>
        </View>
      </View>
    );
  }
  return (
    <View style={{ paddingVertical: 8 }}>
      <TextInput testID="food-search" accessibilityLabel="Search foods" style={S.input} placeholder="Search foods…" placeholderTextColor={colors.muted} value={q} onChangeText={setQ} autoFocus />
      {offline && <Text style={S.muted}>Searching needs a connection.</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {results.map((f) => <Chip key={f._id} small label={`${f.name} · ${Math.round(f.calories)} kcal`} onPress={() => { setFood(f); setQty(String(f.servingSize)); setServings(1); setUsual(null); usualPortion(f._id, f.name).then((u) => { if (u && f.servingSize > 0) { setUsual(u); setQty(String(u)); setServings(clampServings(u / f.servingSize)); } }).catch(() => {}); }} />)}
      </View>
      {!!q.trim() && !results.length && !offline && <Text style={S.muted}>No matches yet.</Text>}
      {onCancel && <TouchableOpacity onPress={onCancel} style={{ paddingVertical: 10 }}><Text style={{ color: colors.primary, fontWeight: '700' }}>Cancel</Text></TouchableOpacity>}
    </View>
  );
}
