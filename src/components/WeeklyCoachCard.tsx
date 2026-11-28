// Weekly review + "what to change" + boss fight, all from /api/progress/coach. Characters celebrate or encourage by mood.
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useThemedStyles } from './UI';
import Buddy from '../motion/Buddy';
import { CHARS, type Who } from '../motion/chars';
import { read, useRefreshOnSync } from '../utils/offline';
import { today } from '../config/api';
import { TreatCard, DietBreak, coachLearn } from './CoachCards';
import { useCoachTone } from '../utils/coachTone';
import { Chip } from './Chip';
import { weekSummary } from '../utils/weekSummary';

type Coach = {
  tips: { id: string; icon: string; title: string; detail: string }[];
  challenge: { type: string; title: string; who: Who; unit: string; target: number; progress: number; defeated: boolean; daysLeft: number; canStillWin: boolean };
  weekBudget: { budget: number; usedBeforeToday: number; daysLeft: number; perDayLeft: number; dailyTarget: number; diffPerDay: number; treatReserved?: number } | null;
  treat?: any;
  maintenance: { estimate: number; expected: number | null; diff: number | null; avgIntake: number; kgPerWeek: number; loggedDays: number; weighIns: number; confidence: 'low' | 'medium' | 'high' } | null;
  microInsights?: { id: string; line: string; sources?: { foods?: { name: string }[]; hint?: string } }[];
  review: { score: number; mood: 'celebrate' | 'good' | 'encourage'; headline: string; text: string; loggedDays: number; avgCalories: number; avgProtein: number };
};

