import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WrappedCard } from '../../components/WrappedCard';
import { router, useFocusEffect } from 'expo-router';
import { useRefreshOnSync } from '../../utils/offline';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Screen, useThemedStyles } from '../../components/UI';
import { useTheme } from '../../utils/theme';
import { useNotifications } from '../../components/Notifications';
import { ProgressChart } from '../../components/ProgressChart';
import { useProfile } from '../../hooks/useProfile';
import { buildInsights } from '../../utils/insights';
import { dailyTarget, resolveTargets } from '../../utils/energy';
import { addDays, daysBetween, formatDateLocal, parseDate, prettyDate, shortDate } from '../../utils/dates';
import { Chip } from '../../components/Chip';
import { ShowMoreButton } from '../../components/ShowMore';
import { DateTimeField } from '../../components/DateTimeField';

const MAX_RANGE_DAYS = 800; // the server's limit for one history request

/** Quick ranges for the Custom tab. All end today unless they name a past month. */
function presetRange(key: string, today: string): { from: string; to: string } {
  const t = parseDate(today) || new Date();
  if (key === '7') return { from: addDays(today, -6), to: today };
  if (key === '14') return { from: addDays(today, -13), to: today };
  if (key === '30') return { from: addDays(today, -29), to: today };
  if (key === '90') return { from: addDays(today, -89), to: today };
  if (key === 'mtd') return { from: formatDateLocal(new Date(t.getFullYear(), t.getMonth(), 1)), to: today };
  if (key === 'lastmonth') return { from: formatDateLocal(new Date(t.getFullYear(), t.getMonth() - 1, 1)), to: formatDateLocal(new Date(t.getFullYear(), t.getMonth(), 0)) };
  if (key === 'ytd') return { from: formatDateLocal(new Date(t.getFullYear(), 0, 1)), to: today };
  return { from: addDays(today, -364), to: today }; // 'year' = last 365 days
}
const PRESETS: { key: string; label: string }[] = [
  { key: '7', label: '7 days' }, { key: '14', label: '14 days' }, { key: '30', label: '30 days' }, { key: '90', label: '90 days' },
  { key: 'mtd', label: 'This month' }, { key: 'lastmonth', label: 'Last month' }, { key: 'ytd', label: 'Year to date' }, { key: 'year', label: '1 year' },
];
import { read } from '../../utils/offline';
import { WeightReveal } from '../../components/WeightReveal';

type Day = {
  date: string;
  weightKg: number | null;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number;
  waterMl: number;
  exerciseMinutes: number;
  caloriesBurned: number;
  tasksTotal: number;
  tasksCompleted: number;
  habitsCompleted: number;
};

type Mode = 'day' | 'week' | 'month' | 'year' | 'custom';
type HistoryResponse = { success: boolean; days: Day[]; totals?: any };

function startOfWeek(value: string) {
  const d = parseDate(value) || new Date();
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return formatDateLocal(d);
}

function endOfWeek(value: string) {
  return addDays(startOfWeek(value), 6);
}

function startOfMonth(value: string) {
  const d = parseDate(value) || new Date();
  d.setDate(1);
  return formatDateLocal(d);
}

function endOfMonth(value: string) {
  const d = parseDate(value) || new Date();
  d.setMonth(d.getMonth() + 1, 0);
  return formatDateLocal(d);
}

function startOfYear(value: string) {
  const d = parseDate(value) || new Date();
  d.setMonth(0, 1);
  return formatDateLocal(d);
}

function endOfYear(value: string) {
  const d = parseDate(value) || new Date();
  d.setMonth(11, 31);
  return formatDateLocal(d);
}

function getRange(mode: Mode, anchor: string) {
  if (mode === 'day') return { from: anchor, to: anchor };
  if (mode === 'week') return { from: startOfWeek(anchor), to: endOfWeek(anchor) };
  if (mode === 'month') return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
  if (mode === 'year') return { from: startOfYear(anchor), to: endOfYear(anchor) };
  return { from: anchor, to: anchor };
}

