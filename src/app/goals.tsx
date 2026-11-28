// Journey (mobile): instead of bars and targets you COLLECT. Showing up earns sticker packs; each pack reveals a new
// sticker and fills your album. A weekly "chapter" path shows the days you showed up; today's moves earn XP towards the
// next pack; your own goals sit in a fold-out at the bottom. Everything comes from the server (/api/goals, /api/album).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Modal, RefreshControl, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';

import { Screen, useThemedStyles } from '../components/UI';
import { useNotifications } from '../components/Notifications';
import { useRefreshOnSync } from '../utils/offline';
import { del, get, patch, post, today as todayStr } from '../config/api';
import { refreshCtx } from '../utils/journeyCtx';
import { successHaptic, impactHaptic } from '../utils/haptics';
import { ACCENT, CHARS, WHO_LIST, stickerById, stickerFor, stickersOf, type Who } from '../motion/chars';
import { WeightReveal } from '../components/WeightReveal';
import SimpleProgress from '../components/simple/SimpleProgress';

const METRICS = [
  { id: 'workouts', label: 'Workout days', unit: 'days', def: '12' },
  { id: 'logDays', label: 'Days I log', unit: 'days', def: '21' },
  { id: 'waterDays', label: 'Water-goal days', unit: 'days', def: '14' },
  { id: 'calorieDays', label: 'On-target calorie days', unit: 'days', def: '20' },
  { id: 'stepsTotal', label: 'Total steps', unit: 'steps', def: '150000' },
  { id: 'weight', label: 'Reach a body weight (kg)', unit: 'kg', def: '' },
  { id: 'custom', label: 'Something else', unit: '', def: '10' },
];
const addDays = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d + n); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`; };
const STATUS: Record<string, [string, string]> = { done: ['Done 🎉', 'ok'], ahead: ['Ahead of pace', 'ok'], active: ['On the way', 'mid'], behind: ['Behind pace', 'warn'], missed: ['Deadline passed', 'bad'] };


const RARITY: Record<string, [string, string]> = { common: ['Common', '#8f94b8'], rare: ['Rare', '#3d8bff'], epic: ['Epic', '#ffb020'] };
const rarityOfName = (n: string) => { const cat = n.replace(/-\d+$/, ''); return cat === 'power' ? 'epic' : ['party', 'love', 'lift', 'cool', 'game', 'sleep', 'sport'].includes(cat) ? 'rare' : 'common'; };

// The API sends `owned` as the list of sticker ids. Older servers sent a bare count by mistake (which crashed `new Set(1)`),
// so accept both: ids when we have them, otherwise just the number.
const normAlbum = (al: any) => {
  if (!al) return null;
  const ids: string[] = Array.isArray(al.owned) ? al.owned.filter((x: any) => typeof x === 'string') : [];
  const count = Array.isArray(al.owned) ? ids.length : Number.isFinite(Number(al.owned)) ? Number(al.owned) : Number(al.ownedCount) || 0;
  return { ...al, owned: ids, ownedCount: count };
};

export default function Goals() {
  const { S, colors } = useThemedStyles();
  const n = useNotifications();
  const [data, setData] = useState<any>(null);
  const [album, setAlbum] = useState<any>(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'short' | 'long'>('short');
  const [showGoals, setShowGoals] = useState(false);
  const [openWho, setOpenWho] = useState<Who | null>(null);
  const [showAlbum, setShowAlbum] = useState(false);
  const [packFor, setPackFor] = useState<'any' | Who>('any');
  const [pack, setPack] = useState<null | { stage: 'shake' | 'reveal'; sticker?: any }>(null);
  const [form, setForm] = useState<null | { kind: 'short' | 'long'; title: string; metric: string; target: string; deadline: string }>(null);
  const today = todayStr();
  const pop = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      const [d, a] = await Promise.all([get<any>(`/api/goals/journey?today=${today}`), get<any>(`/api/album?today=${today}`)]);
      if (!d.success) throw new Error(d.message);
      setData(d); setAlbum(a?.success ? normAlbum(a) : null); setErr('');
    } catch (e: any) { setErr(e?.message || 'Could not load your journey'); }
    finally { setRefreshing(false); }
  }, [today]);
  useEffect(() => { load(); }, [load]);
  useRefreshOnSync(() => load());

  const openPack = async () => {
    if (!album || album.packs.available < 1 || pack) return;
    setPack({ stage: 'shake' }); pop.setValue(0);
    Animated.loop(Animated.sequence([Animated.timing(shake, { toValue: 1, duration: 120, easing: Easing.linear, useNativeDriver: true }), Animated.timing(shake, { toValue: -1, duration: 120, easing: Easing.linear, useNativeDriver: true })])).start();
    try {
      const [r] = await Promise.all([post<any>('/api/album/open', { who: packFor === 'any' ? undefined : packFor, today }), new Promise((res) => setTimeout(res, 1400))]);
      if (!r.success) throw new Error(r.message || 'Could not open the pack');
      shake.stopAnimation(); shake.setValue(0);
      setPack({ stage: 'reveal', sticker: r.sticker }); setAlbum(normAlbum(r));
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, stiffness: 140, damping: 9 }).start();
      if (r.sticker.rarity !== 'common') impactHaptic(); else successHaptic();
      n.success('New sticker!', `${CHARS[r.sticker.who as Who]} · ${RARITY[r.sticker.rarity][0]}`); refreshCtx(true);
    } catch (e: any) { shake.stopAnimation(); setPack(null); n.error('Could not open the pack', e?.message); load(); }
  };

  const openForm = (kind: 'short' | 'long', preset: any = {}) => setForm({ kind, title: '', metric: 'workouts', target: '12', deadline: addDays(today, kind === 'short' ? 30 : 120), ...preset });
  const save = async () => {
    if (!form) return;
    const m = METRICS.find((x) => x.id === form.metric)!;
    try {
      const r = await post<any>('/api/goals', { title: form.title || m.label, kind: form.kind, metric: form.metric, target: Number(form.target), unit: m.unit, deadline: form.deadline, startDate: today, today });
      if (!r.success) throw new Error(r.message || 'Could not save');
      setTab(form.kind); setForm(null); n.success('Goal added', "Let's go!"); load(); refreshCtx(true);
    } catch (e: any) { n.error('Could not save', e?.message); }
  };
  const update = async (g: any, body: any, msg?: string) => {
    try { const r = await patch<any>(`/api/goals/${g._id || g.id}`, { ...body, today }); if (!r.success) throw new Error(r.message); if (msg) n.success(msg); if (body.done) successHaptic(); load(); refreshCtx(true); }
    catch (e: any) { n.error('Could not update', e?.message); }
  };
  const remove = async (g: any) => { try { await del(`/api/goals/${g._id || g.id}`); n.info('Goal removed'); load(); refreshCtx(true); } catch (e: any) { n.error('Could not delete', e?.message); } };

  const tone = (t: string) => (t === 'ok' ? colors.success : t === 'warn' ? '#D78A13' : t === 'bad' ? colors.danger : colors.primary);
  const Bar = ({ pct, color }: { pct: number; color: string }) => (
    <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.chipBg, overflow: 'hidden' }}><View style={{ height: 10, width: `${Math.max(2, Math.min(100, pct))}%`, backgroundColor: color, borderRadius: 5 }} /></View>
  );
  const H = ({ t, sub, weightSub }: { t: string; sub?: string; weightSub?: string }) => (
    <View style={{ marginTop: 18, marginBottom: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>{t}{sub ? <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '600' }}>  {sub}</Text> : null}</Text>
      {weightSub ? <WeightReveal compact text={weightSub} style={{ fontSize: 12, color: colors.muted, fontWeight: '600' }} /> : null}
    </View>
  );
  const owned = useMemo(() => new Set<string>(album?.owned || []), [album]);

  if (!data) return <Screen><TouchableOpacity onPress={() => router.back()}><Text style={S.back}>‹ Back</Text></TouchableOpacity>{err ? <Text style={{ color: colors.danger }}>{err}</Text> : <ActivityIndicator color={colors.primary} />}</Screen>;
  const { level: lv, goals, chapter } = data;
  const list = goals.filter((g: any) => g.kind === tab);
  const active = list.filter((g: any) => !g.done), finished = list.filter((g: any) => g.done);
  const packs = album?.packs;
  const mate = packFor === 'any' ? undefined : packFor;
  const shakeRot = shake.interpolate({ inputRange: [-1, 1], outputRange: ['-10deg', '10deg'] });

  return (
    <Screen buddyWho={mate} buddy={packs?.available ? 'cheer' : 'wave'} buddySays={packs?.available ? `${packs.available} pack${packs.available === 1 ? '' : 's'} ready!` : `Level ${lv.level} ${lv.rank}`} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back"><Text style={S.back}>‹ Back</Text></TouchableOpacity>
      <Text style={S.title}>Your journey</Text>

      <SimpleProgress onOpenPlan={() => router.push('/northstar' as any)} />
      <TouchableOpacity onPress={() => router.push('/northstar' as any)} accessibilityRole="button" style={[S.card, { minHeight: 44, justifyContent: 'center' }]}><Text style={{ fontWeight: '800', color: colors.ink }}>Plan, rewards and events ›</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => setShowAlbum(!showAlbum)} accessibilityRole="button" accessibilityState={{ expanded: showAlbum }} style={[S.card, { minHeight: 44, justifyContent: 'center' }]}><Text style={{ fontWeight: '800', color: colors.ink }}>Sticker packs, album and this week's path {showAlbum ? '⌃' : '⌄'}</Text></TouchableOpacity>
      {showAlbum && (<>

      <View style={[S.card, { gap: 8 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}><Text style={{ fontSize: 30, fontWeight: '900', color: colors.ink }}>{album ? `${album.ownedCount}/${album.total}` : '—'}</Text><Text style={{ color: colors.muted }}>stickers collected</Text></View>
        <Bar pct={album ? (album.ownedCount / Math.max(1, album.total)) * 100 : 0} color="#ff9f1c" />
        <Text style={{ fontSize: 12, color: colors.muted }}>{packs ? (packs.available > 0 ? `You have ${packs.available} pack${packs.available === 1 ? '' : 's'} waiting.` : `Next pack in ${packs.nextAtXp - packs.xp} XP — log a meal, water or a workout.`) : ''} Every 50 XP, and every week you log 5+ days, gives one.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <TouchableOpacity onPress={() => setPackFor('any')} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: packFor === 'any' ? colors.primary : colors.chipBg }}><Text style={{ fontWeight: '800', color: packFor === 'any' ? '#fff' : colors.ink }}>Any</Text></TouchableOpacity>
          {WHO_LIST.map((w) => (
            <TouchableOpacity key={w} onPress={() => setPackFor(w)} accessibilityLabel={CHARS[w]} style={{ padding: 3, borderRadius: 12, borderWidth: 2, borderColor: packFor === w ? colors.primary : 'transparent', backgroundColor: colors.chipBg }}>
              <Image source={stickerFor(w, 'cheer', 0).src} style={{ width: 34, height: 34 }} resizeMode="contain" />
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity disabled={!packs || packs.available < 1 || !!pack} onPress={openPack} style={{ backgroundColor: packs?.available ? '#ff4f81' : colors.chipBg, borderRadius: 16, padding: 14, alignItems: 'center' }}>
          <Text style={{ color: packs?.available ? '#fff' : colors.muted, fontWeight: '900', fontSize: 16 }}>{packs?.available ? `🎁 Open a ${packFor === 'any' ? '' : CHARS[packFor] + ' '}pack` : 'No packs yet'}</Text>
        </TouchableOpacity>
      </View>

      <H t="This week's chapter" sub={`${chapter.logged}/7 days · ${chapter.chestReady ? 'chest earned 🎉' : `${Math.max(0, chapter.chestAt - chapter.logged)} more for a bonus pack`}`} />
      <View style={[S.card, { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingTop: 30 }]}>
        {chapter.stones.map((s: any, i: number) => (
          <View key={s.date} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            {s.today && <Image source={stickerFor(mate || 'naruto', 'walk', i).src} style={{ position: 'absolute', top: -40, width: 44, height: 44 }} resizeMode="contain" />}
            <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: s.logged ? (s.perfect ? '#ff9f1c' : colors.success) : colors.chipBg, borderWidth: s.today ? 3 : 0, borderColor: colors.primary, opacity: s.future ? 0.4 : 1 }}>
              <Text style={{ color: '#fff', fontWeight: '900' }}>{s.logged ? (s.perfect ? '★' : '✓') : ''}</Text>
            </View>
            <Text style={{ fontSize: 11, fontWeight: '800', color: colors.muted }}>{s.label}</Text>
          </View>
        ))}
        <Text style={{ fontSize: 28, opacity: chapter.chestReady ? 1 : 0.5 }}>{chapter.chestReady ? '🎁' : '📦'}</Text>
      </View>

      <H t="Your album" />
      {WHO_LIST.map((w) => {
        const s = album?.byWho?.[w]; const isOpen = openWho === w;
        return (
          <View key={w} style={[S.card, { marginBottom: 8, padding: 10, gap: 8 }]}>
            <TouchableOpacity onPress={() => setOpenWho(isOpen ? null : w)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Image source={stickerFor(w, 'cheer', 0).src} style={{ width: 44, height: 44 }} resizeMode="contain" />
              <View style={{ flex: 1, gap: 4 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontWeight: '800', color: colors.ink }}>{CHARS[w]}</Text><Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted }}>{s ? `${s.owned}/${s.total}` : ''}</Text></View><Bar pct={s ? (s.owned / Math.max(1, s.total)) * 100 : 0} color={ACCENT[w]} /></View>
            </TouchableOpacity>
            {isOpen && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {stickersOf(w).map((st) => { const has = owned.has(`${w}/${st.name}`); return <Image key={st.name} source={st.src} style={{ width: 60, height: 60, opacity: has ? 1 : 0.18, tintColor: has ? undefined : '#000', borderRadius: 10 }} resizeMode="contain" />; })}
              </View>
            )}
          </View>
        );
      })}

      </>)}


      <TouchableOpacity onPress={() => setShowGoals((v) => !v)} style={{ marginTop: 18, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border }}><Text style={{ fontWeight: '800', color: colors.ink }}>{showGoals ? '▾' : '▸'} 🎯 My goals (optional)</Text></TouchableOpacity>
      {showGoals && (
        <View style={{ marginTop: 10, gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['short', 'long'] as const).map((k) => <TouchableOpacity key={k} onPress={() => setTab(k)} style={{ flex: 1, padding: 10, borderRadius: 12, alignItems: 'center', backgroundColor: tab === k ? colors.primary : colors.chipBg }}><Text style={{ fontWeight: '800', color: tab === k ? '#fff' : colors.ink }}>{k === 'short' ? 'Short-term' : 'Long-term'}</Text></TouchableOpacity>)}
          </View>
          {active.length === 0 && <Text style={{ color: colors.muted }}>No active {tab}-term goals.</Text>}
          {active.map((g: any) => <GoalCard key={g._id || g.id} g={g} colors={colors} S={S} Bar={Bar} tone={tone} onDone={() => update(g, { done: true }, 'Goal completed! 🎉')} onDelete={() => remove(g)} onManual={(v: number) => update(g, { manualValue: v })} />)}
          {finished.map((g: any) => <GoalCard key={g._id || g.id} g={g} colors={colors} S={S} Bar={Bar} tone={tone} onDelete={() => remove(g)} onUndo={() => update(g, { done: false })} />)}
          <TouchableOpacity onPress={() => openForm(tab)} style={{ backgroundColor: colors.primarySolid, borderRadius: 14, padding: 13, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '800' }}>＋ New {tab}-term goal</Text></TouchableOpacity>
        </View>
      )}

      <Modal transparent visible={!!pack} animationType="fade" onRequestClose={() => pack?.stage === 'reveal' && setPack(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(10,8,30,.6)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 24, padding: 24, alignItems: 'center', gap: 8 }}>
            {pack?.stage === 'shake' && <><Animated.Text style={{ fontSize: 90, transform: [{ rotate: shakeRot }] }}>🎁</Animated.Text><Text style={{ color: colors.muted }}>Opening…</Text></>}
            {pack?.stage === 'reveal' && pack.sticker && (() => {
              const st = pack.sticker; const img = stickerById(st.id); const [rl, rc] = RARITY[st.rarity];
              return (<>
                <Text style={{ fontWeight: '900', letterSpacing: 2, color: rc, textTransform: 'uppercase' }}>{rl}</Text>
                <Animated.View style={{ transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }, { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ['-20deg', '0deg'] }) }], shadowColor: rc, shadowOpacity: 0.9, shadowRadius: st.rarity === 'common' ? 4 : 18, shadowOffset: { width: 0, height: 0 } }}>
                  {img && <Image source={img.src} style={{ width: 200, height: 200 }} resizeMode="contain" />}
                </Animated.View>
                <Text style={{ fontSize: 20, fontWeight: '900', color: colors.ink }}>{CHARS[st.who as Who]}</Text>
                <Text style={{ color: colors.muted }}>{album?.ownedCount}/{album?.total} collected{album?.packs.available ? ` · ${album.packs.available} more ready` : ''}</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                  <TouchableOpacity onPress={() => setPack(null)} style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}><Text style={{ fontWeight: '800', color: colors.ink }}>Nice!</Text></TouchableOpacity>
                  {album?.packs.available > 0 && <TouchableOpacity onPress={() => { setPack(null); setTimeout(openPack, 80); }} style={{ padding: 12, borderRadius: 12, backgroundColor: colors.primarySolid }}><Text style={{ fontWeight: '800', color: '#fff' }}>Open another</Text></TouchableOpacity>}
                </View>
              </>);
            })()}
          </View>
        </View>
      </Modal>

      <Modal transparent visible={!!form} animationType="fade" onRequestClose={() => setForm(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(10,8,30,.55)', justifyContent: 'center', padding: 16 }}>
          {form && (
            <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 16, gap: 10 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: colors.ink }}>New {form.kind}-term goal</Text>
              <TextInput value={form.title} onChangeText={(t) => setForm({ ...form, title: t })} placeholder="Name (e.g. Get stronger)" placeholderTextColor={colors.muted} maxLength={120} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, color: colors.ink }} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {METRICS.map((m) => <TouchableOpacity key={m.id} onPress={() => setForm({ ...form, metric: m.id, target: m.def })} style={{ borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: form.metric === m.id ? colors.primary : colors.chipBg }}><Text style={{ fontSize: 12, fontWeight: '700', color: form.metric === m.id ? '#fff' : colors.ink }}>{m.label}</Text></TouchableOpacity>)}
              </View>
              <TextInput value={form.target} onChangeText={(t) => setForm({ ...form, target: t.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder="Target" placeholderTextColor={colors.muted} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, color: colors.ink }} />
              <TextInput value={form.deadline} onChangeText={(t) => setForm({ ...form, deadline: t })} placeholder="Deadline YYYY-MM-DD" placeholderTextColor={colors.muted} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, color: colors.ink }} />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                <TouchableOpacity onPress={() => setForm(null)} style={{ padding: 10 }}><Text style={{ fontWeight: '800', color: colors.muted }}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity onPress={save} disabled={!Number(form.target)} style={{ backgroundColor: colors.primarySolid, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18, opacity: Number(form.target) ? 1 : 0.5 }}><Text style={{ color: '#fff', fontWeight: '800' }}>Save goal</Text></TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </Screen>
  );
}

function GoalCard({ g, colors, S, Bar, tone, onDone, onDelete, onManual, onUndo }: any) {
  const p = g.progress; const [label, t] = STATUS[p.status] || STATUS.active;
  return (
    <View style={[S.card, { gap: 7, borderColor: g.done ? colors.success : colors.cardBorder }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Text style={{ fontWeight: '800', color: colors.ink, flex: 1 }}>{g.title}</Text><Text style={{ fontSize: 11, fontWeight: '800', color: tone(t) }}>{label}</Text></View>
      <Bar pct={p.pct} color={tone(t)} />
      <Text style={{ fontSize: 12, color: colors.muted }}>{g.metric === 'weight' ? '' : `${Number(p.value).toLocaleString()} / ${Number(p.target).toLocaleString()} ${g.unit || ''} · `}{p.pct}%{p.daysLeft !== null && !g.done ? (p.daysLeft >= 0 ? ` · ${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'} left` : ' · deadline passed') : ''}</Text>
      {g.metric === 'weight' && <WeightReveal compact reaction={false} text={`${p.value} kg now · goal ${p.target} kg`} style={{ fontSize: 12, color: colors.muted }} />}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        {g.metric === 'custom' && !g.done && onManual && (<>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Subtract one" onPress={() => onManual(Math.max(0, p.value - 1))} style={btn(colors)}><Text style={bt(colors)}>−1</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add one" onPress={() => onManual(p.value + 1)} style={btn(colors)}><Text style={bt(colors)}>＋1</Text></TouchableOpacity></>)}
        {!g.done && onDone && <TouchableOpacity onPress={onDone} style={btn(colors)}><Text style={bt(colors)}>Mark done</Text></TouchableOpacity>}
        {g.done && onUndo && <TouchableOpacity onPress={onUndo} style={btn(colors)}><Text style={bt(colors)}>Reopen</Text></TouchableOpacity>}
        <TouchableOpacity onPress={onDelete} style={btn(colors)}><Text style={[bt(colors), { color: colors.danger }]}>Delete</Text></TouchableOpacity>
      </View>
    </View>
  );
}
const btn = (c: any) => ({ borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12 });
const bt = (c: any) => ({ fontWeight: '800' as const, fontSize: 12, color: c.ink });
