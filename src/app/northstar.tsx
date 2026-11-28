// "My plan": the north-star goal, rewards you choose, event mode, maintenance break, the what-if simulator and the safety switches.
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Field, Screen, useThemedStyles } from '../components/UI';
import { Chip } from '../components/Chip';
import { DateTimeField } from '../components/DateTimeField';
import { useNotifications } from '../components/Notifications';
import { del, get, post, put, today } from '../config/api';
import { read } from '../utils/offline';
import { updateProfile, useProfile } from '../hooks/useProfile';
import { WeightReveal } from '../components/WeightReveal';

export default function NorthStar() {
  const { S, colors } = useThemedStyles();
  const { success, error, confirm } = useNotifications();
  const { profile } = useProfile();
  const [d, setD] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [targetKg, setTargetKg] = useState('');
  const [byDate, setByDate] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [choice, setChoice] = useState<any>(null);   // { keep, fresh } from the preview: an old start a re-save would otherwise reset
  const [ask, setAsk] = useState<any>(null);         // the save waiting for "keep your old start, or start fresh?"
  const [rAt, setRAt] = useState(''); const [rText, setRText] = useState('');
  const [eTitle, setETitle] = useState(''); const [eStart, setEStart] = useState(today()); const [eEnd, setEEnd] = useState(today());
  const [extra, setExtra] = useState('900'); const [repeats, setRepeats] = useState('0'); const [wi, setWi] = useState<any>(null);

  const load = useCallback(async () => {
    try { const r = await read<any>(`/api/plan?today=${today()}`); setD(r); if (r.plan.active) { setTargetKg((v) => v || String(r.plan.targetKg || '')); setByDate((v) => v || r.plan.byDate || ''); } }
    catch (e: any) { error('Could not load your plan', e.message); } finally { setRefreshing(false); }
  }, [error]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const k = Number(targetKg);
    if (!(k > 0)) { setPreview(null); return; }
    const t = setTimeout(() => { get<any>(`/api/plan/preview?targetKg=${k}${byDate ? `&byDate=${byDate}` : ''}&today=${today()}`).then((r) => { setPreview(r.derived); setChoice(r.startChoice || null); }).catch((e) => setPreview({ ok: false, reason: e.message })); }, 400);
    return () => clearTimeout(t);
  }, [targetKg, byDate]);

  const run = async (fn: () => Promise<any>, ok: string) => { try { await fn(); success('Done', ok); load(); } catch (e: any) { error('Something went wrong', e.message); } };
  // Re-saving an active plan used to restart progress at 0. Ask first when there is an old start that differs from today.
  const send = (body: any, ok: string) => run(() => put(`/api/plan?today=${today()}`, body), ok);
  const save = (useSafeDate = false) => {
    const body = { targetKg: Number(targetKg), byDate, useSafeDate };
    if (d?.plan?.active && choice) { setAsk(body); return; }
    send(body, 'Your plan is set.');
  };
  const confirmStart = (startMode: 'keep' | 'fresh') => { const body = { ...ask, startMode }; setAsk(null); send(body, startMode === 'keep' ? 'Your plan is updated. Your start is unchanged.' : 'Fresh start from today.'); };
  const addReward = () => { if (!(Number(rAt) > 0) || !rText.trim()) return error('Add a reward', 'Enter how many kg lost and what the reward is.'); run(async () => { await post('/api/plan/rewards', { atKg: Number(rAt), text: rText.trim() }); setRAt(''); setRText(''); }, 'Reward added.'); };
  const addEvent = () => { if (!eTitle.trim()) return error('Name the event', 'For example Diwali or a wedding.'); run(async () => { await post('/api/plan/events', { title: eTitle.trim(), startDate: eStart, endDate: eEnd < eStart ? eStart : eEnd }); setETitle(''); }, 'Event added.'); };
  const hide = !!d?.safety?.hideNumbers;
  const mask = (s: string) => (hide ? '••' : s);

  const runWhatIf = async () => { try { setWi((await get<any>(`/api/plan/what-if?extraKcal=${Number(extra) || 0}&repeats=${Number(repeats) || 0}&today=${today()}`)).result); } catch (e: any) { error('Could not simulate', e.message); } };

  if (!d) return <Screen><Text style={S.muted}>Loading your plan…</Text></Screen>;
  const active = d.plan.active;

  return (
    <Screen buddyWho="gojo" buddy="plan" buddySays="One goal, steady steps." refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back"><Text style={S.back}>‹ Back</Text></TouchableOpacity>
      <Text style={S.title}>My plan</Text>
      <Text style={S.sub}>One north-star goal. Everything else supports it.</Text>

      <View style={S.card}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 6 }}>{active ? 'Your goal' : 'Set your goal'}</Text>
        {hide ? <Text style={S.muted}>Current weight ••. Pick the weight you want and, if you like, a date.</Text> : <WeightReveal compact reaction={false} text={`Current weight ${profile?.currentWeightKg ?? '—'} kg. Pick the weight you want and, if you like, a date.`} style={S.muted} />}
        <Field label="Goal weight (kg)" value={targetKg} onChangeText={setTargetKg} keyboardType="decimal-pad" placeholder="e.g. 74" />
        <DateTimeField label="By when (optional)" mode="date" value={byDate} onChange={setByDate} clearable placeholder="No date" />
        {preview && (
          <View style={{ padding: 12, borderRadius: 14, backgroundColor: colors.chipBg, marginBottom: 10 }}>
            {preview.ok === false ? <Text style={{ color: colors.ink }}>{preview.reason}</Text> : (
              <>
                <Text style={{ fontWeight: '800', color: colors.ink }}>{preview.direction === 'maintain' ? 'Maintain' : `About ${preview.paceKg} kg a week`}</Text>
                <Text style={[S.muted, { marginTop: 2, color: colors.ink }]}>{preview.note}</Text>
                {preview.feasible === false && preview.suggestedDate && <Button title={`Use the safer date (${preview.suggestedDate})`} onPress={() => save(true)} />}
              </>
            )}
          </View>
        )}
        <Button title={active ? 'Update my plan' : 'Start my plan'} onPress={() => save(false)} disabled={!preview || preview.ok === false} />
        {!!ask && !!choice && (
          <View accessibilityRole="alert" style={{ padding: 12, borderRadius: 14, backgroundColor: colors.chipBg, marginTop: 10 }}>
            <Text style={{ fontWeight: '800', color: colors.ink }}>Keep your old start, or start fresh?</Text>
            {hide ? <Text style={[S.muted, { marginTop: 2, color: colors.ink }]}>Your plan has an earlier start weight than today.</Text>
              : <WeightReveal compact reaction={false} text={`Your plan started at ${choice.keep.startKg} kg on ${choice.keep.startDate}. Today you are ${choice.fresh.startKg} kg.`} style={[S.muted, { marginTop: 2, color: colors.ink }]} />}
            <Text style={[S.muted, { marginTop: 4, color: colors.ink }]}>Keeping it counts all the progress you have made. Starting fresh sets today as the new start, so progress begins again at zero.</Text>
            <Button title="Keep my old start" onPress={() => confirmStart('keep')} />
            <Button title="Start fresh from today" onPress={() => confirmStart('fresh')} />
            <Chip small label="Cancel" onPress={() => setAsk(null)} />
          </View>
        )}
      </View>

      {active && d.focus?.length > 0 && (
        <View style={S.card}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 6 }}>Weekly focus habits</Text>
          {d.focus.map((f: any) => <Text key={f.id} style={{ color: colors.ink, marginBottom: 4 }}>{f.icon} {f.title}  {f.done ? '✓' : `${f.value}/${f.target}`}</Text>)}
          <Text style={[S.muted, { marginTop: 4 }]}>Chosen from where you have the most room to grow. They refresh when you update your plan.</Text>
        </View>
      )}

      <View style={S.card}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 2 }}>🎁 Reward ladder</Text>
        <Text style={[S.muted, { marginBottom: 8 }]}>Choose your own non-food rewards at milestones (new shoes at 3 kg, a trip at goal).</Text>
        {d.rewards.map((r: any) => (
          <View key={r.id} style={[S.between, { marginBottom: 8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{r.reached ? '🎉' : '🔒'} {r.text}</Text>
              {hide ? <Text style={S.muted}>••{r.claimedAt ? ' · enjoyed' : r.reached ? ' · unlocked!' : ''}</Text> : <WeightReveal compact reaction={false} text={`at ${r.atKg} kg lost${r.claimedAt ? ' · enjoyed' : r.reached ? ' · unlocked!' : ` · ${r.remainingKg} kg to go`}`} style={S.muted} />}
            </View>
            {r.reached && !r.claimedAt && <Chip small label="I enjoyed it" onPress={() => run(() => post(`/api/plan/rewards/${r.id}/claim?today=${today()}`, {}), 'Enjoy it. You earned it.')} />}
            <TouchableOpacity onPress={() => run(() => del(`/api/plan/rewards/${r.id}`), 'Removed.')} accessibilityLabel={`Remove ${r.text}`}><Text style={S.delete}>✕</Text></TouchableOpacity>
          </View>
        ))}
        <Field label="After losing (kg)" value={rAt} onChangeText={setRAt} keyboardType="decimal-pad" placeholder="3" />
        <Field label="Reward" value={rText} onChangeText={setRText} placeholder="New running shoes" />
        <Button title="Add reward" onPress={addReward} />
      </View>

      <View style={S.card}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 2 }}>🎉 Event mode</Text>
        <Text style={[S.muted, { marginBottom: 8 }]}>Diwali, a wedding, a trip. We bank a little room in the days before, relax during, and recover gently after, with no pressure.</Text>
        {(d.plan.events || []).map((e: any) => (
          <View key={e.id} style={[S.between, { marginBottom: 6 }]}><Text style={{ color: colors.ink, fontWeight: '700' }}>{e.title} · {e.startDate}{e.endDate !== e.startDate ? ` → ${e.endDate}` : ''}</Text><TouchableOpacity onPress={() => run(() => del(`/api/plan/events/${e.id}`), 'Removed.')}><Text style={S.delete}>✕</Text></TouchableOpacity></View>
        ))}
        {d.event?.phase !== 'none' && <Text style={[S.muted, { marginBottom: 8 }]}>{d.event.message}</Text>}
        <Field label="Event" value={eTitle} onChangeText={setETitle} placeholder="Diwali" />
        <DateTimeField label="Starts" mode="date" value={eStart} onChange={(v) => { setEStart(v); if (eEnd < v) setEEnd(v); }} />
        <DateTimeField label="Ends" mode="date" value={eEnd} onChange={setEEnd} />
        <Button title="Add event" onPress={addEvent} />
      </View>

      <View style={S.card}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 2 }}>🌿 Maintenance break</Text>
        <Text style={[S.muted, { marginBottom: 8 }]}>{d.break?.message || 'After 8–12 weeks of dieting, two weeks at maintenance helps your body and your head. Your goal date moves by those two weeks, nothing else.'}</Text>
        {d.plan.breakUntil ? (
          <Button title={`On a break until ${d.plan.breakUntil}. End it now`} onPress={() => run(() => post(`/api/plan/break?today=${today()}`, { action: 'end' }), 'Break ended. Your plan target is back.')} />
        ) : (
          <Button title="Start a 2-week maintenance break" onPress={async () => { if (await confirm({ title: 'Start a maintenance break?', message: 'Your calorie target is set to maintenance for 14 days, then goes back to your plan.', confirmText: 'Start' })) run(() => post(`/api/plan/break?today=${today()}`, { action: 'start' }), 'Break started.'); }} />
        )}
      </View>

      <View style={S.card}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 2 }}>🔮 What if…?</Text>
        <Text style={[S.muted, { marginBottom: 8 }]}>"If I have this biryani, when do I reach my goal?" (a restaurant biryani is roughly 900 kcal)</Text>
        <Field label="Extra calories" value={extra} onChangeText={setExtra} keyboardType="number-pad" />
        <Text style={S.label}>How often?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {[['0', 'Just once'], ['1', 'Weekly'], ['3', '3× a week'], ['7', 'Every day']].map(([v, l]) => <Chip key={v} small label={l} active={repeats === v} onPress={() => setRepeats(v)} />)}
        </View>
        <Button title="Show me" onPress={runWhatIf} />
        {wi && (
          <View style={{ marginTop: 10 }}>
            <Text style={{ fontWeight: '800', color: colors.ink }}>{wi.message}</Text>
            <Text style={[S.muted, { marginTop: 4 }]}>On plan: {wi.baseDate}{wi.newDate ? ` · with this: ${wi.newDate}` : ''}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 60, marginTop: 8 }} accessibilityLabel="Projection chart">
              {wi.series.filter((_: any, i: number) => i % Math.max(1, Math.ceil(wi.series.length / 24)) === 0).map((p: any) => {
                const max = wi.series[0].plan; const min = wi.series[wi.series.length - 1].plan;
                const h = (v: number) => 6 + (54 * (v - Math.min(min, p.low, p.high)) ) / Math.max(1, Math.abs(max - min) + 2);
                return <View key={p.week} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}><View style={{ width: 4, height: Math.max(4, Math.abs(h(p.low) - h(p.high))), backgroundColor: colors.chipBg }} /><View style={{ width: 4, height: 4, backgroundColor: colors.primarySolid, marginTop: 1 }} /></View>;
              })}
            </View>
          </View>
        )}
      </View>

      <View style={S.card}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 2 }}>💛 Safety & comfort</Text>
        <Text style={[S.muted, { marginBottom: 8 }]}>Weights are always blurred until you tap them. "Hide calorie numbers" also hides calorie counts everywhere. The plan keeps working behind the scenes.</Text>
        <Chip label={hide ? 'Calorie numbers are hidden' : 'Hide calorie numbers'} active={hide} onPress={() => run(async () => { await updateProfile({ safety: { hideNumbers: !hide } }); }, hide ? 'Numbers are visible again.' : 'Numbers are hidden.')} />
        {d.safety.flags.map((f: any) => <View key={f.id} style={{ marginTop: 10 }}><Text style={{ fontWeight: '800', color: colors.ink }}>💛 {f.title}</Text><Text style={S.muted}>{f.detail}</Text></View>)}
      </View>
    </Screen>
  );
}
