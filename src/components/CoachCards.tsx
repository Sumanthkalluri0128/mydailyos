// Coaching part 1 cards: rough day ("rest arc"), side quest (7-day experiment), treat allowance, weight insights, coach learning reset.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemedStyles, Button } from './UI';
import { useT } from '../i18n';
import { Chip } from './Chip';
import Buddy from '../motion/Buddy';
import { useNotifications } from './Notifications';
import { del, get, post, put, today } from '../config/api';
import { read, write, newClientId } from '../utils/offline';
import { ROUGH_KEY, refreshReminders } from '../utils/notifications';
import { saveToneSettings, useCoachTone } from '../utils/coachTone';
import { DateTimeField } from './DateTimeField';
import { coneGeometry } from '../utils/coneGeometry';

const short = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function useCoachState() {
  const [s, setS] = useState<any>(null);
  const load = useCallback(async () => { try { setS(await read<any>(`/api/coach/state?today=${today()}`)); } catch { /* optional cards stay hidden offline */ } }, []);
  useEffect(() => { load(); }, [load]);
  return { state: s, setState: setS, reload: load };
}
export const coachLearn = (key: string, action: 'shown' | 'accepted') => { post('/api/coach/learn', { key, action }).catch(() => {}); };

/** One-tap sleep + energy check-in. Sleep hours from Health Connect count automatically, so then only energy is asked. */
export function CheckIn({ state, reload }: { state: any; reload: () => void }) {
  const { t } = useT();
  const { S, colors } = useThemedStyles();
  const { error } = useNotifications();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const c = state?.checkin;
  if (!c) return null;
  const send = async (body: any) => {
    setBusy(true);
    try { await post('/api/coach/checkin', { today: today(), ...body }); await reload(); }
    catch (e: any) { error('Could not save', e.network ? 'This needs a connection.' : e.message); } finally { setBusy(false); }
  };
  const haveSleep = c.sleepHours != null, haveEnergy = c.energy != null, done = haveSleep && haveEnergy;
  if (done && !open) {
    return (
      <View style={[S.row, { marginBottom: 10 }]} accessibilityLabel="Today's check-in">
        <Text style={[S.muted, { flex: 1 }]}><Text style={{ fontWeight: '800', color: colors.ink }}>{c.advice.headline}</Text> {c.advice.workout}</Text>
        <Chip small label={t('checkin.change')} a11y={t('checkin.change')} onPress={() => setOpen(true)} />
      </View>
    );
  }
  return (
    <View style={[S.card, { marginBottom: 12 }]} accessibilityLabel="Sleep and energy check-in">
      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted }}>{t('checkin.title').toUpperCase()}</Text>
      {haveSleep && c.sleepSource === 'device'
        ? <Text style={{ color: colors.ink, marginTop: 6 }}>Sleep: <Text style={{ fontWeight: '800' }}>{Number(c.sleepHours).toFixed(1)} h</Text> ({t('checkin.fromHC')})</Text>
        : (<>
          <Text style={{ color: colors.ink, marginTop: 6, fontWeight: '700' }}>{t('checkin.sleepQ')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>{c.choices.sleep.map((o: any) => <Chip key={o.id} label={t(`checkin.sleep.${o.id}`)} a11y={`${t('checkin.sleepQ')} ${t(`checkin.sleep.${o.id}`)}`} onPress={() => !busy && send({ sleep: o.id })} />)}</View>
        </>)}
      <Text style={{ color: colors.ink, marginTop: 10, fontWeight: '700' }}>{t('checkin.energyQ')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>{c.choices.energy.map((o: any) => <Chip key={o.id} label={t(`checkin.energy.${o.id}`)} a11y={`${t('checkin.energyQ')} ${t(`checkin.energy.${o.id}`)}`} active={c.energy === o.id} onPress={() => !busy && send({ energy: o.id })} />)}</View>
      {c.advice.level !== 'unknown' && (
        <View style={{ marginTop: 10 }}>
          <Text style={{ fontWeight: '800', color: colors.ink }}>{c.advice.headline}</Text>
          <Text style={S.muted}>{c.advice.workout}</Text>
          <Text style={[S.muted, { fontSize: 12.5 }]}>{c.advice.food}</Text>
        </View>
      )}
      {done && <Chip small label={t('checkin.done')} a11y={t('checkin.done')} onPress={() => setOpen(false)} />}
    </View>
  );
}

