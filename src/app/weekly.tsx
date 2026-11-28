import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Screen, useThemedStyles } from '../components/UI';
import { prettyDate } from '../utils/dates';
import { useProfile } from '../hooks/useProfile';
import { fmtEnergy, fmtVolume, fmtWeight } from '../utils/units';
import { read, useRefreshOnSync } from '../utils/offline';
import { ProgressBar } from '../components/ProgressBar';
import { WeekStrip } from '../components/WeekStrip';
import { WeeklyCoachCard } from '../components/WeeklyCoachCard';
import { MicroCard } from '../components/MicroCard';
import { OverDayCard } from '../components/OverDayCard';
import { PatternsCard } from '../components/PatternsCard';
import { WeightReveal } from '../components/WeightReveal';

export default function Weekly() {
  const { S, colors } = useThemedStyles();
  const { units } = useProfile();
  const [data, setData] = useState<any>(null);
  const [plateau, setPlateau] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await read<any>('/api/progress/weekly'));
      read<any>('/api/progress/plateau').then(setPlateau).catch(() => {});
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useRefreshOnSync(() => load());

  if (loading || !data) return <SafeAreaView style={S.safe}><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary} /></View></SafeAreaView>;

  const trend = (v: number | null) => v == null ? '' : v > 0 ? `▲ ${v}%` : v < 0 ? `▼ ${Math.abs(v)}%` : '— steady';
  const trendColor = (v: number | null) => v == null ? colors.muted : v > 0 ? colors.success : v < 0 ? colors.danger : colors.muted;

  return (
    <Screen buddyWho="gojo" buddy="chart" buddySays="Your week" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back"><Text style={S.back}>‹ Back</Text></TouchableOpacity>
      <Text style={S.title}>Weekly Summary</Text>
      <Text style={S.sub}>{prettyDate(data.from)} – {prettyDate(data.to)} · {data.activeDays}/7 active days</Text>

      <OverDayCard />
      <WeeklyCoachCard />
      <MicroCard />
      <PatternsCard />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <Metric label="Avg calories" value={fmtEnergy(data.averages.calories, units.energy)} trend={trend(data.trends.calories)} tColor={trendColor(data.trends.calories)} colors={colors} />
        <Metric label="Total water" value={fmtVolume(data.totals.waterMl, units.volume)} trend={trend(data.trends.waterMl)} tColor={trendColor(data.trends.waterMl)} colors={colors} />
        <Metric label="Exercise" value={`${data.totals.exerciseMinutes} min`} trend={trend(data.trends.exerciseMinutes)} tColor={trendColor(data.trends.exerciseMinutes)} colors={colors} />
        <Metric label="Tasks done" value={`${data.totals.tasksCompleted}/${data.totals.tasksTotal}`} trend={trend(data.trends.tasksCompleted)} tColor={trendColor(data.trends.tasksCompleted)} colors={colors} />
      </View>

      {data.weight && (
        <View style={S.card}>
          <Text style={{ fontWeight: '800', color: colors.ink }}>Weight this week</Text>
          <WeightReveal compact reaction={false} text={`${fmtWeight(data.weight.start, units.weight)} → ${fmtWeight(data.weight.end, units.weight)} (${data.weight.change > 0 ? '+' : ''}${data.weight.change} kg)`} style={{ color: colors.muted, marginTop: 4 }} />
        </View>
      )}

      {plateau && plateau.status !== 'insufficient_data' && plateau.status !== 'on_track' && (
        <View style={[S.card, { borderLeftWidth: 4, borderLeftColor: plateau.status === 'wrong_direction' ? colors.danger : '#E0A43A' }]}>
          <Text style={{ fontWeight: '800', color: colors.ink }}>{plateau.status === 'plateau' ? '⏸️ Weight plateau' : plateau.status === 'wrong_direction' ? '↗️ Trend check' : plateau.status === 'estimated_up' || plateau.status === 'estimated' ? '📝 Estimated from your food log' : '⚖️ Weight trend'}</Text>
          <Text style={{ color: colors.muted, marginTop: 4, lineHeight: 20 }}>{plateau.message}</Text>
          {plateau.slopeKgPerWeek != null && (
            <WeightReveal compact reaction={false} text={`${plateau.slopeKgPerWeek > 0 ? '+' : ''}${plateau.slopeKgPerWeek} kg/week from ${plateau.weighIns} weigh-ins`} style={[S.muted, { marginTop: 6 }]} />
          )}
          {plateau.estimate && Math.abs(plateau.estimate.deltaKg) >= 0.2 && (
            <Text style={[S.muted, { marginTop: 6 }]}>{`Estimate from food log: ${plateau.estimate.deltaKg > 0 ? '+' : ''}${plateau.estimate.deltaKg} kg (not a measurement, not on your graph)`}</Text>
          )}
        </View>
      )}

      {!!data.days?.length && (
        <View style={S.card}>
          <Text style={{ fontWeight: '800', color: colors.ink }}>Calories each day</Text>
          <WeekStrip days={data.days} />
        </View>
      )}

      {data.nutrients?.loggedDays > 0 && (
        <View style={S.card}>
          <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: 8 }}>Daily average vs target</Text>
          {data.nutrients.rows.map((r: any) => (
            <ProgressBar key={r.key} label={r.label} color={r.status === 'low' ? colors.danger : r.status === 'near' ? '#E0A43A' : colors.primary}
              value={r.average} target={r.target} valueText={`${r.average} g`} targetText={`${r.target} g`} hint={`${r.percentOfTarget}% of target`} height={10} />
          ))}
          {(data.nutrients.limits || []).map((r: any) => (
            <ProgressBar key={r.key} label={`${r.label} (keep under)`} overIsBad color={r.status === 'high' ? colors.danger : r.status === 'near' ? '#E0A43A' : colors.primary}
              value={r.average} target={r.limit} valueText={`${r.average} ${r.unit}`} targetText={`${r.limit} ${r.unit}`} hint={`${r.percentOfLimit}% of the guide`} height={10} />
          ))}
          {!!data.nutrients.tip && <Text style={{ color: colors.muted, marginTop: 8, lineHeight: 20 }}>💡 {data.nutrients.tip}</Text>}
          <Text style={[S.muted, { marginTop: 6 }]}>Based on {data.nutrients.loggedDays} day{data.nutrients.loggedDays === 1 ? '' : 's'} with food logged.</Text>
        </View>
      )}

      {data.bestDay && (
        <View style={S.card}>
          <Text style={{ fontWeight: '800', color: colors.ink }}>🌟 Best day: {prettyDate(data.bestDay.date)}</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{data.bestDay.highlights.join(' · ')}</Text>
        </View>
      )}

      <View style={S.card}>
        <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: 8 }}>Goal days this week</Text>
        {Object.entries(data.goalDays as Record<string, number>).filter(([, v]) => v > 0 || true).map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
            <Text style={{ color: colors.muted, textTransform: 'capitalize' }}>{k}</Text>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>{v}/7 days</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

function Metric({ label, value, trend, tColor, colors }: { label: string; value: string; trend: string; tColor: string; colors: any }) {
  return (
    <View style={{ width: '48%', backgroundColor: colors.card, borderWidth: colors.cardBorderWidth, borderColor: colors.cardBorder, borderRadius: 16, padding: 14, marginBottom: 10 }}>
      <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '700' }}>{label}</Text>
      <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 4 }}>{value}</Text>
      {!!trend && <Text style={{ fontSize: 12, color: tColor, marginTop: 3, fontWeight: '700' }}>{trend}</Text>}
    </View>
  );
}