function moveAnchor(mode: Mode, anchor: string, direction: number) {
  if (mode === 'day') return addDays(anchor, direction);
  if (mode === 'week') return addDays(anchor, direction * 7);
  if (mode === 'month') {
    const d = parseDate(anchor) || new Date();
    d.setMonth(d.getMonth() + direction);
    return formatDateLocal(d);
  }
  if (mode === 'year') {
    const d = parseDate(anchor) || new Date();
    d.setFullYear(d.getFullYear() + direction);
    return formatDateLocal(d);
  }
  return anchor;
}

function rangeLabel(mode: Mode, from: string, to: string) {
  if (mode === 'day') return prettyDate(from);
  if (mode === 'week') return `${shortDate(from)} – ${shortDate(to)}`;
  if (mode === 'month') return (parseDate(from) || new Date()).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  if (mode === 'year') return String((parseDate(from) || new Date()).getFullYear());
  return `${prettyDate(from)} – ${prettyDate(to)}`;
}

export default function Progress() {
  const { error, warning } = useNotifications();
  const { S, colors } = useThemedStyles();
  const styles = makeStyles(colors);
  const { profile, goals } = useProfile();
  const calTarget = profile ? dailyTarget(profile) : (goals?.calorieTarget || null);
  const T = profile ? resolveTargets(profile as any) : null;
  const waterTarget = T ? T.waterMl : (goals?.waterTargetMl || null);
  // Protein follows the plan (weight and body goal) unless you typed your own number; the stored field is empty in automatic mode.
  const eng = T ? T.energy : null;
  const proteinTarget = T ? T.macros.protein : (goals?.proteinTarget || null);
  const today = formatDateLocal(new Date());
  const [mode, setMode] = useState<Mode>('week');
  const [anchor, setAnchor] = useState(today);
  const initial = getRange('week', today);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [daysOpen, setDaysOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(addDays(today, -29));
  const [customTo, setCustomTo] = useState(today);
  const [days, setDays] = useState<Day[]>([]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [details, setDetails] = useState<any>(null);

  const load = useCallback(async (rangeFrom: string, rangeTo: string, preferredDate?: string) => {
    if (!parseDate(rangeFrom) || !parseDate(rangeTo) || rangeFrom > rangeTo) {
      warning('Invalid date range', 'Choose a valid date range.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (daysBetween(rangeFrom, rangeTo).length > MAX_RANGE_DAYS) {
      warning('Range too long', `Choose a range of up to ${MAX_RANGE_DAYS} days (about 2 years).`);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const response = await read<HistoryResponse>(`/api/progress/history?from=${rangeFrom}&to=${rangeTo}`);
      const nextDays = response.days || [];
      setDays(nextDays);
      const candidate = preferredDate || selectedDate;
      const nextSelected = nextDays.some((x) => x.date === candidate) ? candidate : rangeTo;
      setSelectedDate(nextSelected);
    } catch (e: any) {
      error('Unable to load progress', e?.message || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [error, warning, selectedDate]);

  const loadDay = useCallback(async (date: string) => {
    try {
      const response = await read<any>(`/api/progress/day?date=${date}`);
      setDetails(response);
    } catch (e: any) {
      error('Unable to load daily history', e?.message || 'Please try again.');
      setDetails(null);
    }
  }, [error]);

  useEffect(() => {
    // Custom ranges are loaded only by applyRange() below. This effect used to run for them too and reset From/To to a single day.
    if (mode === 'custom') return;
    const range = getRange(mode, anchor);
    setFrom(range.from);
    setTo(range.to);
    setLoading(true);
    load(range.from, range.to, anchor);
  }, [mode, anchor]);

  useEffect(() => {
    if (selectedDate) loadDay(selectedDate);
  }, [selectedDate, loadDay]);

  // Re-read when the tab comes back into view and after offline changes sync, so charts include what was just logged.
  const reload = () => { if (from && to) load(from, to, selectedDate); if (selectedDate) loadDay(selectedDate); };
  const reloadRef = useRef(reload); reloadRef.current = reload;
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => { if (firstFocus.current) { firstFocus.current = false; return; } reloadRef.current(); }, []));
  useRefreshOnSync(() => reloadRef.current());

  const applyRange = (f: string, t: string) => {
    if (!parseDate(f) || !parseDate(t)) { warning('Invalid date', 'Pick both dates.'); return; }
    if (f > t) { warning('Check the dates', 'The From date must be on or before the To date.'); return; }
    if (daysBetween(f, t).length > MAX_RANGE_DAYS) { warning('Range too long', `Choose up to ${MAX_RANGE_DAYS} days (about 2 years).`); return; }
    setCustomFrom(f); setCustomTo(t);
    setMode('custom'); setFrom(f); setTo(t);
    setLoading(true);
    load(f, t, t);
  };

  const selectMode = (next: Mode) => {
    if (next === 'custom') { applyRange(customFrom, customTo); return; }
    setMode(next);
    const range = getRange(next, anchor);
    setFrom(range.from);
    setTo(range.to);
  };

  const navigate = (direction: number) => {
    if (mode === 'custom') return;
    const nextAnchor = moveAnchor(mode, anchor, direction);
    setAnchor(nextAnchor);
  };

  const goToday = () => {
    const nextMode = mode === 'custom' ? 'day' : mode;
    setMode(nextMode);
    setAnchor(today);
  };

  const selected = days.find((x) => x.date === selectedDate) || days[days.length - 1];

  const stats = useMemo(() => {
    if (!days.length) return { avgCalories: 0, avgProtein: 0, totalWater: 0, totalExercise: 0, weightChange: null as number | null, loggedDays: 0 };
    // Averages count only days with food logged — a day you didn't track is "no data", not "0 kcal".
    const logged = days.filter((x) => x.calories > 0);
    const calories = logged.reduce((s, x) => s + x.calories, 0);
    const protein = logged.reduce((s, x) => s + x.protein, 0);
    const water = days.reduce((s, x) => s + x.waterMl, 0);
    const exercise = days.reduce((s, x) => s + x.exerciseMinutes, 0);
    const weights = days.filter((x) => x.weightKg != null).map((x) => Number(x.weightKg));
    return {
      avgCalories: logged.length ? calories / logged.length : 0,
      avgProtein: logged.length ? protein / logged.length : 0,
      totalWater: water,
      totalExercise: exercise,
      weightChange: weights.length >= 2 ? weights[weights.length - 1] - weights[0] : null,
      loggedDays: logged.length,
    };
  }, [days]);

  // Long ranges (more than ~2 months) are shown as weekly averages of the days that have data, so 300 thin bars become ~45 readable points.
  const bucketed = days.length > 62;
  const chartData = (key: keyof Day) => {
    if (!bucketed) return days.map((d) => ({ date: d.date, label: shortDate(d.date), value: Number(d[key] || 0) }));
    const weeks = new Map<string, { sum: number; n: number }>();
    for (const d of days) {
      const v = Number(d[key] || 0);
      if (!(v > 0)) continue;
      const wk = startOfWeek(d.date);
      const e = weeks.get(wk) || { sum: 0, n: 0 };
      e.sum += v; e.n += 1; weeks.set(wk, e);
    }
    return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([wk, e]) => ({ date: wk, label: shortDate(wk), value: e.sum / e.n }));
  };
  const wk = bucketed ? ' · weekly avg' : '';
  const weightData = days.filter((d) => d.weightKg != null).map((d) => ({ date: d.date, label: shortDate(d.date), value: Number(d.weightKg) }));

  if (loading && days.length === 0) return <SafeAreaView style={S.safe}><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary} /></View></SafeAreaView>;

  return (
    <Screen buddyWho="gojo" buddy="chart" buddySays="Look at you go!" tab refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(from, to, selectedDate); }} />}>
        <TouchableOpacity accessibilityRole="link" onPress={() => router.push('/(tabs)/history' as any)} style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>📅 Open day-by-day history ›</Text></TouchableOpacity>
      <Text style={S.title}>Progress</Text>
        <Text style={S.sub}>Choose a period and FlexFit automatically loads exactly that period.</Text>

        <View style={styles.modeRow}>
          {(['day', 'week', 'month', 'year', 'custom'] as Mode[]).map((item) => (
            <TouchableOpacity key={item} onPress={() => selectMode(item)} style={[styles.modeButton, mode === item && styles.modeActive]}>
              <Text style={[styles.modeText, mode === item && styles.modeTextActive]}>{item[0].toUpperCase() + item.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={S.card}>
          <View style={styles.periodNav}>
            <TouchableOpacity disabled={mode === 'custom'} onPress={() => navigate(-1)} accessibilityRole="button" accessibilityLabel="Previous period" style={[styles.navButton, mode === 'custom' && styles.disabled]}><Text style={styles.navText}>‹</Text></TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <TouchableOpacity onPress={goToday}><Text style={styles.today}>Today</Text></TouchableOpacity>
              <Text style={styles.periodTitle}>{rangeLabel(mode, from, to)}</Text>
            </View>
            <TouchableOpacity disabled={mode === 'custom'} onPress={() => navigate(1)} accessibilityRole="button" accessibilityLabel="Next period" style={[styles.navButton, mode === 'custom' && styles.disabled]}><Text style={styles.navText}>›</Text></TouchableOpacity>
          </View>

          {mode === 'custom' ? (
            <View style={{ marginTop: 14 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {PRESETS.map((p) => { const r = presetRange(p.key, today); return <Chip key={p.key} small label={p.label} active={from === r.from && to === r.to} onPress={() => applyRange(r.from, r.to)} />; })}
              </View>
              <View style={[styles.dateRow, { marginTop: 8 }]}>
                <DateTimeField label="From" mode="date" value={customFrom} onChange={(v) => { if (!v) return; applyRange(v, v > customTo ? v : customTo); }} />
                <View style={{ width: 10 }} />
                <DateTimeField label="To" mode="date" value={customTo} onChange={(v) => { if (!v) return; applyRange(v < customFrom ? v : customFrom, v); }} />
              </View>
              <Text style={S.muted}>{daysBetween(from, to).length} day{daysBetween(from, to).length === 1 ? '' : 's'} · {stats.loggedDays} with food logged{bucketed ? ' · charts show weekly averages' : ''}</Text>
            </View>
          ) : (
            <View style={{ marginTop: 14 }}>
              <DateTimeField label="Jump to a date" mode="date" value={anchor} onChange={(v) => v && setAnchor(v)} />
              <Text style={styles.rangeText}>{from} → {to}</Text>
            </View>
          )}
        </View>

        {days.length > 0 ? <>
          <View style={styles.statGrid}>
            <Stat value={`${stats.avgCalories.toFixed(0)}`} label={`Avg kcal/day · ${stats.loggedDays} logged`} />
            <Stat value={`${stats.avgProtein.toFixed(0)} g`} label="Avg protein/day" />
            <Stat value={`${(stats.totalWater / 1000).toFixed(1)} L`} label="Total water" />
            <Stat value={`${stats.totalExercise} min`} label="Exercise" />
          </View>

          <ProgressChart title="Weight trend" unit=" kg" kind="line" target={goals?.targetWeightKg} data={weightData} emptyText="Add weight entries to see your weight trend." />
          <ProgressChart title={`Calories eaten${wk}`} unit=" kcal" target={calTarget} data={chartData('calories')} />
          <ProgressChart title={`Protein${wk}`} unit=" g" target={proteinTarget ?? undefined} data={chartData('protein')} />
          <ProgressChart title={`Water${wk}`} unit=" ml" target={waterTarget} data={chartData('waterMl')} />
          <ProgressChart title={`Exercise minutes${wk}`} unit=" min" target={goals?.exerciseMinutesTarget} data={chartData('exerciseMinutes')} />
          <ProgressChart title={`Steps${wk}`} target={goals?.stepsTarget || 10000} data={chartData('steps' as any)} emptyText="No steps recorded in this period." />
          <ProgressChart title={`Calories burned (workouts + steps)${wk}`} unit=" kcal" data={chartData('caloriesBurned')} />

          <View style={{ backgroundColor: colors.card, borderWidth: colors.cardBorderWidth, borderColor: colors.cardBorder, borderRadius: 20, padding: 16, marginBottom: 14, elevation: 2 }}>
            <Text style={styles.cardTitle}>Insights</Text>
            {buildInsights(days as any, { calories: calTarget, protein: proteinTarget, waterMl: waterTarget, steps: goals?.stepsTarget || 10000, exerciseMinutes: goals?.exerciseMinutesTarget }).map((i, idx) => (
              <View key={idx} style={{ flexDirection: 'row', paddingVertical: 9, borderTopWidth: idx ? 1 : 0, borderTopColor: colors.border }}>
                <Text style={{ fontSize: 22, marginRight: 10 }}>{i.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: i.tone === 'warn' ? colors.danger : colors.ink }}>{i.title}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{i.detail}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={S.card}>
            <Text style={styles.cardTitle}>Daily history</Text>
            <Text style={S.muted}>Tap any date to inspect everything recorded on that exact day.</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 }}>
              {(daysOpen ? days : days.slice(-3)).map((day) => (
                <TouchableOpacity key={day.date} onPress={() => setSelectedDate(day.date)} style={[styles.dayChip, selectedDate === day.date && styles.dayChipActive]}>
                  <Text style={[styles.dayChipDate, selectedDate === day.date && { color: '#fff' }]}>{shortDate(day.date)}</Text>
                  <Text style={[styles.dayChipValue, selectedDate === day.date && { color: '#E8E3FF' }]}>{Math.round(day.calories)} kcal</Text>
                </TouchableOpacity>
              ))}
            </View>
            <ShowMoreButton hidden={Math.max(0, days.length - 3)} open={daysOpen} onPress={() => setDaysOpen((o) => !o)} noun="days" />
          </View>

          {selected && <View style={S.card}>
            <Text style={styles.cardTitle}>History for {prettyDate(selected.date)}</Text>
            <Row weight label="Weight" value={selected.weightKg == null ? '—' : `${Number(selected.weightKg).toFixed(1)} kg`} />
            <Row label="Calories eaten" value={`${Math.round(selected.calories)} kcal`} />
            <Row label="Protein" value={`${selected.protein.toFixed(1)} g`} />
            <Row label="Carbs" value={`${selected.carbohydrates.toFixed(1)} g`} />
            <Row label="Fat" value={`${selected.fat.toFixed(1)} g`} />
            <Row label="Fiber" value={`${selected.fiber.toFixed(1)} g`} />
            <Row label="Water" value={`${selected.waterMl} ml`} />
            <Row label="Exercise" value={`${selected.exerciseMinutes} min · ${Math.round(selected.caloriesBurned)} kcal`} />
            <Row label="Tasks" value={`${selected.tasksCompleted}/${selected.tasksTotal} completed`} />
            <Row label="Habits" value={`${selected.habitsCompleted} completed`} />
          </View>}

          {details && <View style={S.card}>
            <Text style={styles.cardTitle}>Complete daily history</Text>
            {(['breakfast', 'lunch', 'dinner', 'snacks'] as const).map((m) => {
              const items = (details.food || []).filter((x: any) => x.mealType === m);
              const kcal = items.reduce((t: number, x: any) => t + Number(x.nutritionTotal?.calories || 0), 0);
              return <HistorySection key={m} title={`${m[0].toUpperCase() + m.slice(1)}${items.length ? ` · ${Math.round(kcal)} kcal` : ''}`} items={items.map((x: any) => `${x.foodName} · ${Math.round(x.consumedQuantity * 10) / 10}${x.servingUnit} · ${Math.round(x.nutritionTotal?.calories || 0)} kcal · ${Number(x.nutritionTotal?.protein || 0).toFixed(1)} g protein`)} />;
            })}
            <HistorySection title="Exercise" items={(details.exercise || []).map((x: any) => `${x.activityName} · ${x.durationMinutes} min · ${Math.round(x.caloriesBurned || 0)} kcal burned`)} />
            <HistorySection title={`Water${wk}`} items={(details.water || []).map((x: any) => `${x.amountMl} ml`)} />
            <HistorySection weight title="Weight" items={(details.weight || []).map((x: any) => `${Number(x.weightKg).toFixed(1)} kg`)} />
            <HistorySection title="Tasks" items={(details.tasks || []).map((x: any) => `${x.title} · ${x.completed ? 'Completed' : 'Pending'}`)} />
            <HistorySection title="Habits" items={(details.habits || []).map((x: any) => `${x.habitName} · ${x.completed ? 'Completed' : 'In progress'}`)} />
          </View>}
        </> : <View style={S.card}><Text style={styles.cardTitle}>No data in this period</Text><Text style={S.muted}>Start logging food, water, exercise or weight and your progress will appear here.</Text></View>}
      <WrappedCard />
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function Row({ label, value, weight = false }: { label: string; value: string; weight?: boolean }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text>{weight ? <WeightReveal compact reaction={false} text={value} style={styles.rowValue} /> : <Text style={styles.rowValue}>{value}</Text>}</View>;
}

function HistorySection({ title, items, weight = false }: { title: string; items: string[]; weight?: boolean }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return <View style={{ marginTop: 12 }}><Text style={styles.sectionTitle}>{title}</Text>{items.length ? items.map((item, index) => <View key={`${title}-${index}`} style={{ backgroundColor: colors.card, borderWidth: colors.cardBorderWidth, borderColor: colors.cardBorder, padding: 15, borderRadius: 17, marginBottom: 9, elevation: 1 }}>{weight ? <WeightReveal compact reaction={false} text={item} style={{ color: colors.ink, fontWeight: '700' }} /> : <Text style={{ color: colors.ink, fontWeight: '700' }}>{item}</Text>}</View>) : <Text style={{ color: colors.muted, fontSize: 12 }}>Nothing recorded.</Text>}</View>;
}

function makeStyles(c: any) {
  return {
    modeRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 7, marginBottom: 12 },
    modeButton: { flexGrow: 1, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12, backgroundColor: c.chipBg, alignItems: 'center' as const, minWidth: 70 },
    modeActive: { backgroundColor: c.primarySolid },
    modeText: { fontSize: 12, fontWeight: '800' as const, color: c.muted },
    modeTextActive: { color: '#fff' },
    periodNav: { flexDirection: 'row' as const, alignItems: 'center' as const },
    navButton: { width: 44, height: 44, borderRadius: 13, backgroundColor: c.chipBg, alignItems: 'center' as const, justifyContent: 'center' as const },
    disabled: { opacity: 0.35 },
    navText: { fontSize: 30, color: c.primary, lineHeight: 32 },
    today: { color: c.primary, fontWeight: '800' as const, fontSize: 12 },
    periodTitle: { color: c.ink, fontWeight: '800' as const, fontSize: 17, marginTop: 2 },
    anchorRow: { marginTop: 13, gap: 6 },
    anchorInput: { borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 10, fontSize: 13, color: c.ink },
    rangeText: { color: c.muted, fontSize: 12 },
    dateRow: { flexDirection: 'row' as const, alignItems: 'flex-end' as const },
    dateLabel: { fontSize: 12, color: c.muted, fontWeight: '700' as const, marginBottom: 5 },
    dateInput: { borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 11, fontSize: 13, color: c.ink },
    statGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, justifyContent: 'space-between' as const },
    stat: { width: '48%' as const, backgroundColor: c.card, borderWidth: c.cardBorderWidth, borderColor: c.cardBorder, borderRadius: 17, padding: 15, marginBottom: 10, elevation: 1 },
    statValue: { fontSize: 20, fontWeight: '800' as const, color: c.primary },
    statLabel: { fontSize: 12, color: c.muted, marginTop: 4 },
    cardTitle: { fontSize: 17, fontWeight: '800' as const, color: c.ink, marginBottom: 6 },
    dayChip: { backgroundColor: c.chipBg, borderRadius: 14, padding: 11, marginRight: 8, minWidth: 78 },
    dayChipActive: { backgroundColor: c.primarySolid },
    dayChipDate: { fontSize: 12, fontWeight: '800' as const, color: c.ink },
    dayChipValue: { fontSize: 12, color: c.muted, marginTop: 4 },
    row: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.border },
    rowLabel: { color: c.muted, fontSize: 13 },
    rowValue: { color: c.ink, fontSize: 13, fontWeight: '800' as const },
    sectionTitle: { fontSize: 15, fontWeight: '800' as const, color: c.ink, marginBottom: 6 },
  };
}

// A crash in this tab shows a friendly retry screen (and is reported to Sentry) instead of closing the app.
export { ScreenError as ErrorBoundary } from '../../components/ScreenError';
