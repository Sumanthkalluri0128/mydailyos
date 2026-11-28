import { MicroToggle } from './MicroCard';
import React, { useEffect, useState } from 'react';
import { StreakFlame } from '../motion/StreakFlame';
import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { today } from '../config/api';
import { useTheme, lift } from '../utils/theme';
import { resolveTargets, rangeStatus, EnergyProfile } from '../utils/energy';
import { buildNudges, suggestFoods, Nudge, SuggestFood } from '../utils/suggest';
import { ProgressBar } from './ProgressBar';
import { read } from '../utils/offline';

const card = (c: any) => ({ backgroundColor: c.card, borderWidth: c.cardBorderWidth, borderColor: c.cardBorder, borderRadius: 22, padding: 18, marginBottom: 14, ...lift(c, 1) } as const);

/** 🔥 Days-in-a-row food logging streak, with the last 14 days as dots. */
export function StreakPill({ refreshKey = 0 }: { refreshKey?: any }) {
  const { colors: c } = useTheme();
  const [s, setS] = useState<any>(null);
  useEffect(() => { read<any>(`/api/progress/streaks?today=${today()}`).then((r) => setS(r.streaks)).catch(() => {}); }, [refreshKey]);
  if (!s) return null;
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/achievements' as any)} style={[card(c), { flexDirection: 'row', alignItems: 'center' }]}>
      <Text style={{ fontSize: 32, marginRight: 12 }}>{s.current > 0 ? '🔥' : '🌱'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: c.ink }}>
          {s.current > 0 ? `${s.current}-day logging streak` : 'Start your streak today'}
        </Text>
        <Text style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>
          {s.loggedToday ? 'Today is logged ✓' : s.current > 0 ? 'Log a meal today to keep it going' : 'Log any food to begin'} · best {s.longest}
        </Text>
        <View style={{ flexDirection: 'row', marginTop: 8, gap: 4 }}>
          {s.last14.map((d: any) => <View key={d.date} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: d.logged ? '#E8823A' : c.border }} />)}
        </View>
      </View>
    </TouchableOpacity>
  );
}

/** Small 🔥 chip for the header: the streak number, tap for badges. Shows nothing until the streak is known. */
export function StreakChip({ refreshKey = 0, onLoaded }: { refreshKey?: any; onLoaded?: (s: { current: number; loggedToday: boolean }) => void }) {
  const { colors: c } = useTheme();
  const [s, setS] = useState<any>(null);
  useEffect(() => { read<any>(`/api/progress/streaks?today=${today()}`).then((r) => { setS(r.streaks); onLoaded?.({ current: r.streaks.current, loggedToday: r.streaks.loggedToday }); }).catch(() => {}); }, [refreshKey]);
  if (!s) return null;
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/achievements' as any)} accessibilityRole="button" accessibilityLabel={s.current > 0 ? `${s.current} day streak` : 'Start a streak'}
      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 }}>
      {s.current > 0 ? <StreakFlame streak={s.current} compact bare /> : <Text style={{ fontSize: 16 }}>🌱</Text>}
      <Text style={{ fontSize: 14, fontWeight: '800', color: c.ink, marginLeft: 5 }}>{s.current}</Text>
    </TouchableOpacity>
  );
}

