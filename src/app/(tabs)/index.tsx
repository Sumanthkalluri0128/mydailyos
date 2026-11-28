import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { TabFade } from '../../motion/Reveal';
import { today, get } from '../../config/api';
import { write, newClientId, useOffline, read, peek, readMeta, peekAt } from '../../utils/offline';
import { useWaterBoost } from '../../utils/weatherStore';
import { InstantOpenStrip } from '../../components/InstantOpenStrip';
import { successHaptic } from '../../utils/haptics';
import { HomeSkeleton } from '../../components/Skeleton';
import { useNotifications } from '../../components/Notifications';
import { useTheme } from '../../utils/theme';
import { dayBalance, resolveTargets, stepCalories } from '../../utils/energy';
import { useProfile, refreshProfile } from '../../hooks/useProfile';
import { fmtVolume } from '../../utils/units';
import { useGymSynced } from '../../utils/gymSyncRunner';
import { useSteps, refreshSteps } from '../../hooks/useSteps';
import { ensureNotificationSetup, refreshWaterNudges } from '../../utils/notifications';
import { StreakChip } from '../../components/DailyExtras';
import { coachLine } from '../../utils/coach';
import { HomeGoal } from '../../components/simple/SimpleProgress';
import { HabitsToday } from '../../components/HabitsToday';
import { DailyCheckin } from '../../components/DailyCheckin';
import { checkinItems, shouldShow, DISMISS_KEY } from '../../utils/dailyCheckin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OverDayCard } from '../../components/OverDayCard';
import { DayGuideCard } from '../../components/DayGuideCard';
import { CoachNextActionCard } from '../../components/CoachHub';
import { MicroToggle } from '../../components/MicroCard';
import { SafeIntakeCard } from '../../components/SafeIntakeCard';
import { BottomSheet } from '../../components/BottomSheet';
import { FixMyDay } from '../../components/FixMyDay';
import { HealthyDay } from '../../components/HealthyDay';
import { EatenSheet } from '../../components/home/EatenSheet';
import { HeroCard } from '../../components/home/HeroCard';
import { FirstWeekChecklist } from '../../tour/TourHost';
import { tourRef, useTourScroll } from '../../tour/anchors';
import { WeightReveal } from '../../components/WeightReveal';
import { ArcGauge, Bar, CalorieRing, Card, IconBadge, Peek, Spark, useCast } from '../../components/home/HomeParts';
import { StatCard, StatBar } from '../../components/home/StatCard';
import { getCtx, onCtx, refreshCtx } from '../../utils/journeyCtx';
import { CardBoundary } from '../../components/CardBoundary';
import { CheckIn, RoughDay, SideQuest, useCoachState, PlateCard, EventMode, CravingTimer } from '../../components/CoachCards';
import { useCoachTone } from '../../utils/coachTone';
import { useNextStep, ROUTE } from '../../utils/nextStep';
import { isVisible, useFeatures, loadFeatures } from '../../utils/features';
import { useT } from '../../i18n';
import { syncWidget } from '../../widgets/widgetSync';

const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Good night'; };
const TINT = { b: '#4AA8FF', o: '#FF9B3D', p: '#FF5FA2', v: '#8A63FF', g: '#2FBF84' };
const n0 = (v: any) => Math.round(Number(v) || 0);

