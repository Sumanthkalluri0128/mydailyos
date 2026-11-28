import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useRefreshOnSync } from '../../utils/offline';
import { ActivityIndicator, RefreshControl, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ListScreen, useThemedStyles } from '../../components/UI';
import { useTheme } from '../../utils/theme';
import { useNotifications } from '../../components/Notifications';
import { formatDateLocal, parseDate, prettyDate, addDays } from '../../utils/dates';
import { read } from '../../utils/offline';
import { WeightReveal } from '../../components/WeightReveal';

type FoodLog = { _id: string; mealType: string; foodName: string; consumedQuantity: number; servingUnit: string; nutritionTotal?: any };
type ActivityLog = { _id: string; activityName: string; durationMinutes: number; caloriesBurned: number };
type WaterLog = { _id: string; amountMl: number };
type WeightLog = { _id: string; date: string; weightKg: number };

export default function History() {
  const { error, warning } = useNotifications();
  const { S, colors } = useThemedStyles();
  const [date, setDate] = useState(formatDateLocal(new Date()));
  const [data, setData] = useState<any>({ food: [], exercise: [], water: [], weight: null, tasks: [], habits: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (target = date) => {
    if (!parseDate(target)) { warning('Invalid date', 'Use YYYY-MM-DD.'); return; }
    try {
      const response = await read<any>(`/api/progress/day?date=${target}`);
      setData({
        food: response.food || [],
        exercise: response.exercise || [],
        water: response.water || [],
        weight: response.weight?.[0] || null,
        tasks: response.tasks || [],
        habits: response.habits || [],
      });
    } catch (e: any) {
      error('Unable to load history', e?.message || 'Please try again.');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [date, error, warning]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRefreshOnSync(() => load());

  const move = (amount: number) => {
    const next = addDays(date, amount); setDate(next); setLoading(true); load(next);
  };

  const calories = data.food.reduce((s: number, x: FoodLog) => s + Number(x.nutritionTotal?.calories || 0), 0);
  const protein = data.food.reduce((s: number, x: FoodLog) => s + Number(x.nutritionTotal?.protein || 0), 0);
  const water = data.water.reduce((s: number, x: WaterLog) => s + Number(x.amountMl || 0), 0);
  const burned = data.exercise.reduce((s: number, x: ActivityLog) => s + Number(x.caloriesBurned || 0), 0);
  const minutes = data.exercise.reduce((s: number, x: ActivityLog) => s + Number(x.durationMinutes || 0), 0);

  if (loading) return <SafeAreaView style={S.safe}><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary} /></View></SafeAreaView>;

  // One flat list of rows, so a long day only draws what is on screen.
  type Row = { id: string; kind: 'title' | 'item' | 'empty'; title?: string; detail?: string; weight?: boolean; text?: string };
  const rows: Row[] = [];
  const section = (title: string, items: Row[], empty: string) => { rows.push({ id: `t-${title}`, kind: 'title', title }); if (items.length) rows.push(...items); else rows.push({ id: `e-${title}`, kind: 'empty', text: empty }); };
  section('Food & nutrition', data.food.map((x: FoodLog) => ({ id: x._id, kind: 'item' as const, title: `${x.foodName} · ${x.mealType}`, detail: `${x.consumedQuantity} ${x.servingUnit} · ${Math.round(x.nutritionTotal?.calories || 0)} kcal · ${Number(x.nutritionTotal?.protein || 0).toFixed(1)} g protein` })), 'No food logged on this day.');
  section('Exercise', data.exercise.map((x: ActivityLog) => ({ id: x._id, kind: 'item' as const, title: x.activityName, detail: `${x.durationMinutes} min · ${Math.round(x.caloriesBurned)} kcal burned` })), 'No exercise logged on this day.');
  section('Hydration', data.water.map((x: WaterLog) => ({ id: x._id, kind: 'item' as const, title: 'Water', detail: `${x.amountMl} ml` })), 'No water logged on this day.');
  section('Weight', data.weight ? [{ id: 'weight', kind: 'item' as const, weight: true, title: 'Weight', detail: `${Number(data.weight.weightKg).toFixed(1)} kg` }] : [], 'No weight entry on this day.');
  section('Tasks', data.tasks.map((x: any) => ({ id: x._id, kind: 'item' as const, title: x.title, detail: x.completed ? 'Completed ✓' : 'Pending' })), 'No tasks on this day.');
  section('Habits', data.habits.map((x: any) => ({ id: x._id, kind: 'item' as const, title: x.habitName, detail: `${x.completedValue}/${x.target} ${x.unit} · ${x.completed ? 'Completed ✓' : 'In progress'}` })), 'No habit logs on this day.');

  return (
    <ListScreen tab refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      data={rows} keyExtractor={(r) => r.id}
      header={<>
      <Text style={S.title}>History</Text>
      <Text style={S.sub}>Everything recorded for a selected day.</Text>

      <View style={S.card}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>{prettyDate(date)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
          <TouchableOpacity onPress={() => move(-1)} accessibilityRole="button" accessibilityLabel="Previous period" style={{ width: 40, height: 44, borderRadius: 12, backgroundColor: colors.chipBg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 28, color: colors.primary, lineHeight: 30 }}>‹</Text></TouchableOpacity>
          <TextInput
            value={date}
            onChangeText={setDate}
            onSubmitEditing={() => { setLoading(true); load(date); }}
            returnKeyType="done"
            style={{ flex: 1, marginHorizontal: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 13, textAlign: 'center', color: colors.ink }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.muted}
          />
          <TouchableOpacity onPress={() => move(1)} accessibilityRole="button" accessibilityLabel="Next period" style={{ width: 40, height: 44, borderRadius: 12, backgroundColor: colors.chipBg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 28, color: colors.primary, lineHeight: 30 }}>›</Text></TouchableOpacity>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <Metric emoji="🔥" value={`${Math.round(calories)}`} label="Calories" />
        <Metric emoji="🥩" value={`${protein.toFixed(1)} g`} label="Protein" />
        <Metric emoji="💧" value={`${water} ml`} label="Water" />
        <Metric emoji="🏃" value={`${minutes} min`} label={`Exercise · ${Math.round(burned)} kcal`} />
      </View>
      </>}
      renderItem={({ item: r }) => (r.kind === 'title' ? <Text style={{ fontSize: 19, fontWeight: '800', color: colors.ink, marginTop: 12, marginBottom: 10 }}>{r.title}</Text> : r.kind === 'empty' ? <Empty text={r.text!} /> : <Item weight={r.weight} title={r.title!} detail={r.detail!} />)}
    />
  );
}

function Metric({ emoji, value, label }: { emoji: string; value: string; label: string }) {
  const { colors } = useTheme();
  return <View style={{ width: '48%', backgroundColor: colors.card, borderWidth: colors.cardBorderWidth, borderColor: colors.cardBorder, borderRadius: 18, padding: 15, marginBottom: 10, elevation: 1 }}><Text style={{ fontSize: 22 }}>{emoji}</Text><Text style={{ fontSize: 19, fontWeight: '800', marginTop: 7, color: colors.ink }}>{value}</Text><Text style={{ fontSize: 12, color: colors.muted, marginTop: 3 }}>{label}</Text></View>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ marginBottom: 6 }}><Text style={{ fontSize: 19, fontWeight: '800', color: colors.ink, marginTop: 12, marginBottom: 10 }}>{title}</Text>{children}</View>;
}
function Item({ title, detail, weight = false }: { title: string; detail: string; weight?: boolean }) {
  const { colors } = useTheme();
  return <View style={{ backgroundColor: colors.card, borderWidth: colors.cardBorderWidth, borderColor: colors.cardBorder, padding: 15, borderRadius: 17, marginBottom: 9, elevation: 1 }}><Text style={{ fontWeight: '800', color: colors.ink }}>{title}</Text>{weight ? <WeightReveal compact reaction={false} text={detail} style={{ color: colors.muted, fontSize: 12 }} /> : <Text style={{ color: colors.muted, fontSize: 12 }}>{detail}</Text>}</View>;
}
function Empty({ text }: { text: string }) {
  const { colors } = useTheme();
  return <View style={{ backgroundColor: colors.card, borderWidth: colors.cardBorderWidth, borderColor: colors.cardBorder, borderRadius: 16, padding: 16, marginBottom: 8 }}><Text style={{ color: colors.muted, fontSize: 13 }}>{text}</Text></View>;
}
