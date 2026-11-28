// "Healthy day": a balanced, varied full-day plan from a curated food list (not limited to what you have logged before).
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useThemedStyles } from './UI';
import { useNotifications } from './Notifications';
import { get, post, today } from '../config/api';

const MEAL: Record<string, [string, string]> = { breakfast: ['🌅', 'Breakfast'], lunch: ['☀️', 'Lunch'], dinner: ['🌙', 'Dinner'], snacks: ['🍎', 'Snacks'] };
const DIETS: [string, string][] = [['v', '🥦 Veg'], ['e', '🥚 Egg'], ['n', '🍗 Non-veg']];
const addDays = (s: string, n: number) => { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

export function HealthyDay({ onClose }: { onClose: () => void }) {
  const { S, colors } = useThemedStyles();
  const { success, error } = useNotifications();
  const [diet, setDiet] = useState('v');
  const [off, setOff] = useState(0);
  const [variant, setVariant] = useState(0);
  const [day, setDay] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const date = addDays(today(), off);

  useEffect(() => { AsyncStorage.getItem('ff_diet').then((v) => { if (v === 'v' || v === 'e' || v === 'n') setDiet(v); }).catch(() => {}); }, []);
  const load = useCallback(async () => {
    setDay(null);
    try { const j = await get<any>(`/api/plan/diet-day?today=${today()}&date=${date}&diet=${diet}&variant=${variant}`); setDay(j); } catch { setDay(false); }
  }, [date, diet, variant]);
  useEffect(() => { load(); }, [load]);

  const apply = async () => {
    setBusy(true);
    try { await post(`/api/plan/diet-day/apply?today=${today()}`, { date, diet, variant }); success('Added to your planner', `Healthy day for ${off ? 'tomorrow' : 'today'} is in the Meal Planner.`); onClose(); router.push('/plan' as any); }
    catch (e: any) { error('Could not add the plan', e?.message); } finally { setBusy(false); }
  };
  const seg = (items: [string, string][], active: string, onPick: (k: string) => void) => (
    <View style={{ flexDirection: 'row', padding: 3, borderRadius: 999, backgroundColor: colors.chipBg }}>
      {items.map(([k, l]) => <TouchableOpacity key={k} accessibilityRole="button" accessibilityState={{ selected: active === k }} onPress={() => onPick(k)} style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: active === k ? colors.primary : 'transparent' }}><Text style={{ fontWeight: '800', fontSize: 12.5, color: active === k ? '#fff' : colors.muted }}>{l}</Text></TouchableOpacity>)}
    </View>
  );

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
        {seg(DIETS, diet, (k) => { setDiet(k); AsyncStorage.setItem('ff_diet', k).catch(() => {}); })}
        {seg([['0', 'Today'], ['1', 'Tomorrow']], String(off), (k) => setOff(Number(k)))}
      </View>
      {day === null && <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />}
      {day === false && <Text style={S.muted}>Could not build the plan. Check your connection and try again.</Text>}
      {!!day && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 10, padding: 12, borderRadius: 14, backgroundColor: colors.chipBg }}>
            <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '900' }}>{day.totals.kcal} kcal</Text>
            <Text style={S.muted}>{day.totals.protein} g protein</Text><Text style={S.muted}>{day.totals.fiber} g fibre</Text><Text style={S.muted}>target {day.totals.target}</Text>
          </View>
          {day.needsProfile && <Text style={S.muted}>Add your height, age and weight in Profile and I will size this exactly for you.</Text>}
          {day.meals.map((m: any) => (
            <View key={m.mealType}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}><Text>{MEAL[m.mealType][0]}</Text><Text style={{ color: colors.ink, fontWeight: '800', fontSize: 14.5, flex: 1 }}>{MEAL[m.mealType][1]}</Text><Text style={S.muted}>{m.kcal} kcal</Text></View>
              {m.items.map((i: any) => (
                <View key={i.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <View style={{ flex: 1 }}><Text style={{ color: colors.ink, fontWeight: '700', fontSize: 13.5 }}>{i.name}</Text><Text style={S.muted}>{i.servings === 1 ? `1 ${i.unit}` : `${i.servings} ${i.unit}`} · {i.note}</Text></View>
                  <Text style={[S.muted, { fontWeight: '800' }]}>{i.kcal}</Text>
                </View>
              ))}
            </View>
          ))}
          <Text style={S.muted}>{day.tips[0]} {day.tips[2]}</Text>
        </>
      )}
      <TouchableOpacity accessibilityRole="button" disabled={busy || !day} onPress={apply} style={{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySolid, opacity: busy || !day ? 0.55 : 1 }}><Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? 'Adding…' : '＋ Add to my planner'}</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={!day} onPress={() => setVariant((v) => v + 1)} style={{ minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.chipBg, opacity: day ? 1 : 0.55 }}><Text style={{ color: colors.ink, fontWeight: '800' }}>🔀 Another version</Text></TouchableOpacity>
    </View>
  );
}
