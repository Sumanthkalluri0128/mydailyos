// Where a food's numbers come from (Verified / Typical / Added by you) plus "Report wrong values".
import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from './UI';
import { useNotifications } from './Notifications';
import { write } from '../utils/offline';

const ICON: Record<string, string> = { verified: '🛡️', typical: '📊', user: '✍️' };

export function FoodTrust({ food }: { food: { _id: string; name: string; confidence?: { id: string; label: string } } }) {
  const { colors } = useThemedStyles();
  const { success, error } = useNotifications();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const c = food.confidence;
  const send = async () => {
    try { await write('POST', `/api/foods/${food._id}/report`, { note: note.trim() }, `Report: ${food.name}`); setSent(true); setAsking(false); success('Thanks!', 'We will check these values.'); }
    catch (e: any) { error('Could not send', e.message); }
  };
  return (
    <View style={{ marginTop: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        {c && <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '700', borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>{ICON[c.id] || '📊'} {c.label}</Text>}
        {sent ? <Text style={{ color: colors.muted, fontSize: 12 }}>Report sent</Text> : (
          <TouchableOpacity onPress={() => setAsking(!asking)} accessibilityRole="button" accessibilityLabel="Report wrong values" hitSlop={8} style={{ minHeight: 32, justifyContent: 'center' }}>
            <Text style={{ color: colors.muted, fontSize: 12, textDecorationLine: 'underline' }}>Report wrong values</Text>
          </TouchableOpacity>
        )}
      </View>
      {asking && (
        <View style={{ marginTop: 6 }}>
          <TextInput value={note} onChangeText={setNote} maxLength={500} placeholder="What looks wrong? (optional)" placeholderTextColor={colors.muted} accessibilityLabel="What looks wrong" style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 8, color: colors.ink }} />
          <TouchableOpacity onPress={send} accessibilityRole="button" style={{ marginTop: 6, minHeight: 40, justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>Send report</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
}