export default function Home() {
  const tscroll = useTourScroll();
  const { error, success, toast } = useNotifications();
  const { colors: c } = useTheme();
  const { syncVersion } = useOffline();
  const { units, goals, profile: cachedProfile } = useProfile();
  const { width: winW } = useWindowDimensions();
  const cast = useCast();
  const s = makeStyles(c);
  const [d, setD] = useState<any>({ food: {}, act: {}, water: {}, profile: {} });
  const [weights, setWeights] = useState<number[]>([]);
  const [weighedToday, setWeighedToday] = useState(true);   // true until the weigh-ins load, so the check-in never flashes up wrongly
  const [checkinDismissed, setCheckinDismissed] = useState<string | null>('loading');
  useEffect(() => { AsyncStorage.getItem(DISMISS_KEY).then((v) => setCheckinDismissed(v || '')).catch(() => setCheckinDismissed('')); }, []);
  const stepper = useSteps();
  const [streak, setStreak] = useState<{ current: number; loggedToday: boolean } | null>(null);
  const [load, setLoad] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null); // time of the saved copy on screen while it is being refreshed
  const [sheet, setSheet] = useState<null | 'water' | 'steps'>(null);
  const [panel, setPanel] = useState<null | 'fix' | 'healthy' | 'eaten'>(null);   // Fix my day / Healthy day / today's meals sheets
  // the companion (or the coach) can ask Home to open one of them
  const params = useLocalSearchParams<{ open?: string }>();
  useEffect(() => { if (params.open === 'fix' || params.open === 'healthy') { setPanel(params.open); router.setParams({ open: undefined } as any); } }, [params.open]);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [jc, setJc] = useState<any>(getCtx());
  const cs = useCoachState();
  // Quiet Home: optional cards appear after you have used the app enough (server rule: lib/features.js). Until the server answers, show everything as before.
  const showCard = (id: string) => !cs.state || !Array.isArray(cs.state.homeCards) || cs.state.homeCards.includes(id);
  const tone = useCoachTone();

  const applyDay = useCallback((daily: any, profile: any) => {
    setD({
      food: daily.summary || {},
      act: { caloriesBurned: daily.summary?.caloriesBurned || 0, totalMinutes: daily.summary?.exerciseMinutes || 0 },
      water: { totalMl: daily.summary?.waterMl || 0 }, profile: profile.profile || {}, eventExtra: Number(daily.eventExtra) || 0,
    });
  }, []);

  const fetchAll = useCallback(async () => {
    refreshProfile(); refreshSteps().catch(() => {}); refreshCtx(true);
    const dayPath = `/api/progress/day?date=${today()}`;
    const [cd, cp] = await Promise.all([peek<any>(dayPath), peek<any>('/api/profile')]);
    if (cd && cp) { applyDay(cd, cp); setLoad(false); setCachedAt(await peekAt(dayPath)); }
    get<any>('/api/weight').then((w) => { setWeighedToday((w?.logs || []).some((x: any) => String(x.date).slice(0, 10) === today())); return w; }).then((w) => setWeights((w?.logs || []).slice().sort((a: any, b: any) => String(a.date).localeCompare(String(b.date))).slice(-14).map((x: any) => Number(x.weightKg)).filter(Number.isFinite))).catch(() => {});
    try {
      const [dr, pr] = await Promise.all([readMeta<any>(dayPath), readMeta<any>('/api/profile')]);
      const daily = dr.data, profile = pr.data;
      applyDay(daily, profile);
      setCachedAt(dr.stale || pr.stale ? await peekAt(dayPath) : null);
      if (profile.profile && profile.profile.onboarded === false) router.replace('/onboarding');
    } catch (e: any) {
      if (!(cd && cp)) error('Unable to load dashboard', e?.message || 'Please try again.');
    } finally { setLoad(false); setRefresh(false); }
  }, [applyDay]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));
  useGymSynced(fetchAll); // a gym exercise just reached the server: Home's calories burned and exercise minutes update
  useEffect(() => { if (syncVersion > 0) fetchAll(); }, [syncVersion]);
  useEffect(() => onCtx(setJc), []);
  useEffect(() => { loadFeatures().then((say) => { if (say) toast('info', 'Sensei', say); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { ensureNotificationSetup(); }, []);

  const f = d.food || {}, p = d.profile || {}, w = d.water || {}, g = goals || p.goals || {};
  const prof: any = cachedProfile || p;
  const T = resolveTargets((prof ?? {}) as any)!; // ONE place that turns the chosen body goal into every target
  const waterTarget = useWaterBoost(T?.waterMl ?? 3000).goalMl;
  const steps = stepper.steps, stepsTarget = T?.steps ?? 10000, exerciseTarget = T?.exerciseMinutes ?? 30;
  const workoutKcal = f.workoutCalories ?? Math.max(0, (d.act.caloriesBurned || 0) - (f.stepCalories || 0));
  const bal = dayBalance(prof, { eaten: f.calories || 0, workout: workoutKcal, steps: stepCalories(steps, prof?.currentWeightKg), extra: d.eventExtra || 0 });
  const over = bal.budget > 0 && bal.remaining < 0;
  const e = T?.energy ?? null;
  const mt = T!.macros;
  const lim = T!.limits;
  const hour = new Date().getHours();
  const unitE = units.energy === 'kJ' ? 'kJ' : 'kcal';
  const k = (kcal: number) => (units.energy === 'kJ' ? Math.round(kcal * 4.184) : n0(kcal)).toLocaleString();
  const coach = coachLine({
    hour, eatenKcal: bal.eaten, budgetKcal: bal.budget,
    meals: { breakfast: (f.meals?.breakfast || 0) > 0, lunch: (f.meals?.lunch || 0) > 0, dinner: (f.meals?.dinner || 0) > 0 },
    waterMl: w.totalMl || 0, waterTarget, steps, stepsTarget, exerciseMin: d.act.totalMinutes || 0, exerciseTarget, streak,
  });
  useFeatures();
  const { t } = useT();
  const step = useNextStep({ hour, meals: f.meals || {}, waterMl: w.totalMl || 0, waterTargetMl: waterTarget || 0, steps, stepsTarget, budget: bal.budget || 0, eaten: bal.eaten || 0 }, `${f.calories}|${w.totalMl}|${steps}`);
  const adaptive = step && step.id !== 'steady' ? step : null;
  const nextMeal = hour < 10 ? 'breakfast' : hour < 15 ? 'lunch' : hour < 18 ? 'snacks' : 'dinner';
  const tw = g.targetWeightKg, cw = prof?.currentWeightKg;
  const wShow = (kg: number) => (units.weight === 'lb' ? kg / 0.45359237 : kg).toFixed(1);
  const lv = jc?.level, q = jc?.today;
  const cardW = Math.min(winW, 640) - 40;
  const half = (cardW - 12) / 2;

  const addWater = async (ml: number) => {
    if (busy || !(ml > 0)) return; setBusy(true);
    try {
      await write('POST', '/api/water', { date: today(), amountMl: ml, clientId: newClientId('w') }, `Water ${ml} ml`);
      refreshWaterNudges({ lastLogAt: new Date() }); successHaptic();
      success('Water added', `+${fmtVolume(ml, units.volume)}`); setSheet(null); setCustom(''); await fetchAll();
    } catch (er: any) { error('Could not add water', er?.message || 'Please try again.'); } finally { setBusy(false); }
  };
  const addSteps = async (n: number) => {
    if (busy || !(n > 0)) return; setBusy(true);
    try { await stepper.setManual(Math.round(steps + n)); successHaptic(); success('Steps added', `+${Math.round(n).toLocaleString()}`); setSheet(null); setCustom(''); }
    catch (er: any) { error('Could not add steps', er?.message || 'Please try again.'); } finally { setBusy(false); }
  };
  const openLog = (meal: string) => router.push({ pathname: '/food', params: { meal } } as any);

  // keep the home-screen widget in step with what this screen shows (calories left + water), without waiting for Android's refresh
  useEffect(() => {
    if (load) return;
    syncWidget({
      calorieTarget: bal.budget > 0 ? bal.budget : null, eaten: bal.eaten, burned: 0,
      waterMl: w.totalMl || 0, waterTargetMl: waterTarget || null,
      gentle: tone.gentle, hideNumbers: !!(prof as any)?.safety?.hideNumbers, kj: units.energy === 'kJ', oz: units.volume === 'oz',
      protein: Number(f.protein) || 0, proteinTarget: mt.protein, steps, stepsTarget, streak: streak ? streak.current : null,
    });
  }, [load, bal.budget, bal.eaten, w.totalMl, waterTarget, tone.gentle, units.energy, units.volume, prof, f.protein, mt.protein, steps, stepsTarget, streak?.current]); // eslint-disable-line react-hooks/exhaustive-deps

  if (load) return <SafeAreaView style={s.safe}><HomeSkeleton /></SafeAreaView>;

  const waterOpts = units.volume === 'oz' ? [8, 12, 16, 24, 32, 48].map((o) => ({ label: `${o} oz`, ml: Math.round(o * 29.5735) })) : [150, 250, 330, 500, 750, 1000].map((ml) => ({ label: ml >= 1000 ? `${ml / 1000} L` : `${ml} ml`, ml }));

  return <SafeAreaView style={s.safe}><TabFade>
    <ScrollView ref={tscroll.ref} onScroll={tscroll.onScroll} scrollEventThrottle={32} contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); fetchAll(); }} />}>
      <InstantOpenStrip at={cachedAt} refreshing={load || refresh} />
      <View style={{ alignSelf: 'center', width: cardW }}>
        <View style={s.topRow}>
          <Text style={s.brand}>FlexFit</Text>
          <StreakChip refreshKey={f.calories} onLoaded={setStreak} />
        </View>

        <CardBoundary name="HeroCard">
        <HeroCard width={cardW} dateText={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()} greeting={greeting()} name={(p?.name || 'there').split(' ')[0]}
          coach={adaptive ? { scene: adaptive.scene as any, title: hour < 12 ? t('home.morningTitle') : t('home.nextTitle'), text: t(`next.${adaptive.id}.text`), action: adaptive.cta ? { label: t(`next.${adaptive.id}.cta`), onPress: () => (adaptive.id === 'fix' ? setPanel('fix') : router.push((ROUTE[adaptive.cta!.page || ''] || '/food') as any)) } : undefined } : { scene: over ? 'sad' : 'wave', title: hour < 12 ? t('home.morningTitle') : t('home.nextTitle'), text: coach.text, action: over ? { label: 'Fix my day', onPress: () => setPanel('fix') } : !(f.meals?.[nextMeal] > 0) && bal.remaining > 80 ? { label: `Log ${nextMeal}`, onPress: () => openLog(nextMeal) } : undefined }} />
        </CardBoundary>
        <CardBoundary name="FirstWeekChecklist"><FirstWeekChecklist /></CardBoundary>
        {/* ---- quick help: one wrapped row of chips (a card opens full width when one is used) ---- */}
        {showCard('checkin') && <CardBoundary name="CheckIn"><CheckIn state={cs.state} reload={cs.reload} /></CardBoundary>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 5 }} accessibilityLabel="Quick help">
          <CardBoundary name="RoughDay"><RoughDay compact state={cs.state} reload={cs.reload} /></CardBoundary>
          {showCard('eventmode') && <CardBoundary name="EventMode"><EventMode compact event={cs.state?.event} reload={cs.reload} /></CardBoundary>}
          <CardBoundary name="CravingTimer"><CravingTimer compact onLogged={fetchAll} /></CardBoundary>
        </View>
        {tone.gentle && <CardBoundary name="PlateCard"><PlateCard refreshKey={f.calories} /></CardBoundary>}

        {/* ---- stat cards: every number once ---- */}
        {!tone.gentle && <Card onPress={() => router.push('/food' as any)} label={`Calories: ${k(Math.abs(bal.remaining))} ${unitE} ${over ? 'over' : 'left'}. Open food log`} tint={TINT.o} style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <CalorieRing size={128} pct={bal.budget ? bal.eaten / bal.budget : 0} over={over}>
            <Text style={{ fontSize: 24 }}>🔥</Text>
            <Text style={[s.big, { fontSize: 24 }]}>{bal.budget ? k(Math.abs(bal.remaining)) : '—'}</Text>
            <Text style={s.small}>{!bal.budget ? 'Add body details' : over ? `${unitE} over` : `${unitE} left`}</Text>
          </CalorieRing>
          <View style={{ flex: 1, gap: 10 }}>
            {[['🍴', TINT.g, 'Eaten', bal.eaten], ['🎯', TINT.b, 'Budget', bal.budget], ['⚡', TINT.o, 'Activity', bal.burned]].map(([em, tn, lb, val]: any) => (
              <TouchableOpacity key={lb} disabled={lb !== 'Eaten'} accessibilityRole={lb === 'Eaten' ? 'button' : undefined} accessibilityLabel={lb === 'Eaten' ? `Eaten: ${k(val)} ${unitE}. See and edit today's meals` : undefined}
                onPress={() => setPanel('eaten')} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <IconBadge emoji={em} tint={tn} size={32} />
                <View><Text style={s.small}>{lb}</Text><Text style={s.val}>{bal.budget || lb !== 'Budget' ? k(val) : '—'} {unitE}</Text></View>
              </TouchableOpacity>
            ))}
          </View>
        </Card>}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/food' as any)} style={s.pill}><Text style={s.pillT}>＋ Log food</Text></TouchableOpacity>
          {over && <TouchableOpacity accessibilityRole="button" onPress={() => setPanel('fix')} style={[s.pill, { backgroundColor: '#e5484d22', borderWidth: 1, borderColor: '#e5484d66' }]}><Text style={[s.pillT, { color: '#d13a40' }]}>Fix my day</Text></TouchableOpacity>}
          <TouchableOpacity accessibilityRole="button" onPress={() => setPanel('healthy')} style={[s.pill, { backgroundColor: c.primarySoft }]}><Text style={[s.pillT, { color: c.primary }]}>🥗 Healthy day</Text></TouchableOpacity>
        </View>

        <View style={s.grid}>
          <StatCard width={half} icon="💧" tint={TINT.b} label="Water. Open water log" onPress={() => router.push('/water' as any)} sticker={cast(1, 'drink')}
            plus={{ label: 'Add water', onPress: () => { setCustom(''); setSheet('water'); }, tourRef: tourRef('add-water'), testID: 'tour-add-water' }}>
            <Text style={s.big}>{fmtVolume(w.totalMl || 0, units.volume)}</Text><Text style={s.small}>of {fmtVolume(waterTarget, units.volume)}</Text>
            <StatBar pct={(w.totalMl || 0) / (waterTarget || 1)} color={TINT.b} />
          </StatCard>
          <StatCard width={half} icon="👟" tint={TINT.o} label="Steps. Open health" onPress={() => router.push('/health' as any)} sticker={cast(2, 'walk')}
            plus={{ label: 'Add steps', onPress: () => { setCustom(''); setSheet('steps'); } }}>
            <Text style={s.big}>{steps.toLocaleString()}</Text><Text style={s.small}>{steps > 0 ? `steps · goal ${stepsTarget.toLocaleString()}` : 'Nothing yet. A short walk counts'}</Text>
            <StatBar pct={steps / stepsTarget} color={TINT.o} />
          </StatCard>
          <StatCard width={half} icon="🏋️" tint={TINT.p} label="Exercise. Open workouts" onPress={() => router.push('/exercise' as any)} sticker={cast(3, 'lift')}>
            <Text style={s.big}>{d.act.totalMinutes || 0} min</Text><Text style={s.small}>{(d.act.totalMinutes || 0) > 0 ? `exercise · goal ${exerciseTarget} min` : 'Nothing yet. A 10 minute walk counts'}</Text>
            <StatBar pct={(d.act.totalMinutes || 0) / exerciseTarget} color={TINT.p} />
          </StatCard>
          <StatCard width={half} icon="⚖️" tint={TINT.v} label="Weight. Open weight trend" onPress={() => router.push('/weight' as any)} sticker={cast(4, 'scale')}>
            {cw != null ? <WeightReveal text={`${wShow(cw)} ${units.weight}`} style={s.big} from={weights.length > 1 ? Number(wShow(weights[weights.length - 2])) : undefined} /> : <Text style={s.big}>--</Text>}
            {tw && prof?.progress ? <WeightReveal compact text={`${wShow(prof.progress.remainingKg)} ${units.weight} to go · target ${wShow(tw)}`} style={s.small} /> : <Text style={s.small}>Set a target in Profile</Text>}
            <View style={{ height: 6 }} /><Spark points={weights} width={half - 32} color={TINT.v} />
          </StatCard>
        </View>

        {!tone.gentle && <CoachNextActionCard />}
        {!tone.gentle && <DayGuideCard />}
        {!tone.gentle && <OverDayCard />}
        <SafeIntakeCard eaten={f.calories || 0} budget={bal.budget} target={bal.target} sex={prof?.sex} losing={e?.direction === 'lose'} />

        {/* ---- this week: side quest, then the weekly review ---- */}
        <SideQuest state={cs.state} setState={cs.setState} reload={cs.reload} />
        {isVisible('weekly') && <TouchableOpacity style={s.linkRow} onPress={() => router.push('/weekly' as any)} accessibilityRole="button">
          <Text style={{ fontSize: 22 }}>📊</Text><Text style={[s.val, { flex: 1, marginLeft: 12 }]}>Weekly summary</Text><Text style={{ color: c.muted, fontSize: 20 }}>›</Text>
        </TouchableOpacity>}

        {/* ---- body goal: asked once; the plan sets calories and macros ---- */}
        {!!e && !g.bodyType && e.direction !== 'gain' && (
          <Card onPress={() => router.push('/(tabs)/body' as any)} label="Choose your body goal and get a plan" style={{ marginBottom: 12 }}>
            <Text style={s.h2}>What body are you aiming for?</Text>
            <Text style={[s.small, { marginTop: 4 }]}>Pick lean, athletic, muscular or balanced. We set your calories, protein, carbs and fat from it and your measurements.</Text>
          </Card>
        )}

        {/* ---- macros ---- */}
        <Card style={{ marginBottom: 12 }}>
          <View style={s.head}><IconBadge emoji="📊" tint={TINT.v} size={44} /><Text style={[s.h2, { flex: 1 }]}>Macros Today</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/progress' as any)} style={[s.pill, { backgroundColor: c.primarySoft }]}><Text style={[s.pillT, { color: c.primary }]}>See Details</Text></TouchableOpacity></View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 }}>
            {[['Protein', '🥩', '#EF5B6B', f.protein, mt.protein], ['Carbs', '🌾', '#F2B233', f.carbohydrates, mt.carbs], ['Fat', '🥑', '#2FBF84', f.fat, mt.fat]].map(([lb, em, col, val, tg]: any) => (
              <View key={lb} style={{ alignItems: 'center' }} accessible accessibilityLabel={`${lb}: ${n0(val)} of ${n0(tg)} grams`}>
                <View style={{ width: 96, height: 96 }}>
                  <ArcGauge size={96} pct={tg ? (val || 0) / tg : 0} color={col} />
                  <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 15 }}>{em}</Text><Text style={[s.val, { fontSize: 16 }]}>{n0(val)}g</Text><Text style={s.small}>/{n0(tg)}g</Text>
                  </View>
                </View>
                <Text style={[s.val, { marginTop: -6 }]}>{lb}</Text>
              </View>
            ))}
          </View>
          <View style={{ gap: 12, marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }}>
            {[['🥬', 'Fibre', f.fiber || 0, mt.fiber, '#2FBF84', false, 'g'], ['🍬', 'Sugar', f.sugar || 0, lim.sugar, '#B57EDC', true, 'g'], ...(n0(f.sodium) > 0 ? [['🧂', 'Sodium', f.sodium, lim.sodiumMg, '#5AA9E6', true, 'mg']] : [])].map(([em, lb, val, tg, col, limit, u]: any) => (
              <View key={lb}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}><Text style={[s.val, { fontSize: 13.5 }]}>{em} {lb}{limit ? ' (keep under)' : ''}</Text><Text style={s.small}>{n0(val)} / {n0(tg)}{u}</Text></View>
                <Bar pct={tg ? val / tg : 0} color={limit && val > tg ? c.danger : col} h={7} />
              </View>
            ))}
          </View>
          <MicroToggle losing={e?.direction === 'lose'} />
        </Card>

        {/* ---- progress ---- */}
        <Card onPress={() => router.push('/goals' as any)} label="Your progress. Open goals" tint="#FFB347" style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12, paddingRight: 100 }}>
            <Text style={{ fontSize: 30 }}>👑</Text>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={s.h2}>Your Progress</Text>
              <Text style={s.val}>{lv ? `Level ${lv.level} · ${lv.rank}` : 'Level 1 · Rookie'}</Text>
              <Bar pct={Math.max(0.04, (lv?.pct ?? 0) / 100)} color="#FF8A3D" h={10} />
              <Text style={s.small}>{lv?.nextLine ? `${lv.nextLine} · ` : ''}{q?.total ? `${q.done}/${q.total} quests done today` : 'Set up your profile for daily quests'}</Text>
              {(q?.quests || []).slice(0, 3).map((x: any) => <Text key={x.id || x.title} style={[s.small, { fontWeight: '700' }, x.done && { color: c.successInk }]}>{x.done ? '✔' : '○'} {x.title}</Text>)}
            </View>
          </View>
          <Peek src={cast(12, 'levelup')} size={88} style={{ right: 6, bottom: 2 }} />
        </Card>

        {/* ---- daily check-in: only what is still missing today ---- */}
        {(() => {
          const items = checkinItems({ hour, weighedToday, proteinG: Number(f.protein) || 0, proteinTarget: mt.protein || 0, waterMl: w.totalMl || 0, waterTargetMl: waterTarget || 0 });
          return !load && checkinDismissed !== 'loading' && shouldShow(items, checkinDismissed, today())
            ? <DailyCheckin items={items} onSaved={fetchAll} onDismiss={() => setCheckinDismissed(today())} /> : null;
        })()}

        {/* ---- habits: tick them off right under your progress ---- */}
        <HabitsToday style={{ marginBottom: 12 }} />

        {/* ---- plan & insights ---- */}
        <View ref={tourRef('goal-card')} testID="tour-goal-card" collapsable={false}><HomeGoal onOpen={() => router.push('/goals' as any)} /></View>

        {isVisible('achievements') && <TouchableOpacity style={s.linkRow} onPress={() => router.push('/achievements' as any)} accessibilityRole="button">
          <Text style={{ fontSize: 22 }}>🏆</Text><Text style={[s.val, { flex: 1, marginLeft: 12 }]}>Badges & achievements</Text><Text style={{ color: c.muted, fontSize: 20 }}>›</Text>
        </TouchableOpacity>}
      </View>
    </ScrollView>
  </TabFade>

  <Modal visible={!!sheet} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
    <Pressable style={{ flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' }} onPress={() => setSheet(null)}>
      <Pressable onPress={() => {}} style={{ backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 34, gap: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={s.h2}>{sheet === 'water' ? 'Add water' : 'Add steps'}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={() => setSheet(null)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.chipBg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.ink }}>✕</Text></TouchableOpacity></View>
        {sheet === 'steps' && <Text style={s.small}>You have {steps.toLocaleString()} steps today. These are added on top.</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {(sheet === 'water' ? waterOpts.map((o) => ({ label: o.label, v: o.ml })) : [500, 1000, 2000, 3000, 5000, 8000].map((n) => ({ label: `+${n.toLocaleString()}`, v: n }))).map((o) => (
            <TouchableOpacity key={o.label} accessibilityRole="button" disabled={busy} onPress={() => (sheet === 'water' ? addWater(o.v) : addSteps(o.v))}
              style={{ width: '31%', minHeight: 60, borderRadius: 16, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <Text style={{ fontSize: 18 }}>{sheet === 'water' ? '💧' : '👟'}</Text><Text style={s.val}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput value={custom} onChangeText={setCustom} keyboardType="numeric" placeholder={sheet === 'water' ? 'Other amount (ml)' : 'Other amount (steps)'} placeholderTextColor={c.muted} style={[s.input, { flex: 1 }]} accessibilityLabel="Custom amount" />
          <TouchableOpacity accessibilityRole="button" disabled={busy || !(Number(custom) > 0)} onPress={() => (sheet === 'water' ? addWater(Number(custom)) : addSteps(Number(custom)))} style={[s.pill, { paddingHorizontal: 20, opacity: Number(custom) > 0 ? 1 : 0.45 }]}><Text style={s.pillT}>Add</Text></TouchableOpacity>
        </View>
      </Pressable>
    </Pressable>
  </Modal>

  <BottomSheet visible={panel === 'fix'} title="Fix my day" onClose={() => setPanel(null)}>
    <FixMyDay over={Math.max(0, -Math.round(bal.remaining))} hour={hour} onChanged={() => { refreshCtx(true); fetchAll(); }} onClose={() => setPanel(null)} />
  </BottomSheet>
  <BottomSheet visible={panel === 'eaten'} title="What you ate today" onClose={() => setPanel(null)}>
    <EatenSheet visible={panel === 'eaten'} onChanged={fetchAll} onClose={() => setPanel(null)} />
  </BottomSheet>
  <BottomSheet visible={panel === 'healthy'} title="Your healthy day" onClose={() => setPanel(null)}>
    <HealthyDay onClose={() => setPanel(null)} />
  </BottomSheet>
  </SafeAreaView>;
}

function makeStyles(c: any) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    page: { padding: 20, paddingBottom: 40 },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    brand: { fontSize: 22, fontWeight: '900', color: c.ink, letterSpacing: -0.5 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, marginBottom: 12 },
    big: { fontSize: 22, fontWeight: '900', color: c.ink, letterSpacing: -0.5 },
    val: { fontSize: 14.5, fontWeight: '800', color: c.ink },
    small: { fontSize: 12, fontWeight: '600', color: c.muted },
    h2: { fontSize: 17.5, fontWeight: '800', color: c.ink, letterSpacing: -0.3 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
    pill: { backgroundColor: c.primarySolid, borderRadius: 12, paddingHorizontal: 13, minHeight: 40, justifyContent: 'center' },
    pillT: { color: '#fff', fontWeight: '800', fontSize: 13 },
    meal: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56 },
    plus: { width: 32, height: 32, borderRadius: 10, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingVertical: 6 },
    input: { minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.chipBg, paddingHorizontal: 12, color: c.ink, fontSize: 14.5 },
    linkRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderWidth: c.cardBorderWidth, borderColor: c.cardBorder, borderRadius: 20, padding: 16, marginBottom: 12 },
  });
}

// A crash in this tab shows a friendly retry screen (and is reported to Sentry) instead of closing the app.
export { ScreenError as ErrorBoundary } from '../../components/ScreenError';
