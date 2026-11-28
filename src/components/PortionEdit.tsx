// Change how much you ate (or plan to eat) of one food: type an amount or tap a quick multiplier.
// The new calories show as you type. The caller saves it (food log or planner).
import React, { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from './UI';
import { Chip } from './Chip';
import { fracLabel, isHousehold, recordPortion, usualPortion } from '../utils/portionPresets';

const FACTORS: [number, string][] = [[0.5, '½'], [0.75, '¾'], [1.25, '1¼'], [1.5, '1½'], [2, '2×']];
const COUNTS = [0.5, 1, 1.5, 2, 3];               // household units (roti, katori, glass...) read better as real counts than as multipliers
const round = (n: number) => Math.round(n * 100) / 100;

export function PortionEdit({ name, foodId, quantity, unit, calories = 0, protein = 0, onSave, onCancel, busy = false }: {
  name: string; foodId?: string | null; quantity: number; unit: string; calories?: number; protein?: number;
  onSave: (q: number) => void; onCancel: () => void; busy?: boolean;
}) {
  const { S, colors } = useThemedStyles();
  const start = Number(quantity) > 0 ? Number(quantity) : 1;
  const [val, setVal] = useState(String(round(start)));
  const household = isHousehold(unit);
  const [usual, setUsual] = useState<number | null>(null);   // what you most often have of this food (needs two uses)
  useEffect(() => { usualPortion(foodId, name).then(setUsual).catch(() => {}); }, [foodId, name]);
  const q = Number(val.replace(',', '.'));
  const valid = q > 0 && q <= 100000;
  const changed = valid && Math.abs(q - start) > 0.0001;
  const k = valid ? q / start : 1;               // nutrition scales in a straight line with the amount

  return (
    <View style={{ marginBottom: 10, padding: 12, borderRadius: 14, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
        <Text style={[S.muted, { marginRight: 8 }]}>Amount</Text>
        <TextInput value={val} onChangeText={setVal} keyboardType="decimal-pad" selectTextOnFocus autoFocus accessibilityLabel={`Amount of ${name} in ${unit}`}
          style={{ minWidth: 84, minHeight: 46, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, color: colors.ink, fontSize: 17, fontWeight: '800' }} />
        <Text style={[S.muted, { marginLeft: 8 }]}>{unit}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
        {usual != null && Math.abs(usual - start) > 0.0001 && <Chip small active label={`Usual: ${fracLabel(usual)} ${unit}`} onPress={() => setVal(String(usual))} />}
        {household
          ? COUNTS.map((n) => <Chip key={n} small label={fracLabel(n)} a11y={`${fracLabel(n)} ${unit}`} onPress={() => setVal(String(n))} />)
          : FACTORS.map(([f, label]) => <Chip key={f} small label={label} onPress={() => setVal(String(round(start * f)))} />)}
      </View>
      <Text accessibilityLiveRegion="polite" style={{ marginTop: 8, color: colors.ink, fontWeight: '800' }}>
        {valid ? `${Math.round(Number(calories) * k)} kcal · ${Math.round(Number(protein) * k * 10) / 10} g protein${changed ? `  (was ${Math.round(Number(calories))} kcal)` : ''}` : 'Enter an amount above 0.'}
      </Text>
      <View style={{ flexDirection: 'row', marginTop: 10, gap: 10 }}>
        <TouchableOpacity accessibilityRole="button" disabled={!changed || busy} onPress={() => { recordPortion(foodId, name, q); onSave(round(q)); }}
          style={{ minHeight: 46, paddingHorizontal: 22, borderRadius: 12, justifyContent: 'center', backgroundColor: colors.primary, opacity: changed && !busy ? 1 : 0.45 }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={onCancel} style={{ minHeight: 46, paddingHorizontal: 18, borderRadius: 12, justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.ink, fontWeight: '800' }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
