// Optional accountability link: one private weekly summary page for ONE person you choose, showing only the fields you tick.
// No public feed, no leaderboard. Turn it off any time; a new link replaces the old one.
import { useCallback, useEffect, useState } from 'react';
import { Share, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, useThemedStyles } from '../components/UI';
import { Chip } from '../components/Chip';
import { useNotifications } from '../components/Notifications';
import { del, get, post, put } from '../config/api';

export default function ShareScreen() {
  const { S, colors } = useThemedStyles();
  const { error, success, confirm } = useNotifications();
  const [d, setD] = useState<any>(null);
  const [label, setLabel] = useState('');
  const [fields, setFields] = useState<string[] | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const j = await get<any>('/api/share'); setD(j); setFields((f) => f || j.link?.fields || j.defaults); setLabel((l) => l || j.link?.label || ''); }
    catch (e: any) { error('Could not load', e.network ? 'This needs a connection.' : e.message); }
  }, [error]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <Screen><Text style={S.muted}>Loading…</Text></Screen>;

  const toggle = (id: string) => setFields((f) => (f!.includes(id) ? f!.filter((x) => x !== id) : [...f!, id]));
  const create = async () => {
    if (d.link && !(await confirm({ title: 'Make a new link?', message: 'The old link stops working and your person needs the new one.', confirmText: 'Make new link' }))) return;
    setBusy(true);
    try { const j = await post<any>('/api/share', { label, fields }); setUrl(j.url); await load(); } catch (e: any) { error('Could not create', e.message); } finally { setBusy(false); }
  };
  const save = async () => { setBusy(true); try { await put('/api/share', { label, fields }); success('Saved', 'The same link now shows these fields.'); await load(); } catch (e: any) { error('Could not save', e.message); } finally { setBusy(false); } };
  const revoke = async () => {
    if (!(await confirm({ title: 'Turn off the link?', message: 'The link stops working straight away.', confirmText: 'Turn off', destructive: true }))) return;
    try { await del('/api/share'); setUrl(''); setD({ ...d, link: null }); success('Link turned off'); } catch (e: any) { error('Could not turn off', e.message); }
  };

  return (
    <Screen buddyWho="kakashi" buddy="chart" buddySays="Share only what you choose.">
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back"><Text style={S.back}>‹ Back</Text></TouchableOpacity>
      <Text style={S.title}>Share a weekly summary</Text>
      <View style={[S.card, { backgroundColor: colors.primarySoft }]}><Text style={{ color: colors.ink }}>Optional. One private page for one person you trust, like a friend or coach. It shows only what you tick, for the last 7 days. It is not public, not in any feed and not ranked. You can turn it off any time.</Text></View>
      <View style={S.card}>
        <Text style={S.label}>Who is it for? (shown to you and in the page header)</Text>
        <TextInput style={S.input} value={label} maxLength={40} onChangeText={setLabel} placeholder="e.g. Asha" placeholderTextColor={colors.muted} accessibilityLabel="Name of the person" />
        <Text style={S.label}>What can they see?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {d.fields.map((f: any) => <Chip key={f.id} small label={`${f.label}${f.health ? ' (health)' : ''}`} active={!!fields?.includes(f.id)} onPress={() => toggle(f.id)} />)}
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          {d.link ? <>
            <TouchableOpacity style={[S.button, { flex: 1 }]} onPress={save} disabled={busy} accessibilityRole="button"><Text style={S.buttonText}>Save choices</Text></TouchableOpacity>
            <TouchableOpacity style={[S.button, { flex: 1, backgroundColor: colors.chipBg }]} onPress={create} disabled={busy} accessibilityRole="button"><Text style={[S.buttonText, { color: colors.ink }]}>New link</Text></TouchableOpacity>
            <TouchableOpacity style={[S.button, { flex: 1, backgroundColor: colors.chipBg }]} onPress={revoke} accessibilityRole="button"><Text style={[S.buttonText, { color: colors.ink }]}>Turn off</Text></TouchableOpacity>
          </> : <TouchableOpacity style={[S.button, { flex: 1 }]} onPress={create} disabled={busy || !fields?.length} accessibilityRole="button"><Text style={S.buttonText}>Create private link</Text></TouchableOpacity>}
        </View>
      </View>
      {!!url && (
        <View style={S.card}>
          <Text style={{ fontWeight: '800', color: colors.ink }}>Your link (shown once, share it now)</Text>
          <Text selectable style={{ color: colors.primary, marginVertical: 8 }}>{url}</Text>
          <TouchableOpacity style={S.button} onPress={() => Share.share({ message: `${label ? `${label}, here` : 'Here'} is my private weekly FlexFit summary: ${url}` })} accessibilityRole="button"><Text style={S.buttonText}>Send it…</Text></TouchableOpacity>
        </View>
      )}
      {d.link && !url && <Text style={S.muted}>Link is on{d.link.label ? ` for ${d.link.label}` : ''}. Opened {d.link.views} time{d.link.views === 1 ? '' : 's'}{d.link.lastViewedAt ? `, last on ${new Date(d.link.lastViewedAt).toLocaleDateString()}` : ''}. For safety the address is only shown when you create it.</Text>}
    </Screen>
  );
}
