// Section B (mobile): ONE goal, ONE daily focus, ONE level, ONE badge shelf; everything else under "Details".
// Every word comes from the server payload, so mobile and web read exactly the same.
import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from '../UI';
import { useNotifications } from '../Notifications';
import { WeightReveal } from '../WeightReveal';
import { post, patch, today } from '../../config/api';
import { refreshSimple, useSimple } from '../../utils/simple';

function Bar({ pct, color }: { pct: number; color: string }) {
  const { colors } = useThemedStyles();
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }} style={{ height: 10, borderRadius: 5, backgroundColor: colors.chipBg, overflow: 'hidden', marginVertical: 6 }}><View style={{ height: 10, width: `${Math.max(2, Math.min(100, pct))}%`, backgroundColor: color }} /></View>;
}
const Btn = ({ t, onPress, primary, disabled, a11y }: { t: string; onPress: () => void; primary?: boolean; disabled?: boolean; a11y?: string }) => {
  const { colors } = useThemedStyles();
  return <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y || t} style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 12, justifyContent: 'center', borderWidth: 1, borderColor: primary ? 'transparent' : colors.cardBorder, backgroundColor: primary ? colors.primary : colors.card, opacity: disabled ? 0.5 : 1 }}><Text style={{ fontWeight: '700', color: primary ? '#fff' : colors.ink }}>{t}</Text></TouchableOpacity>;
};

export function GoalCard({ d, onOpen }: { d: any; onOpen?: () => void }) {
  const { S, colors } = useThemedStyles();
  const g = d?.goal; if (!g) return null;
  if (!g.active) return <TouchableOpacity onPress={onOpen} accessibilityRole="button" accessibilityLabel={g.empty} style={S.card}><Text style={{ fontWeight: '800', fontSize: 16, color: colors.ink }}>{g.title}</Text><Text style={S.muted}>{g.empty}</Text></TouchableOpacity>;
  const tone = g.status === 'behind' ? '#9a5b00' : g.status === 'ahead' || g.status === 'reached' ? colors.success : colors.primary;
  return (
    <View style={S.card} testID="goal-card">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontWeight: '800', fontSize: 16, color: colors.ink }}>{g.title}</Text>
        <Text style={{ fontWeight: '700', color: tone }}>{g.statusLine}</Text>
      </View>
      <WeightReveal compact reaction={false} text={g.progressLine} style={{ color: colors.ink, fontWeight: '700', marginTop: 4 }} />
      {!!g.statusWhy && <Text style={[S.muted, { marginTop: 2 }]}>{g.statusWhy}</Text>}
      <Bar pct={g.pct} color={tone} />
      {!!g.checkLine && <WeightReveal compact reaction={false} text={g.checkLine} style={[S.muted, { fontSize: 13, marginTop: 4 }]} />}
      {!!g.eta && <Text style={S.muted}>{g.eta.line}</Text>}
      {!!g.basisLine && <Text style={[S.muted, { fontSize: 12 }]}>{g.basisLine}</Text>}
      {!!g.etaNote && <Text style={S.muted}>{g.etaNote}</Text>}
    </View>
  );
}

