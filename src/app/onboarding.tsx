import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button, useThemedStyles } from '../components/UI';
import { Chip } from '../components/Chip';
import { useNotifications } from '../components/Notifications';
import { updateProfile, useProfile } from '../hooks/useProfile';
import { post, today } from '../config/api';
import { queueTour } from '../tour/tourStore';
import { resolveTargets } from '../utils/energy';
import { applyReminders, DEFAULT_PREFS, isValidTime, notificationsAvailable, savePrefs } from '../utils/notifications';

type Preset = { key: string; label: string; calorieTarget: number; proteinTarget: number; exerciseMinutesTarget: number };
const PRESETS: Preset[] = [
  { key: 'lose', label: 'Lose weight', calorieTarget: 1700, proteinTarget: 130, exerciseMinutesTarget: 35 },
  { key: 'maintain', label: 'Maintain', calorieTarget: 2000, proteinTarget: 110, exerciseMinutesTarget: 30 },
  { key: 'build', label: 'Build muscle', calorieTarget: 2400, proteinTarget: 160, exerciseMinutesTarget: 45 },
];

export default function Onboarding() {
  const { S, colors } = useThemedStyles();
  const { error, success } = useNotifications();
  const { profile } = useProfile();
  // Name comes from sign-up / the Google account, but it is shown as an editable field so people can confirm or change it.
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  useEffect(() => { if (!nameTouched && profile?.name) setName(profile.name); }, [profile?.name, nameTouched]);
  const [preset, setPreset] = useState<Preset>(PRESETS[1]);
  const [calorieTarget, setCalorieTarget] = useState(String(PRESETS[1].calorieTarget));
  const [proteinTarget, setProteinTarget] = useState(String(PRESETS[1].proteinTarget));
  const [exerciseMinutesTarget, setExerciseMinutesTarget] = useState(String(PRESETS[1].exerciseMinutesTarget));
  const [waterTargetMl, setWaterTargetMl] = useState('3000');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');
  const [wantsReminders, setWantsReminders] = useState(true);
  const [taskTime, setTaskTime] = useState('09:00');
  const [waterEnabled, setWaterEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  // About you -> personalised plan
  const [sex, setSex] = useState<'male' | 'female' | 'other'>('male');
  const [age, setAge] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [targetKg, setTargetKg] = useState('');
  const [activity, setActivity] = useState('moderate');
  const [pace, setPace] = useState(0.5);

  const plan = useMemo(() => {
    const T = resolveTargets({ age: +age, sex, heightCm: +heightCm, currentWeightKg: +weightKg, activityLevel: activity, goals: { targetWeightKg: +targetKg || null, weeklyPaceKg: pace } });
    if (!T || !T.energy) return null;
    return { e: T.energy, macros: T.macros, water: T.waterMl, weeks: T.weeksToGoal };
  }, [age, sex, heightCm, weightKg, targetKg, activity, pace]);

  useEffect(() => {
    if (!plan) return;
    setCalorieTarget(String(plan.e.calorieTarget));
    setProteinTarget(String(plan.macros.protein));
    setWaterTargetMl(String(plan.water));
  }, [plan]);

  const choosePreset = (p: Preset) => {
    setPreset(p);
    // With a worked-out plan the body decides calories and protein; a generic preset must not overwrite them (that made Home and My Plan disagree).
    if (!plan) { setCalorieTarget(String(p.calorieTarget)); setProteinTarget(String(p.proteinTarget)); }
    setExerciseMinutesTarget(String(p.exerciseMinutesTarget));
  };

  const finish = async (skip = false) => {
    setSaving(true);
    try {
      const body = plan && !skip;
      if (body) {
        try { await post('/api/weight', { date: today(), weightKg: +weightKg }); } catch { /* the profile weight below still applies */ }
      }
      await updateProfile({
        onboarded: true,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(body ? { age: +age, sex, heightCm: +heightCm, currentWeightKg: +weightKg, activityLevel: activity } : {}),
        units: { weight: weightUnit, energy: 'kcal', volume: 'ml' },
        goals: {
          calorieTarget: skip ? 1800 : Number(calorieTarget) || 1800,
          calorieMode: !skip && body && plan && Number(calorieTarget) !== plan.e.autoTarget ? 'manual' : 'auto',
          // Automatic (null) unless the person typed a different number than the one worked out for their body and goal.
          proteinTarget: skip || !plan || Number(proteinTarget) === plan.macros.protein || !Number(proteinTarget) ? null : Number(proteinTarget),
          waterTargetMl: skip ? 3000 : Number(waterTargetMl) || 3000,
          exerciseMinutesTarget: skip ? 30 : Number(exerciseMinutesTarget) || 30,
          stepsTarget: 10000,
          ...(body ? { targetWeightKg: +targetKg || null, weeklyPaceKg: pace } : {}),
        },
      });

      if (!skip && wantsReminders && notificationsAvailable && (isValidTime(taskTime) || waterEnabled)) {
        const prefs = {
          ...DEFAULT_PREFS,
          tasksEnabled: isValidTime(taskTime),
          tasksTime: taskTime,
          waterEnabled,
          waterStart: '08:00',
          waterEnd: '20:00',
          waterIntervalHours: 2,
        };
        await savePrefs(prefs);
        try { await applyReminders(prefs); } catch { /* permission may be declined — that's fine, they can enable later */ }
      }

      success('You\u2019re all set', 'Your goals are ready — welcome to FlexFit!');
      await queueTour();                // a short guided tour opens on Home (can be ended, and retaken from Profile)
      router.replace('/(tabs)');
    } catch (e: any) {
      error('Could not save your goals', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={S.safe}>
      <ScrollView contentContainerStyle={S.page}>
        <Text style={S.title}>Welcome to FlexFit 👋</Text>
        <Text style={S.sub}>A couple of quick questions so your dashboard starts with sensible targets. You can change any of this later in Profile.</Text>

        <View style={S.card}>
          <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: 10 }}>About you</Text>
          <View style={{ marginBottom: 10 }}>
            <Text style={S.label}>Name</Text>
            <TextInput value={name} onChangeText={(v) => { setNameTouched(true); setName(v); }} maxLength={100} autoCapitalize="words" style={S.input} />
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 6 }}>
            {(['male', 'female', 'other'] as const).map((x) => <Chip key={x} label={x[0].toUpperCase() + x.slice(1)} active={sex === x} onPress={() => setSex(x)} />)}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Row label="Age" value={age} onChangeText={setAge} S={S} /></View>
            <View style={{ flex: 1 }}><Row label="Height (cm)" value={heightCm} onChangeText={setHeightCm} S={S} /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Row label="Weight (kg)" value={weightKg} onChangeText={setWeightKg} S={S} /></View>
            <View style={{ flex: 1 }}><Row label="Goal weight (kg)" value={targetKg} onChangeText={setTargetKg} S={S} /></View>
          </View>
          <Text style={S.label}>Activity level</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {[['sedentary', 'Mostly sitting'], ['light', 'Light'], ['moderate', 'Moderate'], ['very_active', 'Very active']].map(([k, l]) => <Chip key={k} small label={l} active={activity === k} onPress={() => setActivity(k)} />)}
          </View>
          {!!(+targetKg && +weightKg && Math.abs(+targetKg - +weightKg) >= 0.4) && (
            <>
              <Text style={[S.label, { marginTop: 8 }]}>How fast? (kg per week)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {[0.25, 0.5, 0.75].map((v) => <Chip key={v} small label={`${v} kg${v === 0.5 ? ' · recommended' : ''}`} active={pace === v} onPress={() => setPace(v)} />)}
              </View>
            </>
          )}
        </View>

        {plan ? (
          <View style={[S.card, { backgroundColor: colors.primarySoft }]}>
            <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16 }}>Your plan</Text>
            <Text style={{ color: colors.ink, marginTop: 8, fontSize: 22, fontWeight: '800' }}>{plan.e.calorieTarget.toLocaleString()} kcal / day</Text>
            <Text style={S.muted}>Maintenance is about {plan.e.tdee.toLocaleString()} kcal{plan.e.direction === 'lose' ? ` — a ${Math.round(plan.e.tdee - plan.e.calorieTarget)} kcal daily deficit` : plan.e.direction === 'gain' ? ` — a ${Math.round(plan.e.calorieTarget - plan.e.tdee)} kcal daily surplus` : ''}</Text>
            <Text style={{ color: colors.ink, marginTop: 8 }}>Protein {plan.macros.protein} g · Carbs {plan.macros.carbs} g · Fat {plan.macros.fat} g</Text>
            <Text style={{ color: colors.ink, marginTop: 4 }}>Water {(plan.water / 1000).toFixed(2)} L · Steps 10,000</Text>
            {plan.weeks ? <Text style={{ color: colors.primary, fontWeight: '800', marginTop: 8 }}>Reach {targetKg} kg in about {plan.weeks} weeks (~{Math.round(plan.weeks / 4.345)} months)</Text> : null}
            {plan.e.atFloor && <Text style={{ color: colors.danger, marginTop: 6, fontSize: 12 }}>That pace would go below a safe minimum, so your calories are held at {plan.e.calorieTarget}. Choose a slower pace for a bigger buffer.</Text>}
            <Text style={[S.muted, { marginTop: 8 }]}>An estimate to start from, not medical advice. It updates as your weight changes.</Text>
          </View>
        ) : <Text style={[S.muted, { marginBottom: 14 }]}>Fill in age, height and weight to get a personalised plan — or pick a quick preset below.</Text>}

        {!plan && <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 10 }}>What's your goal?</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14, display: plan ? 'none' : 'flex' }}>
          {PRESETS.map((p) => <Chip key={p.key} label={p.label} active={preset.key === p.key} onPress={() => choosePreset(p)} />)}
        </View>

        <View style={S.card}>
          <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: 10 }}>Daily targets</Text>
          <Row label="Calories" value={calorieTarget} onChangeText={setCalorieTarget} S={S} />
          <Row label="Protein (g)" value={proteinTarget} onChangeText={setProteinTarget} S={S} />
          <Row label="Water (ml)" value={waterTargetMl} onChangeText={setWaterTargetMl} S={S} />
          <Row label="Exercise (min)" value={exerciseMinutesTarget} onChangeText={setExerciseMinutesTarget} S={S} />
        </View>

        <View style={S.card}>
          <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: 10 }}>Weight unit</Text>
          <View style={{ flexDirection: 'row' }}>
            <Chip label="Kilograms (kg)" active={weightUnit === 'kg'} onPress={() => setWeightUnit('kg')} />
            <Chip label="Pounds (lb)" active={weightUnit === 'lb'} onPress={() => setWeightUnit('lb')} />
          </View>
        </View>

        <View style={S.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: wantsReminders ? 12 : 0 }}>
            <Text style={{ fontWeight: '800', color: colors.ink }}>Set up reminders now?</Text>
            <TouchableOpacity onPress={() => setWantsReminders((v) => !v)} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, backgroundColor: wantsReminders ? colors.primary : colors.chipBg }}>
              <Text style={{ color: wantsReminders ? '#fff' : colors.ink, fontWeight: '700', fontSize: 12 }}>{wantsReminders ? 'Yes' : 'No'}</Text>
            </TouchableOpacity>
          </View>
          {wantsReminders && (
            <>
              <Text style={S.label}>Daily task check-in time</Text>
              <TextInput value={taskTime} onChangeText={setTaskTime} placeholder="09:00" placeholderTextColor={colors.muted} style={S.input} maxLength={5} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Hydration reminders (every 2h, 8am–8pm)</Text>
                <TouchableOpacity onPress={() => setWaterEnabled((v) => !v)} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, backgroundColor: waterEnabled ? colors.primary : colors.chipBg }}>
                  <Text style={{ color: waterEnabled ? '#fff' : colors.ink, fontWeight: '700', fontSize: 12 }}>{waterEnabled ? 'On' : 'Off'}</Text>
                </TouchableOpacity>
              </View>
              {!notificationsAvailable && <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>Reminders need a development build to fire — you can still set this up now.</Text>}
            </>
          )}
        </View>

        <Button title={saving ? 'Saving…' : 'Get started'} onPress={() => finish(false)} disabled={saving} />
        <TouchableOpacity onPress={() => finish(true)} disabled={saving} style={{ paddingVertical: 14, alignItems: 'center' }}>
          <Text style={{ color: colors.muted, fontWeight: '700' }}>Skip for now, use defaults</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, onChangeText, S }: { label: string; value: string; onChangeText: (v: string) => void; S: any }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={S.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} keyboardType="numeric" style={S.input} />
    </View>
  );
}
