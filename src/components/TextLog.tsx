import React, { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from './UI';
import { Chip } from './Chip';
import { useNotifications } from './Notifications';
import { post, today } from '../config/api';
import { write } from '../utils/offline';
import { VoiceMic } from './VoiceMic';

type Item = { foodId: string; foodName: string; quantity: string; servingUnit: string; confidence: string };

/** "2 roti, dal, 1 cup rice" → matched foods you can adjust, then logged together (each entry works offline like any other log). */
export function TextLog({ meal, onLogged, initialText }: { meal: string; onLogged: () => void; initialText?: string }) {
  const { S, colors } = useThemedStyles();
  const { error, success, warning } = useNotifications();
  const [text, setText] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState(false);

  // A photo was read into text: show it and match it straight away, so the person only has to review and tap Log.
  useEffect(() => { if (initialText) { setText(initialText); find(initialText); } }, [initialText]);

  const find = async (override?: string, spoken = false) => {
    const t = typeof override === 'string' ? override : text;
    if (!t.trim()) return;
    setBusy(true);
    setVoice(spoken);
    try {
      const r = await post<any>('/api/foods/parse', { text: t, spoken });
      if (spoken) setText(r.heardText || t);
      setItems((r.items || []).map((i: any) => ({ ...i, quantity: String(i.quantity) })));
      setUnmatched(r.unmatched || []);
      if (!r.items?.length) warning('No foods matched', 'Try simpler names, like “roti, dal, rice”.');
    } catch (e: any) {
      error('Could not read that', e.network ? 'Typing a meal needs a connection — use search while offline.' : e.message);
    } finally { setBusy(false); }
  };

  const logAll = async () => {
    if (!items?.length) return;
    setBusy(true);
    try {
      const r = await write('POST', '/api/food-logs/bulk', { date: today(), mealType: meal, source: voice ? 'voice' : '', clientId: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, items: items.map((it) => ({ foodId: it.foodId, quantity: Number(it.quantity) || 1 })) }, `${items.length} foods`);
      if (r.data?.sticker === 'voice') success('Sticker unlocked 🎤', 'Mic Check! Your first spoken meal.');
      success('Logged', `${items.length} item${items.length === 1 ? '' : 's'} added to ${meal}.`);
      setText(''); setItems(null); setUnmatched([]);
      onLogged();
    } catch (e: any) { error('Could not log everything', e.message); } finally { setBusy(false); }
  };

  return (
    <View style={S.card}>
      <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16 }}>✍️ Type what you ate</Text>
      <Text style={[S.muted, { marginBottom: 10 }]}>e.g. “2 roti, dal, 1 cup rice, 100 g paneer” → logged to {meal}</Text>
      <TextInput accessibilityLabel="Describe your meal" style={S.input} value={text} onChangeText={setText} placeholder="What did you eat?" placeholderTextColor={colors.muted} multiline maxLength={600} />
      <VoiceMic onText={(t) => { setText(t); find(t, true); }} onError={(m) => warning('Voice', m)} />
      <TouchableOpacity accessibilityRole="button" disabled={busy || !text.trim()} onPress={() => find(text, false)} style={[S.button, { opacity: busy || !text.trim() ? 0.5 : 1 }]}><Text style={S.buttonText}>{busy && !items ? 'Reading…' : 'Find foods'}</Text></TouchableOpacity>
      {!!items?.length && (
        <View style={{ marginTop: 12 }}>
          {voice && <Text style={[S.muted, { marginBottom: 6 }]}>Check what I heard, then log.</Text>}
          {items.map((it, i) => (
            <View key={`${it.foodId}-${i}`} style={[S.row, { marginBottom: 8 }]}>
              <Text style={{ flex: 1, color: colors.ink, fontWeight: '600' }} numberOfLines={2}>{it.foodName}{it.confidence === 'medium' ? ' ?' : ''}</Text>
              <TextInput accessibilityLabel={`Quantity of ${it.foodName}`} style={[S.input, { width: 80, marginBottom: 0, minHeight: 44, paddingVertical: 8 }]} keyboardType="decimal-pad" value={it.quantity} onChangeText={(v) => setItems(items.map((x, j) => (j === i ? { ...x, quantity: v } : x)))} />
              <Text style={{ width: 34, marginLeft: 6, color: colors.muted }}>{it.servingUnit}</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${it.foodName}`} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => setItems(items.filter((_, j) => j !== i))}><Text style={S.delete}>✕</Text></TouchableOpacity>
            </View>
          ))}
          {!!unmatched.length && <Text style={S.muted}>Couldn’t find: {unmatched.join(', ')} — add with search.</Text>}
          <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={logAll} style={[S.button, { opacity: busy ? 0.5 : 1 }]}><Text style={S.buttonText}>Log {items.length} item{items.length === 1 ? '' : 's'}</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
}