export function RoughDay({ state, reload, compact }: { state: any; reload: () => void; compact?: boolean }) {
  const { S, colors } = useThemedStyles();
  const { error } = useNotifications();
  const [busy, setBusy] = useState(false);
  if (!state?.rough) return null;
  const r = state.rough;
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      await post('/api/coach/rough', { on, today: today() });
      if (on) await AsyncStorage.setItem(ROUGH_KEY, today()); else await AsyncStorage.removeItem(ROUGH_KEY);
      refreshReminders(true).catch(() => {});
      await reload();
    } catch (e: any) { error('Could not switch that', e.network ? 'This needs a connection.' : e.message); } finally { setBusy(false); }
  };
  if (!r.on) return compact
    ? <Chip small label="🌧️ Rough day?" a11y="Rough day? Switch to a gentler day" onPress={() => !busy && toggle(true)} />
    : (
    <View style={[S.row, { marginBottom: 10 }]}><Text style={[S.muted, { flex: 1 }]}>Rough day?</Text><Chip small label="Switch to a gentler day" onPress={() => !busy && toggle(true)} /></View>
  );
  return (
    <View style={[S.card, { marginBottom: 12 }, compact && { width: '100%' }]} accessibilityRole="summary">
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Buddy scene={r.scene === 'cheer' ? 'cheer' : 'health'} size={64} talk={false} />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted }}>REST ARC</Text>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>Just three small things today</Text>
          <Text style={S.muted}>{r.message}</Text>
        </View>
      </View>
      {r.actions.map((a: any) => (
        <Text key={a.id} style={{ marginTop: 8, color: a.done ? colors.muted : colors.ink, textDecorationLine: a.done ? 'line-through' : 'none', fontWeight: '600' }}>{a.done ? '✓ ' : '○ '}{a.title}{a.hint && !a.done ? `  ·  ${a.hint}` : ''}</Text>
      ))}
      <Text style={[S.muted, { marginTop: 8 }]}>Your streak is safe and you get fewer reminders today. It switches off by itself tomorrow.</Text>
      <Chip small label="Back to a normal day" onPress={() => !busy && toggle(false)} />
    </View>
  );
}

export function SideQuest({ state, setState, reload }: { state: any; setState: (f: any) => void; reload: () => void }) {
  const { S, colors } = useThemedStyles();
  const { error, success } = useNotifications();
  const ex = state?.experiment;
  useEffect(() => {
    const last = ex?.last;
    if (last?.rewarded && !last.announced) { success('🏅 Side-quest sticker unlocked!', last.title); post('/api/coach/experiment/ack', {}).catch(() => {}); }
  }, [ex?.last?.startDate]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ex || (!ex.current && !ex.last)) return null;
  const { current: cur, last } = ex;
  const tick = async (date: string) => { try { const j = await post<any>('/api/coach/experiment/tick', { date, today: today() }); setState((s: any) => ({ ...s, experiment: { ...s.experiment, current: j.experiment.current } })); } catch (e: any) { error('Could not tick that', e.network ? 'This needs a connection.' : e.message); } };
  const skip = async () => { try { await post('/api/coach/experiment/skip', { today: today() }); await reload(); } catch (e: any) { error('Could not change the quest', e.message); } };
  return (
    <View style={[S.card, { marginBottom: 12 }]}>
      {last && <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}><Buddy scene={last.rewarded ? 'victory' : 'wave'} size={48} talk={false} /><Text style={[S.muted, { flex: 1, marginLeft: 8, color: colors.ink }]}>Last quest: {last.message}</Text></View>}
      {cur && (<>
        <Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted }}>SIDE QUEST · {cur.daysLeft} DAY{cur.daysLeft === 1 ? '' : 'S'} LEFT</Text>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>{cur.title}</Text>
        <Text style={S.muted}>{cur.quest} {cur.why}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
          {cur.days.map((d: any) => <Chip key={d.date} small active={d.done} label={`${short(d.date)}${d.done ? ' ✓' : ''}`} onPress={() => { if (!d.future && !d.auto) tick(d.date); }} />)}
        </View>
        <Text style={S.muted}>{cur.doneDays} of 7 days so far. Five days earns a sticker. Days with no data can be ticked by hand.</Text>
        <Chip small label="Try a different quest" onPress={skip} />
      </>)}
    </View>
  );
}

