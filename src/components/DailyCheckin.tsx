// Home: a calm daily check-in. Asks only for what is missing today and saves it with the same offline-safe writes the other screens use.
import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, Field, useThemedStyles } from './UI';
import { Chip } from './Chip';
import { useNotifications } from './Notifications';
import { today } from '../config/api';
import { newClientId, write } from '../utils/offline';
import { successHaptic } from '../utils/haptics';
import { refreshProfile, useProfile } from '../hooks/useProfile';
import { parseWeightInput } from '../utils/units';
import { DISMISS_KEY, CheckinItem, parseGrams, proteinKcal } from '../utils/dailyCheckin';

export function DailyCheckin({ items, onSaved, onDismiss }: { items: CheckinItem[]; onSaved: () => void; onDismiss: () => void }) {
  const { S, colors } = useThemedStyles();
  const { success, error, warning } = useNotifications();
  const { units } = useProfile();
  const [weight, setWeight] = useState('');
  const [protein, setProtein] = useState('');
  const [water, setWater] = useState(0);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const w = items.includes('weight') && weight.trim() ? parseWeightInput(weight, units.weight) : null;
    const g = items.includes('protein') && protein.trim() ? parseGrams(protein) : null;
    if (items.includes('weight') && weight.trim() && !w) return warning('Check the weight', `Enter a valid weight in ${units.weight}.`);
    if (items.includes('protein') && protein.trim() && !g) return warning('Check the protein', 'Enter whole grams, for example 30.');
    if (!w && !g && !water) return warning('Nothing to save yet', 'Add a weigh-in, some protein or some water, or tap Not today.');
    setBusy(true);
    try {
      if (w) { const scaleId = (await AsyncStorage.getItem('ff_last_weight_scale').catch(() => null)) || undefined; await write('POST', '/api/weight', { date: today(), weightKg: w, ...(scaleId ? { scaleId } : {}), clientId: newClientId('wt') }, 'Weight entry'); } // the scale you used last
      if (g) await write('POST', '/api/food-logs/quick', { date: today(), mealType: 'snacks', name: 'Protein check-in', calories: proteinKcal(g), protein: g, clientId: newClientId('pc') }, 'Protein check-in');
      if (water) await write('POST', '/api/water', { date: today(), amountMl: water, clientId: newClientId('w') }, `Water ${water} ml`);
      successHaptic();
      success('Check-in saved', 'Thank you. This keeps your 7-day average honest.');
      if (w) refreshProfile();
      onSaved();
    } catch (e: any) { error('Could not save', e?.message || 'Please try again.'); } finally { setBusy(false); }
  };

  const notToday = async () => { try { await AsyncStorage.setItem(DISMISS_KEY, today()); } catch { /* keep going */ } onDismiss(); };

  return (
    <View style={[S.card, { marginBottom: 12 }]} testID="daily-checkin">
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>Daily check-in</Text>
      <Text style={[S.muted, { marginBottom: 6 }]}>Two minutes, and your 7-day average gets more accurate.</Text>
      {items.includes('weight') && <Field label={`Today's weigh-in (${units.weight})`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="Optional" />}
      {items.includes('protein') && (
        <>
          <Field label="Protein so far that is not logged yet (g)" value={protein} onChangeText={setProtein} keyboardType="number-pad" placeholder="Optional" />
          {!!parseGrams(protein) && <Text style={[S.muted, { marginTop: -6, marginBottom: 6 }]}>Saved as an estimate of about {proteinKcal(parseGrams(protein) as number)} kcal.</Text>}
        </>
      )}
      {items.includes('water') && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
          <Text style={[S.muted, { width: '100%', marginBottom: 4 }]}>Water to add now</Text>
          {[0, 250, 500, 750].map((ml) => <Chip key={ml} small label={ml ? `+${ml} ml` : 'None'} active={water === ml} onPress={() => setWater(ml)} />)}
        </View>
      )}
      <Button title={busy ? 'Saving…' : 'Save check-in'} onPress={save} disabled={busy} />
      <TouchableOpacity onPress={notToday} accessibilityRole="button" accessibilityLabel="Not today" style={{ alignSelf: 'center', paddingVertical: 10 }}><Text style={{ color: colors.primary, fontWeight: '700' }}>Not today</Text></TouchableOpacity>
    </View>
  );
}
