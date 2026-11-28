// Import food logs or weight history from another app's CSV: choose columns, see a dry-run summary, then confirm. The same file twice adds nothing.
import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Screen, Button, useThemedStyles } from '../components/UI';
import { Chip } from '../components/Chip';
import { useNotifications } from '../components/Notifications';
import { post } from '../config/api';

const LABEL: Record<string, string> = { date: 'Date', meal: 'Meal', food: 'Food name', calories: 'Calories', protein: 'Protein', carbohydrates: 'Carbs', fat: 'Fat', fiber: 'Fibre', sugar: 'Sugar', sodium: 'Sodium', weight: 'Weight' };

// expo-document-picker is optional: when it is not installed the paste box still works.
function getPicker(): any { try { return require('expo-document-picker'); } catch { return null; } }

export default function ImportData() {
  const { S, colors } = useThemedStyles();
  const { success, error } = useNotifications();
  const [csv, setCsv] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState('');
  const [mapping, setMapping] = useState<Record<string, number> | null>(null);
  const [order, setOrder] = useState('dmy');
  const [pv, setPv] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<string | null>(null); // field whose column is being chosen

  const call = (path: string, over: any = {}) =>
    post<any>(`/api/import/${path}`, { csv, kind: over.kind ?? (kind || undefined), mapping: over.mapping ?? mapping ?? undefined, dateOrder: over.order ?? order });
  const preview = async (over: any = {}) => {
    setBusy(true);
    try { const j = await call('preview', over); setPv(j); setKind(j.kind); setMapping(j.mapping); }
    catch (e: any) { error('Could not read that file', e.network ? 'Import needs a connection.' : e.message); setPv(null); } finally { setBusy(false); }
  };
  const chooseFile = async () => {
    const P = getPicker();
    if (!P) return error('File picking is not available', 'Paste the contents of the CSV into the box instead.');
    try {
      const r = await P.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'], copyToCacheDirectory: true });
      const a = r?.assets?.[0]; if (r?.canceled || !a) return;
      if (a.size && a.size > 3_000_000) return error('File too big', 'That file is over 3 MB. Split it into smaller files.');
      setCsv(await FileSystem.readAsStringAsync(a.uri)); setName(a.name || 'file'); setPv(null); setMapping(null); setKind('');
    } catch (e: any) { error('Could not open that file', e.message); }
  };
  const setCol = (field: string, idx: number | null) => {
    const m = { ...(mapping || {}) }; if (idx === null) delete m[field]; else m[field] = idx;
    setMapping(m); setPick(null); preview({ mapping: m });
  };
  const commit = async () => {
    setBusy(true);
    try { const j = await call('commit'); success('Imported', `${j.saved} added. Skipped ${j.skippedDuplicates} already here and ${j.skippedProblems} with problems.`); setPv(null); setCsv(''); setName(''); }
    catch (e: any) { error('Import failed', e.message); } finally { setBusy(false); }
  };
  const s = pv?.summary;
  return (
    <Screen buddy="chart" buddySays="Bring your history!">
      <Text style={{ fontSize: 22, fontWeight: '800', color: colors.ink }}>Import from another app</Text>
      <Text style={[S.muted, { marginVertical: 6 }]}>Works with CSV files from MyFitnessPal, HealthifyMe or any spreadsheet. Export formats change, so you check the columns before anything is saved.</Text>
      <Button title="Choose a CSV file" onPress={chooseFile} />
      <Text style={S.label}>…or paste the CSV text</Text>
      <TextInput accessibilityLabel="Paste CSV text" style={[S.input, { minHeight: 110, textAlignVertical: 'top' }]} multiline value={csv} onChangeText={(v) => { setCsv(v); setName('pasted text'); setPv(null); setMapping(null); setKind(''); }} placeholder={'Date,Meal,Food,Calories\n2026-09-01,Lunch,Dal rice,520'} placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} />
      {!!csv.trim() && <Button title={busy ? 'Reading…' : `Read ${name || 'file'}`} disabled={busy} onPress={() => preview()} />}
      {pv && (
        <View style={{ marginTop: 12 }}>
          <Text style={S.label}>It contains</Text>
          <View style={{ flexDirection: 'row' }}>
            <Chip small label="Food logs" active={kind === 'food'} onPress={() => { setKind('food'); preview({ kind: 'food', mapping: undefined }); }} />
            <Chip small label="Weight history" active={kind === 'weight'} onPress={() => { setKind('weight'); preview({ kind: 'weight', mapping: undefined }); }} />
          </View>
          <Text style={S.label}>Dates like 03/04/2026 are</Text>
          <View style={{ flexDirection: 'row' }}>
            <Chip small label="day / month" active={order === 'dmy'} onPress={() => { setOrder('dmy'); preview({ order: 'dmy' }); }} />
            <Chip small label="month / day" active={order === 'mdy'} onPress={() => { setOrder('mdy'); preview({ order: 'mdy' }); }} />
          </View>
          <Text style={S.label}>Columns (tap one to change)</Text>
          {pv.fields.map((f: string) => (
            <View key={f}>
              <TouchableOpacity onPress={() => setPick(pick === f ? null : f)} accessibilityRole="button" accessibilityLabel={`${LABEL[f] || f} column`} style={[S.row, { minHeight: 44 }]}>
                <Text style={{ flex: 1, color: colors.ink, fontWeight: '700' }}>{LABEL[f] || f}</Text>
                <Text style={{ color: colors.primary }}>{mapping?.[f] !== undefined ? (pv.headers[mapping[f]] || `Column ${mapping[f] + 1}`) : '(not in file)'}</Text>
              </TouchableOpacity>
              {pick === f && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  <Chip small label="(not in file)" onPress={() => setCol(f, null)} />
                  {pv.headers.map((h: string, i: number) => <Chip key={i} small label={h || `Column ${i + 1}`} active={mapping?.[f] === i} onPress={() => setCol(f, i)} />)}
                </View>
              )}
            </View>
          ))}
          {pv.missing?.length > 0 && <Text style={{ color: colors.muted, marginTop: 6 }}>Choose the {pv.missing.join(' and ')} column to continue.</Text>}
          {s && (
            <View style={{ marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: colors.chipBg }}>
              <Text style={{ fontWeight: '800', color: colors.ink }}>Dry run: nothing is saved yet</Text>
              <Text style={S.muted}>{s.toImport} to import{s.from ? `, ${s.from} to ${s.to} (${s.days} day${s.days === 1 ? '' : 's'})` : ''}. {s.duplicates} already in the app, {s.problems} with problems.{s.totalKcal !== undefined ? ` ${Number(s.totalKcal).toLocaleString()} kcal in total.` : ''}</Text>
              {s.ambiguousDates > 0 && <Text style={S.muted}>{s.ambiguousDates} dates could be read two ways. Check the day / month setting above.</Text>}
              {s.blankMacros > 0 && <Text style={S.muted}>{s.blankMacros} protein, carb or fat cells were blank and are saved as 0, not guessed.</Text>}
              {s.problemSample?.map((p: any) => <Text key={p.line} style={S.muted}>Row {p.line}: {p.message}</Text>)}
              {s.sample?.length > 0 && <Text style={S.muted}>First rows: {s.sample.slice(0, 4).map((r: any) => `${r.date} ${r.name || `${r.weightKg} kg`}`).join(' · ')}</Text>}
              <View style={{ marginTop: 8 }}><Button title={`Import ${s.toImport}`} disabled={busy || !s.toImport} onPress={commit} /></View>
            </View>
          )}
          {!!pv.cultNote && <Text style={[S.muted, { marginTop: 8 }]}>{pv.cultNote}</Text>}
        </View>
      )}
    </Screen>
  );
}