export function TreatCard({ treat, reload }: { treat: any; reload: () => void }) {
  const { S, colors } = useThemedStyles();
  const { error, success } = useNotifications();
  const [kcal, setKcal] = useState(''); const [name, setName] = useState(''); const [amt, setAmt] = useState(''); const [open, setOpen] = useState(false);
  if (!treat) return null;
  const set = async (v: number) => { try { await put('/api/coach/treat', { weeklyKcal: v, today: today() }); setKcal(''); reload(); } catch (e: any) { error('Could not save that', e.message); } };
  const use = async () => {
    try { await post('/api/coach/treat/use', { name: name.trim(), kcal: Number(amt), today: today(), clientId: newClientId('treat') }); setName(''); setAmt(''); setOpen(false); success('Enjoy it!', 'Logged as a treat.'); reload(); }
    catch (e: any) { error('Could not log that', e.network ? 'Treats need a connection.' : e.message); }
  };
  return (
    <View style={S.card}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>🍨 Weekly treat allowance</Text>
      {!treat.on ? (<>
        <Text style={[S.muted, { marginVertical: 6 }]}>Set aside some calories for sweets or eating out, planned and guilt-free. They come out of your weekly budget, so nothing is "extra".</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput accessibilityLabel="Weekly treat kcal" style={[S.input, { flex: 1, marginBottom: 0 }]} keyboardType="number-pad" value={kcal} onChangeText={setKcal} placeholder="kcal a week, e.g. 500" placeholderTextColor={colors.muted} />
          <Chip small label="Set aside" onPress={() => Number(kcal) > 0 && set(Number(kcal))} />
        </View>
      </>) : (<>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primary, marginTop: 4 }}>{treat.left.toLocaleString()} kcal left of {treat.allowance.toLocaleString()}</Text>
        <View style={{ height: 10, borderRadius: 99, backgroundColor: colors.chipBg, overflow: 'hidden', marginVertical: 8 }}><View style={{ height: 10, width: `${Math.min(100, (treat.used / treat.allowance) * 100)}%`, backgroundColor: colors.primarySolid }} /></View>
        <Text style={S.muted}>{treat.message}</Text>
        {open ? (
          <View style={{ marginTop: 8 }}>
            <TextInput accessibilityLabel="Treat name" style={S.input} value={name} maxLength={80} onChangeText={setName} placeholder="What was it?" placeholderTextColor={colors.muted} />
            <TextInput accessibilityLabel="Treat kcal" style={S.input} keyboardType="number-pad" value={amt} onChangeText={setAmt} placeholder="kcal" placeholderTextColor={colors.muted} />
            <Button title="Log treat" disabled={!name.trim() || !(Number(amt) > 0)} onPress={use} />
            <Chip small label="Cancel" onPress={() => setOpen(false)} />
          </View>
        ) : <View style={{ flexDirection: 'row', marginTop: 6 }}><Chip small label="I had a treat" onPress={() => setOpen(true)} /><Chip small label="Turn off" onPress={() => set(0)} /></View>}
      </>)}
    </View>
  );
}

