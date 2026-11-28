// One day of the plan: what it trains, how long it takes, every exercise with sets x reps, and a swap button on each.
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from '../components/Notifications';
import { useProfile } from '../hooks/useProfile';
import { today } from '../config/api';
import { COOLDOWN, EXERCISES, PlanItem, WARMUP, dayByNumber } from '../data/workoutPlan';
import * as W from '../utils/workoutEngine';
import { pickRoutine, saveActive, setSwap, useWorkoutStore } from '../utils/workoutStore';
import { AlternativesSheet, ExerciseRow, RoutineList } from '../components/workout/WorkoutParts';
import { Btn, Card, Header, IconBtn, Pill, SectionTitle, Tile, useWK } from '../components/workout/WorkoutKit';

export default function WorkoutDay() {
  const k = useWK();
  const { n } = useLocalSearchParams<{ n?: string }>();
  const day = dayByNumber(Number(n) || 1);
  const lifts = day.items.length > 0;      // Smart-program easy-cardio / rest slots have no lifts: nothing to start
  const store = useWorkoutStore();
  const { confirm } = useNotifications();
  const { profile } = useProfile();
  const [sheet, setSheet] = useState<PlanItem | null>(null);
  const [showWarm, setShowWarm] = useState(false);
  const bodyKg = profile?.currentWeightKg || W.DEFAULT_BODY_KG;
  const isToday = W.weekDates(today())[day.n - 1] === today();
  const doneOn = store.sessions.find((s) => s.date === W.weekDates(today())[day.n - 1]);

  const start = async () => {
    const act = store.active;
    if (act && act.dayN === day.n) { router.push('/workout-session'); return; }
    if (act) {
      const ok = await confirm({ title: 'Replace the workout in progress?', message: 'Starting a new one discards the unfinished workout.', confirmText: 'Start new', destructive: true });
      if (!ok) return;
      saveActive(null);
    }
    router.push({ pathname: '/workout-session', params: { dayN: String(day.n) } });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: k.c.bg }}>
      <Header title={`Day ${day.n} – ${day.short}`} subtitle={day.focus} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130 }}>
        <Card tint="accent">
          <Text style={{ fontSize: 23, fontWeight: '900', color: k.c.ink, letterSpacing: -0.4 }}>{day.title}</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <Pill text={day.smart ? 'Built for you' : 'Beginner'} tone="accent" />
            {isToday && <Pill text="Today" tone="good" icon="today-outline" />}
            {doneOn && <Pill text="Done this week" tone="good" icon="checkmark-circle" />}
          </View>
          <Text style={{ color: k.c.muted, marginTop: 10, lineHeight: 20 }}>{day.intro}</Text>
        </Card>

        {day.kind !== 'rest' && lifts && (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
            <Tile icon="time-outline" value={`~${W.plannedMinutes(day, store.swaps)} min`} label="Duration" />
            <Tile icon="flame" value={`~${W.plannedKcal(day, bodyKg)}`} label="kcal (est.)" />
            <Tile icon="barbell" value={`${day.items.length}`} label="Exercises" />
          </View>
        )}

        {day.targets.length > 0 && (
          <>
            <SectionTitle>Muscles targeted</SectionTitle>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {day.targets.map((t) => (
                <View key={t.label} style={{ flex: 1, backgroundColor: k.c.card, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center', borderWidth: 1, borderColor: k.c.border }}>
                  <Text style={{ fontWeight: '900', color: k.c.ink, fontSize: 13 }} numberOfLines={1}>{t.label}</Text>
                  <Text style={{ color: k.c.muted, fontSize: 10.5, marginTop: 2, textAlign: 'center' }} numberOfLines={2}>{t.note}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {day.kind === 'strength' && (
          <Card onPress={() => setShowWarm(!showWarm)} style={{ paddingVertical: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="flame" size={22} color={k.accentText} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '900', color: k.c.ink }}>Warm-up & cool-down</Text>
                <Text style={{ color: k.c.muted, fontSize: 12.5 }}>5–8 min each · pick your own alternatives</Text>
              </View>
              <Ionicons name={showWarm ? 'chevron-up' : 'chevron-down'} size={20} color={k.c.muted} />
            </View>
          </Card>
        )}
        {showWarm && (
          <View>
            <Text style={{ fontWeight: '900', color: k.c.ink, marginBottom: 8 }}>Warm-up</Text>
            <RoutineList rows={WARMUP} picks={store.routinePicks} onPick={pickRoutine} readOnly />
            <Text style={{ fontWeight: '900', color: k.c.ink, marginVertical: 8 }}>Cool-down</Text>
            <RoutineList rows={COOLDOWN} picks={store.routinePicks} onPick={pickRoutine} readOnly />
          </View>
        )}

        {day.kind === 'rest' ? (
          <Card tint="good"><Text style={{ color: k.c.ink, lineHeight: 21 }}>No training today. Walk if you feel like it, stretch gently, sleep well. Open the Today tab on a rest day for a 10-minute mobility routine.</Text></Card>
        ) : (
          <>
            <SectionTitle right={<Text style={{ color: k.c.muted, fontSize: 12.5 }}>Tap ⇄ to swap</Text>}>Exercises</SectionTitle>
            {day.items.map((it) => {
              const id = W.chosenId(day.n, it, store.swaps);
              const ex = EXERCISES[id];
              const unit = ex.unit === 'sec' ? ' sec' : ex.unit === 'min' ? ' min' : ' reps';
              return (
                <ExerciseRow key={it.ex} ex={ex} swapped={id !== it.ex}
                  line={it.sets > 1 || ex.unit !== 'min' ? `${it.sets} sets × ${it.reps}${unit}${ex.perSide ? ' each side' : ''}` : `${it.reps}${unit}`}
                  sub={it.restSec ? `Rest ${it.restSec}s` : undefined}
                  onPress={() => router.push({ pathname: '/workout-exercise', params: { id, dayN: String(day.n) } })}
                  right={<IconBtn icon="swap-horizontal" label={`Swap ${ex.name}`} onPress={() => setSheet(it)} bg={k.accentSoft} color={k.accentText} />} />
              );
            })}
          </>
        )}
      </ScrollView>

      {day.kind !== 'rest' && lifts && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 24, backgroundColor: k.c.bg, borderTopWidth: 1, borderTopColor: k.c.border }}>
          <Btn label={store.active?.dayN === day.n ? 'Resume workout' : 'Start workout'} icon="play" onPress={start} />
        </View>
      )}

      <AlternativesSheet visible={!!sheet} onClose={() => setSheet(null)} item={sheet} currentId={sheet ? W.chosenId(day.n, sheet, store.swaps) : ''}
        onPick={(id) => { if (sheet) setSwap(day.n, sheet.ex, id); setSheet(null); }}
        onInfo={(id) => { setSheet(null); router.push({ pathname: '/workout-exercise', params: { id, dayN: String(day.n) } }); }} />
    </SafeAreaView>
  );
}
