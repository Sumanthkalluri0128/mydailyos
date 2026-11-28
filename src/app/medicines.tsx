// Medicine and supplement checklist. Private: lives in the account, included in the data export, deleted with the account.
// A reminder tool, not medical advice. Reminders follow your quiet hours (Reminders & alerts).
import { useCallback, useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, useThemedStyles } from '../components/UI';
import { useNotifications } from '../components/Notifications';
import { Chip } from '../components/Chip';
import { DateTimeField } from '../components/DateTimeField';
import { del, get, post, put, today } from '../config/api';
import { refreshMedsNow } from '../utils/notifications';
import { MED_NOTE } from '../utils/medNudge';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const nowHm = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
type Form = { _id?: string; name: string; dose: string; kind: 'medicine' | 'supplement'; times: string[]; days: number[]; notes: string };

export default function Medicines() {
  const { S, colors } = useThemedStyles();
  const { error, undoableDelete } = useNotifications();
  const [d, setD] = useState<any>(null);
  const [form, setForm] = useState<Form | null>(null);
  const load = useCallback(async () => { try { setD(await get<any>(`/api/meds?date=${today()}&now=${nowHm()}`)); } catch (e: any) { error('Could not load', e.network ? 'This needs a connection.' : e.message); } }, [error]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (it: any) => {
    try { setD(await post<any>(`/api/meds/${it.medId}/take`, { date: today(), time: it.time, taken: !it.taken, now: nowHm() })); refreshMedsNow(it.taken ? [] : [`${today()}|${it.medId}|${it.time}`]); }
    catch (e: any) { error('Could not save', e.network ? 'This needs a connection.' : e.message); }
  };
  const save = async () => {
    if (!form) return;
    try {
      const body = { ...form, times: form.times.filter(Boolean) };
      if (form._id) await put(`/api/meds/${form._id}`, body); else await post('/api/meds', body);
      setForm(null); await load(); refreshMedsNow();
    } catch (e: any) { error('Could not save', e.message); }
  };
  const remove = (m: any) => {
    const before = d;
    setD((cur: any) => cur && { ...cur, meds: cur.meds.filter((x: any) => x._id !== m._id), checklist: { ...cur.checklist, items: cur.checklist.items.filter((i: any) => i.medId !== m._id) } });
    undoableDelete(`"${m.name}" removed`, async () => { try { await del(`/api/meds/${m._id}`); await load(); refreshMedsNow(); } catch (e: any) { setD(before); error('Delete failed', e.message); } }, () => setD(before));
  };
  const c = d?.checklist;

  return (
    <Screen buddyWho="kakashi" buddy="health" buddySays="Small habits, steady days.">
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back"><Text style={S.back}>‹ Back</Text></TouchableOpacity>
      <Text style={S.title}>Medicines and supplements</Text>
      <View style={[S.card, { backgroundColor: colors.primarySoft }]} accessibilityRole="text"><Text style={{ color: colors.ink }}>{d?.note || MED_NOTE}</Text></View>

      {!!c && c.items.map((it: any) => (
        <TouchableOpacity key={`${it.medId}-${it.time}`} onPress={() => toggle(it)} accessibilityRole="checkbox" accessibilityState={{ checked: it.taken }} accessibilityLabel={`${it.name} at ${it.time}, ${it.taken ? 'taken' : it.state === 'due' ? 'not marked yet' : 'later'}`}
          style={[S.item, { flexDirection: 'row', alignItems: 'center', minHeight: 56 }]}>
          <Text style={{ fontSize: 24, width: 36 }}>{it.taken ? '✅' : '⬜'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', color: colors.ink, textDecorationLine: it.taken ? 'line-through' : 'none' }}>{it.time} · {it.name}{it.dose ? ` · ${it.dose}` : ''}</Text>
            <Text style={S.muted}>{it.taken ? 'Taken' : it.state === 'due' ? 'Not marked yet' : 'Later'}</Text>
          </View>
        </TouchableOpacity>
      ))}
      {!!c && c.total === 0 && <View style={S.card}><Text style={S.muted}>{d.meds.length ? 'Nothing scheduled today.' : 'Nothing here yet. Add what you take and when, then tick it off each day.'}</Text></View>}
      {!!c && c.total > 0 && <Text style={[S.muted, { marginBottom: 8 }]}>{c.taken} of {c.total} marked today</Text>}

      {!form && <TouchableOpacity style={S.button} onPress={() => setForm({ name: '', dose: '', kind: 'medicine', times: ['08:00'], days: [], notes: '' })} accessibilityRole="button"><Text style={S.buttonText}>＋ Add medicine or supplement</Text></TouchableOpacity>}

      {form && (
        <View style={S.card}>
          <Text style={S.label}>Name</Text>
          <TextInput style={S.input} value={form.name} maxLength={60} onChangeText={(v) => setForm({ ...form, name: v })} accessibilityLabel="Name" placeholderTextColor={colors.muted} />
          <Text style={S.label}>Dose (optional)</Text>
          <TextInput style={S.input} value={form.dose} maxLength={40} onChangeText={(v) => setForm({ ...form, dose: v })} placeholder="e.g. 1 tablet" accessibilityLabel="Dose" placeholderTextColor={colors.muted} />
          <View style={{ flexDirection: 'row', marginVertical: 8 }}>
            <Chip small label="Medicine" active={form.kind === 'medicine'} onPress={() => setForm({ ...form, kind: 'medicine' })} />
            <Chip small label="Supplement" active={form.kind === 'supplement'} onPress={() => setForm({ ...form, kind: 'supplement' })} />
          </View>
          {form.times.map((t, i) => <DateTimeField key={i} label={`Time ${i + 1}`} mode="time" value={t} onChange={(v) => setForm({ ...form, times: form.times.map((x, j) => (j === i ? v : x)) })} />)}
          {form.times.length < 6 && <TouchableOpacity onPress={() => setForm({ ...form, times: [...form.times, '20:00'] })} accessibilityRole="button"><Text style={{ color: colors.primary, fontWeight: '800', marginBottom: 10 }}>＋ another time</Text></TouchableOpacity>}
          <Text style={S.label}>Days (none selected = every day)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {DAYS.map((x, i) => <Chip key={i} small label={x} active={form.days.includes(i)} a11y={DAY_NAMES[i]} onPress={() => setForm({ ...form, days: form.days.includes(i) ? form.days.filter((y) => y !== i) : [...form.days, i] })} />)}
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity style={[S.button, { flex: 1 }]} onPress={save} accessibilityRole="button"><Text style={S.buttonText}>Save</Text></TouchableOpacity>
            <TouchableOpacity style={[S.button, { flex: 1, backgroundColor: colors.chipBg }]} onPress={() => setForm(null)} accessibilityRole="button"><Text style={[S.buttonText, { color: colors.ink }]}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      )}

      {!!d?.meds?.length && !form && (
        <View style={S.card}>
          <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: 6 }}>Manage</Text>
          {d.meds.map((m: any) => (
            <View key={m._id} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48 }}>
              <Text style={{ flex: 1, color: colors.ink }}>{m.name}{m.dose ? ` · ${m.dose}` : ''} · {m.times.join(', ')}{m.days.length ? ` · ${m.days.map((x: number) => DAYS[x]).join('')}` : ''}</Text>
              <TouchableOpacity onPress={() => setForm({ ...m })} style={{ padding: 10 }} accessibilityRole="button" accessibilityLabel={`Edit ${m.name}`}><Text style={{ color: colors.primary, fontWeight: '800' }}>Edit</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => remove(m)} style={{ padding: 10 }} accessibilityRole="button" accessibilityLabel={`Delete ${m.name}`}><Text style={S.delete}>Delete</Text></TouchableOpacity>
            </View>
          ))}
          <Text style={[S.muted, { marginTop: 8 }]}>Reminders follow your quiet hours. Anything that falls inside them rings when quiet time ends. Turn notifications on in Reminders & alerts.</Text>
        </View>
      )}
    </Screen>
  );
}