function Trend({ series }: { series: any[] }) {
  const { colors } = useThemedStyles();
  if (!series || series.length < 2) return null;
  const W = 300, H = 90, P = 6;
  const vals = series.flatMap((s) => [s.weightKg, s.trendKg]);
  const lo = Math.min(...vals) - 0.3, hi = Math.max(...vals) + 0.3;
  const x = (i: number) => P + (i / (series.length - 1)) * (W - 2 * P), y = (v: number) => P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P);
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} accessibilityLabel="Recent weigh-ins and trend line">
      {series.map((s, i) => <Circle key={s.date} cx={x(i)} cy={y(s.weightKg)} r={3} fill={colors.muted} />)}
      <Path d={series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.trendKg).toFixed(1)}`).join(' ')} stroke={colors.primary} strokeWidth={2.5} fill="none" />
    </Svg>
  );
}
function Cone({ r }: { r: any }) {
  const { colors } = useThemedStyles();
  const g = coneGeometry(r);
  if (!g) return null;
  return (
    <Svg width="100%" height={g.H} viewBox={`0 0 ${g.W} ${g.H}`} accessibilityLabel={`Range of likely arrival dates. Most likely around ${short(r.likely)}.`}>
      <Path d={g.band} fill={colors.primary} fillOpacity={0.18} />
      <Line x1={g.P} x2={g.W - g.P} y1={g.goalY} y2={g.goalY} stroke={colors.muted} strokeDasharray="4 4" />
      <SvgText x={g.goalLabel.x} y={g.goalLabel.y} fontSize={10} fill={colors.muted}>{g.goalLabel.text}</SvgText>
      <Path d={g.mid} stroke={colors.primary} strokeWidth={2.5} fill="none" />
      {g.arrival && <Circle cx={g.arrival.x} cy={g.arrival.y} r={4} fill={colors.primary} />}
      {g.ticks.map((t: any) => <SvgText key={`${t.x}-${t.date}`} x={t.x} y={g.labelY} fontSize={9} fontWeight={t.bold ? '700' : '400'} fill={t.bold ? colors.ink : colors.muted} textAnchor={t.anchor}>{short(t.date)}</SvgText>)}
    </Svg>
  );
}
export function WeightInsights({ refreshKey }: { refreshKey?: any }) {
  const { S, colors } = useThemedStyles();
  const [jump, setJump] = useState<any>(null); const [range, setRange] = useState<any>(null); const [sleep, setSleep] = useState<any>(null);
  useEffect(() => {
    const t = today();
    read<any>(`/api/coach/weight-jump?today=${t}`).then(setJump).catch(() => {});
    read<any>(`/api/coach/goal-range?today=${t}`).then(setRange).catch(() => {});
    read<any>(`/api/coach/sleep-eating?today=${t}`).then(setSleep).catch(() => {});
  }, [refreshKey]);
  const label = { fontSize: 12, fontWeight: '800' as const, color: colors.muted };
  return (
    <>
      {jump?.status === 'jump' && (
        <View style={S.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><Buddy scene="wave" size={56} talk={false} /><View style={{ flex: 1, marginLeft: 8 }}><Text style={label}>WHY DID THE SCALE JUMP?</Text><Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>{jump.headline}</Text></View></View>
          <Trend series={jump.series} />
          {jump.reasons.map((x: any) => <Text key={x.id} style={[S.muted, { marginTop: 4, color: colors.ink }]}>• {x.text}</Text>)}
          {!!jump.fallback && <Text style={[S.muted, { marginTop: 4, color: colors.ink }]}>• {jump.fallback}</Text>}
          <Text style={[S.muted, { marginTop: 6 }]}>{jump.reassure}</Text>
        </View>
      )}
      {(jump?.status === 'steady' || jump?.status === 'insufficient') && <View style={S.card}><Text style={label}>SCALE CHECK</Text><Text style={S.muted}>{jump.message}</Text>{jump.status === 'steady' && <Trend series={jump.series} />}</View>}
      {range && (
        <View style={S.card}>
          <Text style={label}>LIKELY ARRIVAL</Text>
          {range.status === 'ok' ? (<>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink }}>{short(range.earliest)} – {range.latestOpen ? 'later' : short(range.latest)}</Text>
            <Text style={S.muted}>Most likely around {short(range.likely)}, {range.remainingKg != null ? `${range.remainingKg} kg to go, ` : ''}at about {Math.abs(range.slopeKgPerWeek)} kg a week. {range.message}</Text>
            <Cone r={range} />
          </>) : <Text style={S.muted}>{range.message}</Text>}
        </View>
      )}
      {sleep && <View style={S.card}><Text style={label}>SLEEP AND EATING</Text><Text style={S.muted}>{sleep.message}</Text>{sleep.enough && <Text style={S.muted}>{sleep.note}</Text>}</View>}
    </>
  );
}

export function CoachLearning() {
  const { S, colors } = useThemedStyles();
  const { success, error } = useNotifications();
  const [n, setN] = useState<number | null>(null);
  useEffect(() => { get<any>('/api/coach/learn').then((j) => setN(j.count)).catch(() => {}); }, []);
  if (n === null) return null;
  const reset = async () => { try { await del('/api/coach/learn'); setN(0); success('Done', 'The coach forgot what it learned.'); } catch (e: any) { error('Could not reset', e.message); } };
  return (
    <View style={S.card}>
      <Text style={{ fontWeight: '800', color: colors.ink }}>What the coach has learned</Text>
      <Text style={[S.muted, { marginVertical: 4 }]}>The coach notices which suggestions you try and shows similar ones first. It is stored only for you, and you can wipe it. {n} suggestion type{n === 1 ? '' : 's'} remembered.</Text>
      <Chip small label="Reset what it learned" onPress={() => n > 0 && reset()} />
    </View>
  );
}

// 8 + 9. Tone and gentle mode settings.
export function ToneSettings() {
  const { S, colors } = useThemedStyles();
  const { error } = useNotifications();
  const t = useCoachTone();
  const [busy, setBusy] = useState(false);
  const save = async (patch: any) => { setBusy(true); try { await saveToneSettings(patch); } catch (e: any) { error('Could not save that', e.network ? 'This needs a connection.' : e.message); } finally { setBusy(false); } };
  const LABEL: Record<string, string> = { gentle: 'Gentle', strict: 'Strict', funny: 'Funny' };
  return (
    <View style={S.card}>
      <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16 }}>How should your coach talk?</Text>
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        {(t.tones || ['gentle', 'strict', 'funny']).map((x) => <Chip key={x} small label={LABEL[x]} active={t.tone === x} onPress={() => !busy && save({ tone: x })} />)}
      </View>
      <Text style={S.muted}>Every character, reminder and weekly review follows the tone. Strict is firm and short, never harsh.</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
        <View style={{ flex: 1, paddingRight: 8 }}><Text style={{ fontWeight: '700', color: colors.ink }}>Gentle mode</Text><Text style={S.muted}>Hide calorie numbers and show plate balance and habits instead. Good if numbers make food stressful.</Text></View>
        <Chip small label={t.gentle ? 'On' : 'Off'} active={t.gentle} onPress={() => !busy && save({ gentle: !t.gentle })} />
      </View>
      {t.gentle && !!t.support && <Text style={[S.muted, { marginTop: 8, color: colors.ink }]}>{t.support.text} {t.support.india}</Text>}
    </View>
  );
}

// 9. Gentle Home card: plate balance and habits, no numbers.
const PLATE_COLORS: Record<string, string> = { veg: '#4caf7a', fruit: '#f2994a', protein: '#e0607e', grain: '#d9b35a', dairy: '#6fa8dc' };
export function PlateCard({ refreshKey }: { refreshKey?: any }) {
  const { S, colors } = useThemedStyles();
  const [d, setD] = useState<any>(null);
  useEffect(() => { read<any>(`/api/coach/plate?date=${today()}&today=${today()}`).then(setD).catch(() => {}); }, [refreshKey]);
  if (!d) return null;
  return (
    <View style={[S.card, { marginBottom: 12 }]} accessibilityRole="summary">
      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted }}>TODAY'S PLATE</Text>
      <View style={{ flexDirection: 'row', height: 22, borderRadius: 99, overflow: 'hidden', marginVertical: 8, backgroundColor: colors.chipBg }} accessibilityLabel="Share of vegetables, fruit, protein, grains and dairy on your plate so far">
        {d.slices.filter((x: any) => x.share > 0).map((x: any) => <View key={x.id} style={{ flex: x.share, backgroundColor: PLATE_COLORS[x.id], marginRight: 2 }} />)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{d.slices.map((x: any) => <Text key={x.id} style={{ fontSize: 12, color: colors.muted, marginRight: 10 }}><Text style={{ color: PLATE_COLORS[x.id] }}>● </Text>{x.label}</Text>)}</View>
      <Text style={{ color: colors.ink, marginTop: 8 }}>{d.message}</Text>
      {d.habits.map((h: any) => <Text key={h.id} style={{ marginTop: 6, color: h.done ? colors.muted : colors.ink, textDecorationLine: h.done ? 'line-through' : 'none' }}>{h.done ? '✓ ' : '○ '}{h.title}</Text>)}
    </View>
  );
}

// 10. Craving timer: 10 calm minutes with a breathing circle, then a swap from your own foods.
export function CravingTimer({ onLogged, compact }: { onLogged?: () => void; compact?: boolean }) {
  const { S, colors } = useThemedStyles();
  const { error, success } = useNotifications();
  const [open, setOpen] = useState(false);
  const [end, setEnd] = useState<number | null>(null);
  const [left, setLeft] = useState(600);
  const [swap, setSwap] = useState<any>(null);
  const scale = useRef(new Animated.Value(0.7)).current;
  const finish = useCallback(async () => {
    setEnd(null);
    try { setSwap(await post<any>('/api/coach/craving/swap', { today: today() })); }
    catch { setSwap({ picks: [], message: 'The timer is done. A glass of water or a short walk can help, and it is okay to have what you fancy.' }); }
  }, []);
  useEffect(() => {
    if (!end) return undefined;
    const id = setInterval(() => { const l = Math.max(0, Math.round((end - Date.now()) / 1000)); setLeft(l); if (l === 0) { clearInterval(id); finish(); } }, 500);
    return () => clearInterval(id);
  }, [end, finish]);
  useEffect(() => {
    if (!end) return undefined;
    const loop = Animated.loop(Animated.sequence([Animated.timing(scale, { toValue: 1, duration: 4000, useNativeDriver: true }), Animated.timing(scale, { toValue: 0.7, duration: 6000, useNativeDriver: true })]));
    loop.start(); return () => loop.stop();
  }, [end, scale]);
  const log = async (p: any) => {
    try { await write('POST', '/api/food-logs', { foodId: p.foodId, date: today(), mealType: 'snacks', quantity: p.servingSize || 1, trigger: 'hungry', clientId: newClientId('crave') }, p.name); success('Added', `${p.name}. Enjoy it.`); onLogged?.(); setSwap(null); setOpen(false); }
    catch (e: any) { error('Could not add that', e.message); }
  };
  if (!open) return <Chip small label="🌬️ I'm craving something" onPress={() => setOpen(true)} />;
  const mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0');
  return (
    <View style={[S.card, { marginBottom: 12 }, compact && { width: '100%' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}><Buddy scene="health" size={56} talk={false} /><View style={{ flex: 1, marginLeft: 8 }}><Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted }}>BREATHING TECHNIQUE</Text><Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>Let the craving pass over you</Text></View></View>
      {end ? (<>
        <View style={{ alignItems: 'center', marginVertical: 14 }}>
          <Animated.View accessibilityLabel={`${mm} minutes ${ss} seconds left`} style={{ width: 150, height: 150, borderRadius: 75, backgroundColor: colors.primarySolid, alignItems: 'center', justifyContent: 'center', transform: [{ scale }] }}><Text style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>{mm}:{ss}</Text></Animated.View>
        </View>
        <Text style={[S.muted, { textAlign: 'center' }]}>Breathe in through your nose for 4, out slowly for 6. Sip some water. Most cravings fade within ten minutes.</Text>
        <Chip small label="Stop the timer" onPress={() => { setEnd(null); setLeft(600); }} />
      </>) : swap ? (<>
        <Text style={[S.muted, { marginVertical: 6, color: colors.ink }]}>{swap.message}</Text>
        {swap.picks.map((p: any) => (
          <View key={p.foodId} style={[S.row, { marginBottom: 6 }]}><View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: colors.ink }}>{p.name}</Text><Text style={S.muted}>{p.calories} kcal · {p.protein} g protein</Text></View><Chip small label="Add" onPress={() => log(p)} /></View>
        ))}
        <Chip small label="Close" onPress={() => setOpen(false)} />
      </>) : (<>
        <Text style={[S.muted, { marginVertical: 6 }]}>Ten calm minutes first. If you still want something afterwards, I will suggest something you already enjoy.</Text>
        <Button title="Start 10 minutes" onPress={() => { setSwap(null); setLeft(600); setEnd(Date.now() + 600_000); }} />
        <Chip small label="Not now" onPress={() => setOpen(false)} />
      </>)}
    </View>
  );
}

// 12. Festival / wedding / trip mode.
const pad2 = (n: number) => String(n).padStart(2, '0');
const addD = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
export function EventMode({ event, reload, compact }: { event: any; reload: () => void; compact?: boolean }) {
  const { S, colors } = useThemedStyles();
  const { error } = useNotifications();
  const [form, setForm] = useState<any>(null);
  const t0 = today();
  const save = async () => { try { await put('/api/coach/event', { today: t0, ...form }); setForm(null); reload(); } catch (e: any) { error('Could not start that', e.network ? 'This needs a connection.' : e.message); } };
  const end = async () => { try { await del('/api/coach/event'); reload(); } catch (e: any) { error('Could not end it', e.message); } };
  if (event?.on) {
    return (
      <View style={[S.card, { marginBottom: 12 }, compact && { width: '100%' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}><Buddy scene={event.scene === 'party' ? 'victory' : 'walk'} size={64} talk={false} /><View style={{ flex: 1, marginLeft: 8 }}><Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted }}>{event.kind === 'diet-break' ? 'DIET BREAK' : 'FESTIVAL ARC'}</Text><Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>{event.label} mode is on</Text><Text style={S.muted}>{event.message}</Text></View></View>
        <Text style={S.muted}>{event.daysLeft} day{event.daysLeft === 1 ? '' : 's'} left.{event.extraToday > 0 ? ` Today you have +${Math.round(event.extraToday)} kcal of room (about ${Math.round(event.todayTarget).toLocaleString()} kcal), and your quests and level count against that.` : ''}</Text>
        {event.kind !== 'diet-break' && <Chip small label="End it early" onPress={end} />}
      </View>
    );
  }
  if (!form && compact) return <Chip small label="🎉 Event coming up?" a11y="Festival, wedding or trip coming up? Plan for it" onPress={() => setForm({ kind: 'festival', from: t0, to: addD(t0, 2), label: '' })} />;
  if (!form) return <View style={[S.row, { marginBottom: 10 }]}><Text style={[S.muted, { flex: 1 }]}>Festival, wedding or trip coming up?</Text><Chip small label="Plan for it" onPress={() => setForm({ kind: 'festival', from: t0, to: addD(t0, 2), label: '' })} /></View>;
  return (
    <View style={[S.card, { marginBottom: 12 }, compact && { width: '100%' }]}>
      <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16 }}>Plan for a festival, wedding or trip</Text>
      <View style={{ flexDirection: 'row', marginTop: 8 }}>{[['festival', 'Festival'], ['wedding', 'Wedding'], ['trip', 'Trip']].map(([k, l]) => <Chip key={k} small label={l} active={form.kind === k} onPress={() => setForm({ ...form, kind: k })} />)}</View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><DateTimeField label="From" mode="date" value={form.from} onChange={(v) => v && setForm({ ...form, from: v, to: form.to < v ? v : form.to })} /></View>
        <View style={{ flex: 1 }}><DateTimeField label="To" mode="date" value={form.to} onChange={(v) => v && setForm({ ...form, to: v })} /></View>
      </View>
      <TextInput accessibilityLabel="Name" style={S.input} value={form.label} maxLength={40} onChangeText={(v) => setForm({ ...form, label: v })} placeholder="Name (optional), e.g. Diwali" placeholderTextColor={colors.muted} />
      <Text style={S.muted}>Your weekly budget gets extra room, estimates for eating out get a bigger safety margin, and the coach turns supportive. It ends by itself.</Text>
      <Button title="Start" onPress={save} />
      <Chip small label="Cancel" onPress={() => setForm(null)} />
    </View>
  );
}

// 13. Optional diet break offered on a real plateau.
export function DietBreak({ reload }: { reload?: () => void }) {
  const { S, colors } = useThemedStyles();
  const { error, success } = useNotifications();
  const [a, setA] = useState<any>(null); const [done, setDone] = useState(false);
  useEffect(() => { read<any>(`/api/coach/diet-break/advice?today=${today()}`).then((j) => setA(j.advice)).catch(() => {}); }, []);
  if (!a || done) return null;
  const start = async () => { try { await post('/api/coach/diet-break', { kind: a.kind, days: a.days, today: today() }); setDone(true); success('Break started', 'It ends by itself.'); reload?.(); } catch (e: any) { error('Could not start it', e.message); } };
  return (
    <View style={S.card}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>{a.title}</Text>
      <Text style={[S.muted, { marginTop: 4, color: colors.ink }]}>{a.reasoning}</Text>
      <Text style={S.muted}>{a.note}</Text>
      <View style={{ flexDirection: 'row', marginTop: 6 }}><Chip small label={`Try it (${a.days} day${a.days === 1 ? '' : 's'} at about ${a.kcal.toLocaleString()} kcal)`} onPress={start} /><Chip small label="No thanks" onPress={() => setDone(true)} /></View>
    </View>
  );
}