export function FocusCard({ d }: { d: any }) {
  const { S, colors } = useThemedStyles();
  const f = d?.focus; if (!f) return null;
  const hide = !!d.hideNumbers;
  return (
    <View style={S.card} testID="daily-focus">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontWeight: '800', fontSize: 16, color: colors.ink }}>{f.title}</Text><Text style={S.muted}>{f.done}/{f.total}</Text></View>
      {!!f.empty && <Text style={S.muted}>{f.empty}</Text>}
      {f.quests.map((q: any) => (
        <View key={q.id} accessible accessibilityLabel={`${q.title}, ${q.done ? 'done' : 'not done'}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
          <Text style={{ fontSize: 20, width: 28, textAlign: 'center', color: q.done ? colors.success : colors.ink }}>{q.done ? '✓' : q.icon}</Text>
          <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: q.done ? colors.success : colors.ink }}>{q.title}</Text>{!(q.unit === 'kcal' && hide) && <Text style={S.muted}>{q.done ? 'Done' : q.hint}</Text>}</View>
        </View>
      ))}
      {!!f.bonus && <Text style={S.muted}>{f.bonus.title}: {f.bonus.done ? 'done' : `${f.bonus.value.toLocaleString()} of ${f.bonus.target.toLocaleString()}`}</Text>}
      {!!f.reward && <View accessibilityRole="alert" style={{ marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: '#fff6d6' }}><Text style={{ fontWeight: '700', color: '#6d5200' }}>🎉 {f.reward.text} {f.reward.line}</Text></View>}
    </View>
  );
}

export function LevelBar({ d }: { d: any }) {
  const { S, colors } = useThemedStyles();
  const l = d?.level; if (!l) return null;
  return (
    <View style={S.card} testID="level">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontWeight: '800', color: colors.ink }}>Level {l.level} · {l.rank}</Text><Text style={S.muted}>{l.nextLine}</Text></View>
      <Bar pct={Math.max(3, l.pct)} color="#ff9f1c" />
    </View>
  );
}

const RAR: Record<string, string> = { common: '#c9cde0', rare: '#3d8bff', epic: '#ffb020', legendary: '#c04bff' };
function Badge({ b }: { b: any }) {
  const { S, colors } = useThemedStyles();
  return (
    <View accessible accessibilityLabel={`${b.title}, ${b.earned ? b.rarity : 'next'}, ${b.line}`} style={[S.card, { flexDirection: 'row', gap: 10, borderColor: RAR[b.rarity] || colors.cardBorder, opacity: b.earned ? 1 : 0.8 }]}>
      <Text style={{ fontSize: 28 }}>{b.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '800', color: colors.ink }}>{b.title}  <Text style={{ fontSize: 11, color: colors.muted, fontWeight: '600' }}>{b.earned ? b.rarity : 'next'} · {Math.max(b.tier, 0)}/{b.tiers}</Text></Text>
        <Text style={S.muted}>{b.line}</Text>
        {!!b.nextAt && <Bar pct={Math.round(b.progress * 100)} color={colors.primary} />}
      </View>
    </View>
  );
}

export function BadgeShelf({ d }: { d: any }) {
  const { S, colors } = useThemedStyles();
  const [all, setAll] = useState(false);
  const bs = d?.badges; if (!bs) return null;
  return (
    <View testID="badges">
      <Text style={{ fontWeight: '800', fontSize: 16, color: colors.ink, marginTop: 6 }}>{bs.copy.next}</Text>
      {bs.next ? <Badge b={bs.next} /> : <Text style={S.muted}>{bs.copy.none}</Text>}
      {!!bs.last && <><Text style={[S.muted, { marginTop: 4 }]}>{bs.copy.last}</Text><Badge b={bs.last} /></>}
      <Btn t={`${all ? 'Hide' : bs.copy.seeAll} (${bs.earnedCount}/${bs.total})`} onPress={() => setAll(!all)} />
      {all && bs.shelves.map((s: any) => (
        <View key={s.id}><Text style={{ fontWeight: '800', fontSize: 15, color: colors.ink, marginTop: 14 }}>{s.label}</Text>{s.badges.map((b: any) => <Badge key={b.id} b={b} />)}</View>
      ))}
    </View>
  );
}

export function DetailsPanel({ d }: { d: any }) {
  const { S, colors } = useThemedStyles();
  const [open, setOpen] = useState(false);
  if (!d) return null;
  const ws = d.weeklyScore, st = d.streak, rc = d.recap, ps = d.phaseSuggestion;
  return (
    <View style={S.card}>
      <TouchableOpacity onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ fontWeight: '800', color: colors.ink }}>{d.copy.detailsLabel} {open ? '⌃' : '⌄'}</Text></TouchableOpacity>
      {open && (
        <View style={{ gap: 6 }}>
          {!!d.updatedLine && <Text style={S.muted}>{d.updatedLine}</Text>}
          <Text style={{ fontWeight: '800', color: colors.ink }}>{ws.title}</Text>
          {ws.score === null ? <Text style={S.muted}>{ws.empty}</Text> : (
            <>
              <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink }}>{ws.score}<Text style={{ fontSize: 14 }}> / 100 · {ws.label}</Text></Text>
              {ws.parts.filter((p: any) => p.score !== null).map((p: any) => (
                <View key={p.id}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.ink }}>{p.label}</Text><Text style={S.muted}>{p.score}</Text></View><Bar pct={p.score} color={colors.primary} /><Text style={S.muted}>{p.why}</Text></View>
              ))}
            </>
          )}
          <Text style={{ fontWeight: '800', color: colors.ink, marginTop: 8 }}>Streak</Text>
          <Text style={{ color: colors.ink }}>🔥 {st.current} day{st.current === 1 ? '' : 's'} (best {st.longest})</Text>
          <Text style={S.muted}>{st.token.line}</Text>
          {!!st.comeback && <Text style={{ color: colors.success, fontWeight: '700' }}>🌅 {st.comeback.line} +{st.comeback.bonusXp} XP</Text>}
          <Text style={{ fontWeight: '800', color: colors.ink, marginTop: 8 }}>{rc.title}</Text>
          <Text style={{ color: colors.ink }}>{rc.win}</Text>
          {!!ps && <Text style={{ color: '#7a4a00' }}>{ps.line}</Text>}
        </View>
      )}
    </View>
  );
}

const KEY: Record<string, string> = { calories: 'calorieTarget', protein: 'proteinTarget', water: 'waterTargetMl', steps: 'stepsTarget', goalWeight: 'targetWeightKg' };

function TargetRow({ r }: { r: any }) {
  const { S, colors } = useThemedStyles();
  const { success, error } = useNotifications();
  const [val, setVal] = useState(String(r.value ?? ''));
  const [why, setWhy] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async (raw: any, extra: any = {}) => {
    setBusy(true);
    try {
      const chk: any = await post('/api/goals/check-target', { key: r.id, value: raw });
      if (!chk.ok) { error(chk.note); if (chk.value != null) setVal(String(chk.value)); return; }
      await patch('/api/profile', { goals: { [KEY[r.id]]: chk.value, ...extra }, today: today() });
      success('Saved.'); setVal(String(chk.value)); await refreshSimple(true);
    } catch (e: any) { error(e?.message || 'Could not save'); } finally { setBusy(false); }
  };
  return (
    <View style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.cardBorder, gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontWeight: '800', color: colors.ink }}>{r.label}</Text><Text style={S.muted}>{r.unit}</Text></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <TextInput value={val} onChangeText={setVal} keyboardType="decimal-pad" accessibilityLabel={r.label} style={{ minHeight: 44, minWidth: 90, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 10, paddingHorizontal: 10, color: colors.ink }} />
        <Btn t="Save" primary disabled={busy || val === '' || Number(val) === Number(r.value)} onPress={() => save(val, r.id === 'calories' ? { calorieMode: 'manual' } : {})} />
        {r.recommended != null && !r.atRecommended && <Btn t={`Use recommended (${Number(r.recommended).toLocaleString()})`} disabled={busy} onPress={() => save(r.recommended, r.id === 'calories' ? { calorieMode: 'auto' } : {})} />}
        <Btn t="Why this number?" onPress={() => setWhy(!why)} />
      </View>
      {why && <Text style={S.muted}>{r.why}</Text>}
    </View>
  );
}

export function TargetsPanel({ d }: { d: any }) {
  const { S, colors } = useThemedStyles();
  const [adv, setAdv] = useState(false);
  const t = d?.targets; if (!t) return null;
  return (
    <View style={S.card} testID="targets">
      <Text style={{ fontWeight: '800', fontSize: 16, color: colors.ink }}>Targets</Text>
      <Text style={S.muted}>{t.phase.label} phase. {t.phase.why}</Text>
      {t.basic.map((r: any) => <TargetRow key={r.id} r={r} />)}
      <Btn t={t.copy.advanced} onPress={() => setAdv(!adv)} />
      {adv && t.advanced.map((r: any) => (
        <View key={r.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.cardBorder }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontWeight: '800', color: colors.ink }}>{r.label}</Text><Text style={{ color: colors.ink }}>{r.value != null ? `${r.value} ${r.unit}` : ''}</Text></View>
          <Text style={S.muted}>{r.why}</Text>
        </View>
      ))}
    </View>
  );
}

/** Home: just the goal card (plus any safety note). */
export function HomeGoal({ onOpen }: { onOpen?: () => void }) {
  const { S, colors } = useThemedStyles();
  const [d] = useSimple();
  if (!d) return null;
  return (
    <>
      {d.safety?.flags?.length > 0 && <View style={S.card}><Text style={{ fontWeight: '800', color: colors.ink }}>💛 {d.safety.flags[0].title}</Text><Text style={S.muted}>{d.safety.flags[0].detail}</Text></View>}
      <GoalCard d={d} onOpen={onOpen} />
      {!!d.updatedLine && <Text style={[S.muted, { marginBottom: 8 }]}>{d.updatedLine}</Text>}
    </>
  );
}

export default function SimpleProgress({ onOpenPlan }: { onOpenPlan?: () => void }) {
  const { S } = useThemedStyles();
  const [d] = useSimple();
  if (!d) return <Text style={S.muted}>Loading…</Text>;
  return (
    <>
      {d.safety?.flags?.length > 0 && <View style={S.card}><Text style={{ fontWeight: '800' }}>💛 {d.safety.flags[0].title}</Text><Text style={S.muted}>{d.safety.flags[0].detail}</Text></View>}
      <GoalCard d={d} onOpen={onOpenPlan} />
      <FocusCard d={d} />
      <LevelBar d={d} />
      <BadgeShelf d={d} />
      <DetailsPanel d={d} />
      <TargetsPanel d={d} />
    </>
  );
}
