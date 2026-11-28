// One exercise: the illustrated movement, how to do it, what it works, and its alternatives. Opened from the plan, the library or mid-workout.
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import ExercisePic from '../components/ExercisePic';
import ExercisePhoto, { tipsFor } from '../components/ExercisePhoto';
import { hasPhoto } from '../data/exerciseImages';
import { useProfile } from '../hooks/useProfile';
import { weightValue } from '../utils/units';
import { activeDays, EXERCISES, exerciseList, dayByNumber } from '../data/workoutPlan';
import * as W from '../utils/workoutEngine';
import { setSwap, toggleFav, useWorkoutStore } from '../utils/workoutStore';
import { Btn, Card, Header, IconBtn, Pill, Seg, Tile, useWK } from '../components/workout/WorkoutKit';
import { ExerciseRow } from '../components/workout/WorkoutParts';

type Tab = 'how' | 'muscles' | 'alts';

export default function WorkoutExercise() {
  const k = useWK();
  const { id, dayN } = useLocalSearchParams<{ id?: string; dayN?: string }>();
  const ex = EXERCISES[String(id)];
  const store = useWorkoutStore();
  const { units } = useProfile();
  const unit = units?.weight || 'kg';
  const [tab, setTab] = useState<Tab>('how');
  if (!ex) return <SafeAreaView style={{ flex: 1, backgroundColor: k.c.bg }}><Header title="Exercise" onBack={() => router.back()} /><Text style={{ color: k.c.muted, padding: 20 }}>That exercise is not in the library.</Text></SafeAreaView>;

  const day = dayN ? dayByNumber(Number(dayN)) : null;
  // The plan row this exercise belongs to on that day (as the original or as one of its alternatives).
  const item = day?.items.find((i) => i.ex === ex.id || i.alts.includes(ex.id)) || null;
  const anyItem = item || activeDays().flatMap((d) => d.items).find((i) => i.ex === ex.id) || null;
  const fav = store.favs.includes(ex.id);
  const last = W.lastTimeFor(store.sessions, ex.id);
  const best = W.bestFor(store.sessions, ex.id);
  const altIds = item ? [item.ex, ...item.alts].filter((x) => x !== ex.id)
    : anyItem ? [anyItem.ex, ...anyItem.alts].filter((x) => x !== ex.id)
    : exerciseList().filter((e) => e.cat === ex.cat && e.id !== ex.id).slice(0, 5).map((e) => e.id);
  const isCurrent = !!(day && item && W.chosenId(day.n, item, store.swaps) === ex.id);
  const unitText = ex.unit === 'sec' ? 'sec' : ex.unit === 'min' ? 'min' : 'reps';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: k.c.bg }}>
      <Header title={ex.name} subtitle={`${ex.cat} · ${ex.gear}`} onBack={() => router.back()}
        right={<IconBtn icon={fav ? 'heart' : 'heart-outline'} label={fav ? 'Remove from saved' : 'Save exercise'} color={fav ? '#E8476F' : undefined} onPress={() => toggleFav(ex.id)} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        {hasPhoto(ex.name)
          ? <ExercisePhoto name={ex.name} />
          : <ExercisePic ex={{ id: ex.fig, slot: ex.slot, name: ex.name, kind: ({ Dumbbell: 'free weights', Cable: 'cable', Machine: 'machine', Band: 'band' } as any)[ex.gear], targets: ex.targets }} />}
        <View style={{ height: 14 }} />
        <Seg<Tab> value={tab} onChange={setTab} options={[{ k: 'how', label: 'How to do' }, { k: 'muscles', label: 'Muscles' }, { k: 'alts', label: 'Alternatives' }]} />

        {tab === 'how' && (
          <View>
            <Card>
              <Text style={{ fontWeight: '900', color: k.c.ink, fontSize: 17, marginBottom: 10 }}>Steps</Text>
              {ex.steps.map((s, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: k.accent, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>{i + 1}</Text></View>
                  <Text style={{ flex: 1, color: k.c.ink, fontSize: 15, lineHeight: 22 }}>{s}</Text>
                </View>
              ))}
              <View style={{ backgroundColor: k.accentSoft, borderRadius: 12, padding: 12 }}><Text style={{ color: k.c.ink, lineHeight: 19 }}>💡 {ex.tip}</Text></View>
              {tipsFor(ex.name).length > 0 && (
                <View style={{ marginTop: 10 }} accessibilityLabel="Tips">
                  {tipsFor(ex.name).map((t) => <Text key={t} style={{ color: k.c.muted, lineHeight: 20, marginTop: 2 }}>• {t}</Text>)}
                </View>
              )}
            </Card>
            {anyItem && (
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                <Tile icon="layers-outline" value={`${anyItem.sets}`} label="Sets" />
                <Tile icon="repeat" value={anyItem.reps} label={unitText === 'reps' ? 'Reps' : unitText === 'sec' ? 'Seconds' : 'Minutes'} />
                <Tile icon="time-outline" value={anyItem.restSec ? `${anyItem.restSec}s` : '—'} label="Rest" />
              </View>
            )}
            {(last || best) && (
              <Card>
                <Text style={{ fontWeight: '900', color: k.c.ink, marginBottom: 6 }}>Your history</Text>
                {last && <Text style={{ color: k.c.muted, lineHeight: 20 }}>Last time ({last.date}): {last.sets.map((s) => (s.kg > 0 ? `${s.reps} × ${weightValue(s.kg, unit)} ${unit}` : `${s.reps}`)).join(' · ')}</Text>}
                {best && best.kg > 0 && <Text style={{ color: k.c.muted, marginTop: 4 }}>Best set: {best.reps} × {weightValue(best.kg, unit)} {unit} (about {weightValue(best.e1rm, unit)} {unit} for one rep)</Text>}
              </Card>
            )}
          </View>
        )}

        {tab === 'muscles' && (
          <Card>
            <Text style={{ fontWeight: '900', color: k.c.ink, fontSize: 17, marginBottom: 10 }}>Works</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {ex.muscles.map((m, i) => <Pill key={m} text={m} tone={i === 0 ? 'accent' : 'plain'} />)}
            </View>
            <Text style={{ color: k.c.muted, marginTop: 12, lineHeight: 20 }}>The first one is the main muscle. The others help. Equipment: {ex.gear}.</Text>
          </Card>
        )}

        {tab === 'alts' && (
          <View>
            <Text style={{ color: k.c.muted, marginBottom: 10, lineHeight: 19 }}>{item ? 'Same muscles, same sets and reps. Pick one that suits your space and comfort.' : 'Similar exercises for the same muscles.'}</Text>
            {altIds.map((a) => {
              const e = EXERCISES[a];
              if (!e) return null;
              return <ExerciseRow key={a} ex={e} line={`${e.gear} · ${e.muscles[0]}`} onPress={() => router.replace({ pathname: '/workout-exercise', params: { id: a, ...(dayN ? { dayN } : {}) } })} />;
            })}
          </View>
        )}
      </ScrollView>

      {day && item && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 24, backgroundColor: k.c.bg, borderTopWidth: 1, borderTopColor: k.c.border }}>
          {isCurrent ? <Pill text={`In your Day ${day.n} plan`} tone="good" icon="checkmark-circle" />
            : <Btn label={`Use this on Day ${day.n}`} icon="swap-horizontal" onPress={() => { setSwap(day.n, item.ex, ex.id); router.back(); }} />}
        </View>
      )}
    </SafeAreaView>
  );
}
