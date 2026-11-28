import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { del, patch, post } from '../config/api';
import { Button, Field, useThemedStyles } from './UI';
import { useNotifications } from './Notifications';

export type Scale = { id: string; name: string; mode: 'auto' | 'manual'; offsetKg: number; learnedKg: number | null; samples: number; entries?: number };

const sign = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(1)}`;

/** One line saying how a scale is calibrated (kg: the offsets are stored metric, like every weight). */
export function offsetNote(s: Scale, ref: Scale): string {
  if (s.id === ref.id) return 'Main scale: every other scale is matched to this one.';
  if (s.mode === 'manual') return `Set by you: reads ${sign(s.offsetKg)} kg vs ${ref.name}.`;
  if (s.learnedKg == null) return `Not matched yet. Weigh on this scale and on ${ref.name} the same day, or enter the difference by hand.`;
  return `Reads ${sign(s.offsetKg)} kg vs ${ref.name} (learned from ${s.samples} same-day ${s.samples === 1 ? 'pair' : 'pairs'}).`;
}

/** Add, rename, calibrate, switch main, delete. Needs the network (the server recalibrates every number); `onChanged` reloads. */
export function WeightScales({ scales, referenceId, onChanged, onPick }: { scales: Scale[]; referenceId: string; onChanged: () => Promise<void> | void; onPick?: (id: string) => void }) {
  const { S, colors } = useThemedStyles();
  const { error, success, confirm } = useNotifications();
  const ref = scales.find((s) => s.id === referenceId) || scales[0];
  const [name, setName] = useState('');
  const [diff, setDiff] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', offset: '' });

  const run = async <T,>(fn: () => Promise<T>, done?: string): Promise<T | null> => {
    try { setBusy(true); const r = await fn(); if (done) success(done); await onChanged(); return r; }
    catch (e: any) { error('Could not update scales', e?.message || 'Check your connection and try again.'); return null; }
    finally { setBusy(false); }
  };
  const num = (t: string) => Number(t.replace(',', '.'));

  const add = async () => {
    if (!name.trim()) return;
    const body: any = { name: name.trim() };
    if (diff.trim() !== '') { if (!Number.isFinite(num(diff))) return error('Check the difference', 'Enter a number of kg, like 0.8 or -1.2.'); body.offsetKg = num(diff); }
    const r: any = await run(() => post('/api/weight/scales', body), `Added ${name.trim()}`);
    if (r) { setName(''); setDiff(''); onPick?.(r.scale.id); }
  };
  const startEdit = (s: Scale) => { setEdit(s.id); setDraft({ name: s.name, offset: s.mode === 'manual' || s.learnedKg == null ? String(s.offsetKg) : '' }); };
  const save = (s: Scale) => {
    const body: any = { name: draft.name };
    if (s.id !== referenceId && draft.offset.trim() !== '') { if (!Number.isFinite(num(draft.offset))) return error('Check the difference', 'Enter a number of kg.'); body.offsetKg = num(draft.offset); }
    return run(async () => { await patch(`/api/weight/scales/${encodeURIComponent(s.id)}`, body); setEdit(null); }, 'Saved');
  };
  const useLearned = (s: Scale) => run(() => patch(`/api/weight/scales/${encodeURIComponent(s.id)}`, { mode: 'auto' }), 'Using the learned difference');
  const makeMain = async (s: Scale) => { if (await confirm({ title: `Make ${s.name} your main scale?`, message: 'Nothing is deleted. Every weight is shown in this scale’s terms from now on.', confirmText: 'Make main' })) run(() => post(`/api/weight/scales/${encodeURIComponent(s.id)}/reference`, {}), `${s.name} is now your main scale`); };
  const remove = async (s: Scale) => { if (await confirm({ title: `Delete ${s.name}?`, message: `Its weigh-ins are kept: they move to ${ref.name}, adjusted so your trend does not change.`, confirmText: 'Delete', destructive: true })) run(() => del(`/api/weight/scales/${encodeURIComponent(s.id)}`), `Deleted ${s.name}`); };

  const link = { color: colors.primary, fontWeight: '800' as const, paddingVertical: 6, paddingHorizontal: 4 };
  return (
    <View style={S.card}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink, marginBottom: 4 }}>My scales</Text>
      <Text style={[S.muted, { marginBottom: 10 }]}>Different scales read differently. Name each one and pick it when you log. Trends, charts and your calorie plan use the weight adjusted to {ref.name}, so switching scales never looks like gaining or losing.</Text>
      {scales.map((s) => (
        <View key={s.id} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
          {edit === s.id ? (
            <View>
              <Field label="Name" value={draft.name} onChangeText={(t) => setDraft({ ...draft, name: t })} />
              {s.id !== referenceId && <Field label={`Reads how many kg vs ${ref.name}? (empty = learn it)`} value={draft.offset} onChangeText={(t) => setDraft({ ...draft, offset: t })} keyboardType="numbers-and-punctuation" placeholder="e.g. 0.8" />}
              <Button title="Save" onPress={() => save(s)} disabled={busy} />
              <TouchableOpacity onPress={() => setEdit(null)} accessibilityRole="button"><Text style={[link, { textAlign: 'center' }]}>Cancel</Text></TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={{ fontWeight: '800', color: colors.ink }}>{s.name}{s.id === referenceId ? '  · main' : ''}</Text>
              <Text style={S.muted}>{offsetNote(s, ref)}{s.entries ? ` · ${s.entries} weigh-in${s.entries === 1 ? '' : 's'}` : ''}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
                <TouchableOpacity onPress={() => startEdit(s)} accessibilityRole="button"><Text style={link}>Edit</Text></TouchableOpacity>
                {s.id !== referenceId && s.mode === 'manual' && s.learnedKg != null && <TouchableOpacity onPress={() => useLearned(s)} disabled={busy} accessibilityRole="button"><Text style={link}>Use learned</Text></TouchableOpacity>}
                {s.id !== referenceId && <TouchableOpacity onPress={() => makeMain(s)} disabled={busy} accessibilityRole="button"><Text style={link}>Make main</Text></TouchableOpacity>}
                {s.id !== referenceId && <TouchableOpacity onPress={() => remove(s)} disabled={busy} accessibilityRole="button"><Text style={[link, { color: colors.danger }]}>Delete</Text></TouchableOpacity>}
              </View>
            </View>
          )}
        </View>
      ))}
      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
        <Field label="New scale" value={name} onChangeText={setName} placeholder="e.g. Gym scale" />
        <Field label={`Reads how many kg vs ${ref.name}? (optional)`} value={diff} onChangeText={setDiff} keyboardType="numbers-and-punctuation" placeholder="leave empty to learn it" />
        <Button title="Add scale" onPress={add} disabled={busy || !name.trim()} />
      </View>
    </View>
  );
}