/** Time-aware in-app reminders for whatever is still missing today. */
export function Nudges(p: { meals: Record<string, number>; waterMl: number; waterTarget: number; steps: number; stepsTarget: number; kcalLeft: number }) {
  const { colors: c } = useTheme();
  const nudges: Nudge[] = buildNudges({
    hour: new Date().getHours(), mealsLogged: { breakfast: (p.meals.breakfast || 0) > 0, lunch: (p.meals.lunch || 0) > 0, dinner: (p.meals.dinner || 0) > 0 },
    waterMl: p.waterMl, waterTarget: p.waterTarget, steps: p.steps, stepsTarget: p.stepsTarget, kcalLeft: p.kcalLeft,
  });
  if (!nudges.length) return null;
  const go = (n: Nudge) => router.push((n.action === 'water' ? '/water' : n.action === 'steps' ? '/health' : '/food') as any);
  return (
    <View style={{ marginBottom: 6 }}>
      {nudges.map((n) => (
        <TouchableOpacity key={n.id} onPress={() => go(n)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.primarySoft, borderRadius: 16, padding: 13, marginBottom: 8 }}>
          <Text style={{ fontSize: 20, marginRight: 10 }}>{n.icon}</Text>
          <Text style={{ flex: 1, color: c.ink, fontSize: 13, fontWeight: '600' }}>{n.text}</Text>
          <Text style={{ color: c.primary, fontWeight: '800' }}>›</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** Protein / carbs / fat against targets that add up to the calorie goal. */
export function MacroCard({ profile, eaten, budget }: { profile: (EnergyProfile & { goals?: any }) | null; budget?: number; eaten: { protein: number; carbohydrates: number; fat: number; fiber?: number; sugar?: number; sodium?: number } }) {
  const { colors: c } = useTheme();
  const T = resolveTargets(profile, { budget }); // today's real budget when known, so this card, the Home ring and the quests agree
  const e = T?.energy ?? null;
  if (!e) return null;
  const m = T!.macros;
  const lim = T!.limits;
  const rg = T!.ranges;
  const STATUS = { low: '▼ below minimum', ok: '✓ in range', high: '▲ above maximum' } as const;
  // Healthy minimum–maximum for each macro, with where you are right now (words and symbols, not colour alone).
  const high = (k: 'protein' | 'carbs' | 'fat' | 'fiber', v: number) => rangeStatus(v, rg[k]) === 'high'; // red only when past the healthy maximum, not just past the goal
  const aim = (k: 'protein' | 'carbs' | 'fat' | 'fiber', v: number) => `Aim ${rg[k].min}–${rg[k].max} g · goal ${rg[k].goal} g · ${STATUS[rangeStatus(v, rg[k])]}`;
  return (
    <View style={card(c)}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: c.ink }}>Macros today</Text>
      <Text style={{ fontSize: 12, color: c.muted, marginTop: 3, marginBottom: 12 }}>{T!.macroBasisNote}</Text>
      <ProgressBar label="Protein" color="#20A46B" overIsBad={high('protein', eaten.protein)} value={eaten.protein} target={m.protein} valueText={`${Math.round(eaten.protein)} g`} targetText={`${m.protein} g`} hint={aim('protein', eaten.protein)} height={10} />
      <ProgressBar label="Carbs" color="#E8A23A" overIsBad={high('carbs', eaten.carbohydrates)} value={eaten.carbohydrates} target={m.carbs} valueText={`${Math.round(eaten.carbohydrates)} g`} targetText={`${m.carbs} g`} hint={aim('carbs', eaten.carbohydrates)} height={10} />
      <ProgressBar label="Fat" color="#D6577A" overIsBad={high('fat', eaten.fat)} value={eaten.fat} target={m.fat} valueText={`${Math.round(eaten.fat)} g`} targetText={`${m.fat} g`} hint={aim('fat', eaten.fat)} height={10} />
      <ProgressBar label="Fibre" color="#7A9E3B" value={eaten.fiber || 0} target={m.fiber} valueText={`${Math.round(eaten.fiber || 0)} g`} targetText={`${m.fiber} g`} hint={aim('fiber', eaten.fiber || 0)} height={10} />
      <ProgressBar label="Sugar (keep under)" color="#B57EDC" overIsBad value={eaten.sugar || 0} target={lim.sugar} valueText={`${Math.round(eaten.sugar || 0)} g`} targetText={`${lim.sugar} g`} hint="Total sugar incl. fruit & milk" height={10} />
      {(eaten.sodium || 0) > 0 && <ProgressBar label="Sodium (keep under)" color="#5AA9E6" overIsBad value={eaten.sodium || 0} target={lim.sodiumMg} valueText={`${Math.round(eaten.sodium || 0)} mg`} targetText={`${lim.sodiumMg} mg`} hint="" height={10} />}
      <MicroToggle losing={e.direction === 'lose'} />
    </View>
  );
}

/** Foods from the person's recents/favourites that fit the calories and protein still left. */
export function Suggestions({ kcalLeft, proteinLeft }: { kcalLeft: number; proteinLeft: number }) {
  const { colors: c } = useTheme();
  const [foods, setFoods] = useState<SuggestFood[]>([]);
  useEffect(() => { read<any>('/api/foods/recent').then((r) => setFoods(r.foods || [])).catch(() => {}); }, []);
  const picks = suggestFoods(foods, kcalLeft, proteinLeft);
  if (!picks.length) return null;
  return (
    <View style={card(c)}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: c.ink }}>Quick picks for the rest of your day</Text>
      <Text style={{ fontSize: 12, color: c.muted, marginTop: 3, marginBottom: 10 }}>From your own favourites, matched to what's left.</Text>
      {picks.map(({ food, fits }) => (
        <TouchableOpacity key={food._id} onPress={() => router.push('/food' as any)} style={{ paddingVertical: 9, borderTopWidth: 1, borderTopColor: c.border }}>
          <Text style={{ fontWeight: '700', color: c.ink }}>{food.name}</Text>
          <Text style={{ fontSize: 12, color: c.muted }}>{fits}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
