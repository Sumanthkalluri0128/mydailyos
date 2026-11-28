// Correct a quick-add estimate (an "eating out" guess, a protein check-in, a chai count): its name and its calories / protein / carbs / fat.
// A quick-add has no real food behind it, so the portion editor ("how much of it") means nothing here. The caller saves it and offers Undo.
// What is checked and what is sent comes from utils/quickEdit (shared with the web app): only the boxes that changed are sent.
import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from './UI';
import { quickEditRequest, quickFormStart } from '../utils/quickEdit';

export function QuickCorrect({ entry, onSave, onCancel, busy = false }: { entry: any; onSave: (body: any) => void; onCancel: () => void; busy?: boolean }) {
  const { S, colors } = useThemedStyles();
  const [form, setForm] = useState(() => quickFormStart(entry));
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));
  const req: any = quickEditRequest(entry, form);
  const canSave = req.ok && req.changed && !busy;
  const was = Math.round(Number(entry.nutritionTotal?.calories) || 0);
  const box = { minHeight: 46, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, color: colors.ink, fontSize: 17, fontWeight: '800' as const };
  const num = (key: 'calories' | 'protein' | 'carbs' | 'fat', label: string, unit: string, auto = false) => (
    <View style={{ marginRight: 10, marginBottom: 8 }}>
      <Text style={S.muted}>{label} ({unit})</Text>
      <TextInput value={form[key]} onChangeText={set(key)} keyboardType="decimal-pad" selectTextOnFocus autoFocus={auto}
        accessibilityLabel={`${label} of ${entry.foodName}, in ${unit === 'kcal' ? 'kcal' : 'grams'}`} style={[box, { width: 92 }]} />
    </View>
  );

  return (
    <View style={{ marginBottom: 10, padding: 12, borderRadius: 14, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.border }}>
      <Text style={[S.muted, { marginBottom: 8 }]}>This is an estimate, so you can fix what it says.</Text>
      <Text style={S.muted}>Name</Text>
      <TextInput value={form.name} onChangeText={set('name')} maxLength={80} accessibilityLabel="Name" style={[box, { marginBottom: 8 }]} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {num('calories', 'Calories', 'kcal', true)}
        {num('protein', 'Protein', 'g')}
        {num('carbs', 'Carbs', 'g')}
        {num('fat', 'Fat', 'g')}
      </View>
      <Text accessibilityLiveRegion="polite" style={{ marginTop: 2, color: req.ok ? colors.ink : colors.danger, fontWeight: '800' }}>
        {req.ok ? `${Math.round(Number(String(form.calories).replace(',', '.')))} kcal${req.changed && req.body.calories !== undefined ? `  (was ${was} kcal)` : ''}` : req.error}
      </Text>
      <View style={{ flexDirection: 'row', marginTop: 10, gap: 10 }}>
        <TouchableOpacity accessibilityRole="button" disabled={!canSave} onPress={() => onSave(req.body)}
          style={{ minHeight: 46, paddingHorizontal: 22, borderRadius: 12, justifyContent: 'center', backgroundColor: colors.primary, opacity: canSave ? 1 : 0.45 }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={onCancel} style={{ minHeight: 46, paddingHorizontal: 18, borderRadius: 12, justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.ink, fontWeight: '800' }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