export function WeeklyCoachCard() {
  const { S, colors } = useThemedStyles();
  const [d, setD] = useState<Coach | null>(null);
  const [tried, setTried] = useState<Record<string, boolean>>({});
  const tone = useCoachTone();
  const load = useCallback(async () => { try { setD(await read<Coach>(`/api/progress/coach?today=${today()}`)); } catch { /* optional card: stay hidden offline */ } }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { (d?.tips || []).forEach((t) => coachLearn(t.id, 'shown')); }, [d?.tips?.map((t) => t.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  useRefreshOnSync(() => load());
  if (!d) return null;

  const { review, tips, challenge: ch, weekBudget: wb, maintenance: mt } = d;
  const mi = d.microInsights || [];
  const reviewScene = review.mood === 'celebrate' ? 'victory' : review.mood === 'good' ? 'cheer' : 'wave';
  const hpLeft = Math.max(0, ch.target - ch.progress);
  const bossName = CHARS[ch.who] || 'The boss';
  const sum = weekSummary({ review, tips, challenge: ch, bossName });
  const fightText = ch.defeated ? `${bossName} is defeated! 🎉` : !ch.canStillWin ? `${bossName} wins this round. Rematch next Monday.` : `${hpLeft} more ${ch.unit} to beat ${bossName} · ${ch.daysLeft} day${ch.daysLeft === 1 ? '' : 's'} left`;

  return (
    <>
      <View style={[S.card, { gap: 12 }]} accessibilityRole="summary">
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Buddy scene={reviewScene} size={84} label={`${review.headline}`} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted }}>YOUR WEEK</Text>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink }}>{sum.headline}</Text>
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary, marginTop: 4 }}>Score {review.score}/100 · {review.loggedDays}/7 days logged</Text>
          </View>
        </View>
        <View accessibilityLabel="What went well">
          <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: 2 }}>✅ What went well</Text>
          {sum.well.map((w) => <Text key={w} style={S.muted}>• {w}</Text>)}
        </View>
        {sum.change.length > 0 && (
          <View accessibilityLabel="What to change">
            <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: 2 }}>🔧 What to change</Text>
            {sum.change.map((c) => <Text key={c.id} style={S.muted}>{c.icon} {c.title}</Text>)}
          </View>
        )}
        {sum.next && (
          <View accessibilityLabel="One thing for next week" style={{ padding: 12, borderRadius: 14, backgroundColor: colors.primarySoft }}>
            <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: 2 }}>🎯 One thing for next week</Text>
            <Text style={{ color: colors.ink }}><Text style={{ fontWeight: '800' }}>{sum.next.title}. </Text>{sum.next.detail}</Text>
            {tried[sum.next.id] ? <Text style={S.muted}>Noted. Good luck!</Text> : <Chip small label="I'll try this" onPress={() => { coachLearn(sum.next!.id, 'accepted'); setTried({ ...tried, [sum.next!.id]: true }); }} />}
          </View>
        )}
      </View>

      {mi.length > 0 && (
        <View style={S.card}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 8 }}>Power-ups to look at</Text>
          {mi.map((m) => (
            <View key={m.id} style={{ flexDirection: 'row', marginBottom: 10 }}>
              <Text style={{ fontSize: 24, marginRight: 10 }}>🥬</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: colors.ink }}>{m.line}</Text>
                <Text style={[S.muted, { marginTop: 2 }]}>{m.sources?.foods?.length ? `Try more of: ${m.sources.foods.map((f) => f.name).join(', ')}.` : m.sources?.hint || ''}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {wb && !tone.gentle && (
        <View style={S.card}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>Weekly calorie budget</Text>
          <Text style={[S.muted, { marginTop: 4 }]}>
            {wb.budget.toLocaleString()} kcal for the week · {wb.usedBeforeToday.toLocaleString()} counted so far (days you didn't log count as on budget).
          </Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: wb.diffPerDay < 0 ? colors.danger : colors.success, marginTop: 8 }}>{wb.diffPerDay < 0 ? '▼ ' : wb.diffPerDay > 0 ? '▲ ' : '● '}{wb.perDayLeft.toLocaleString()} kcal/day</Text>
          {!!wb.treatReserved && <Text style={S.muted}>This already sets aside {wb.treatReserved.toLocaleString()} kcal of treats you have planned.</Text>}
          <Text style={S.muted}>{wb.diffPerDay === 0 ? 'right on your daily target' : wb.diffPerDay < 0 ? `${Math.abs(wb.diffPerDay)} below your usual ${wb.dailyTarget.toLocaleString()} target` : `${wb.diffPerDay} above your usual ${wb.dailyTarget.toLocaleString()} target`} for the next {wb.daysLeft} day{wb.daysLeft === 1 ? '' : 's'} to finish the week on budget.</Text>
        </View>
      )}

      {!tone.gentle && <TreatCard treat={d.treat} reload={load} />}
      <DietBreak reload={load} />

      {mt && !tone.gentle && (
        <View style={S.card}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>What your body seems to burn</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.primary, marginTop: 6 }}>≈ {mt.estimate.toLocaleString()} kcal/day</Text>
          <Text style={[S.muted, { marginTop: 4 }]}>
            From {mt.loggedDays} logged days averaging {mt.avgIntake.toLocaleString()} kcal and a weight change of {mt.kgPerWeek > 0 ? '+' : ''}{mt.kgPerWeek} kg/week. Confidence: {mt.confidence}.
            {mt.diff !== null && mt.expected !== null && Math.abs(mt.diff) >= 150 ? ` The app's formula says ${mt.expected.toLocaleString()}, so your real maintenance looks ${mt.diff < 0 ? 'lower' : 'higher'} by about ${Math.abs(mt.diff)} kcal${mt.diff < 0 ? ', which may explain a slower loss than expected. Check that eating-out meals and oil are logged.' : '.'}` : ''}
          </Text>
        </View>
      )}

      <View style={[S.card, { borderWidth: 2, borderColor: ch.defeated ? colors.success : colors.primary }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Buddy who={ch.who} scene={ch.defeated ? 'sad' : 'fight'} size={84} label={`${bossName}, this week's boss`} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted }}>BOSS FIGHT</Text>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>{ch.title} vs {bossName}</Text>
            <Text style={[S.muted, { marginTop: 2 }]}>Reach {ch.target} {ch.unit} this week (Mon–Sun).</Text>
          </View>
        </View>
        <View style={{ height: 12, backgroundColor: colors.chipBg, borderRadius: 6, marginTop: 12, overflow: 'hidden' }} accessibilityLabel={`Boss health ${hpLeft} of ${ch.target}`}>
          <View style={{ height: 12, width: `${(hpLeft / ch.target) * 100}%`, backgroundColor: ch.defeated ? colors.success : colors.danger }} />
        </View>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink, marginTop: 6 }}>{fightText}</Text>
      </View>
    </>
  );
}
