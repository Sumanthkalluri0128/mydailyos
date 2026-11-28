import React, { useEffect, useState } from 'react';
import { Directory, Paths } from 'expo-file-system';
import { Modal, Text, TouchableOpacity, View, KeyboardAvoidingView } from 'react-native';
import { router } from 'expo-router';
import { clearSession, del, patch, post } from '../../config/api';
import { resetWidget } from '../../widgets/widgetSync';
import { clearOfflineData, read } from '../../utils/offline';
import { resetGymSync } from '../../utils/gymSyncRunner';
import { Button, Field, Screen, useThemedStyles } from '../../components/UI';
import { Chip } from '../../components/Chip';
import { targetSafety, type TargetCheck } from '../../utils/intakeSafety';
import { expectedEnergy, resolveTargets, weeksToGoal } from '../../utils/energy';
import { useNotifications } from '../../components/Notifications';
import type { ThemeMode } from '../../utils/theme';
import { exportAndShare, exportReportPdf } from '../../utils/exportData';
import { clearProfileCache, updateProfile } from '../../hooks/useProfile';
import { cancelAllReminders } from '../../utils/notifications';
import { replayTour, resumeTour, showChecklist, useSaved as useTourSaved } from '../../tour/tourStore';
import { WeightReveal } from '../../components/WeightReveal';
import { CoachLearning, ToneSettings } from '../../components/CoachCards';
import { UiSettings } from '../../components/UiSettings';
import { HealthConnectData } from '../../components/HealthConnectData';
import { isVisible, useFeatures } from '../../utils/features';
import { useT } from '../../i18n';

const THEME_OPTIONS: { key: ThemeMode; label: string; icon: string }[] = [
  { key: 'light', label: 'Light', icon: '☀️' },
  { key: 'dark', label: 'Dark', icon: '🌙' },
  { key: 'system', label: 'System', icon: '⚙️' },
];

// Shown when a typed calorie number or a chosen pace is outside the safe range: what it does and what to set instead.
function TargetWarn({ check }: { check: TargetCheck }) {
  const { S, colors } = useThemedStyles();
  if (!check) return null;
  const tint = check.level === 'alert' ? colors.danger : colors.primary;
  return (
    <View style={{ borderWidth: 1.5, borderColor: tint, borderRadius: 14, padding: 12, marginBottom: 12 }} accessibilityRole="alert">
      <Text style={{ fontWeight: '800', color: check.level === 'alert' ? colors.danger : colors.ink }}>{check.title}</Text>
      <Text style={[S.muted, { marginTop: 3 }]}>{check.detail}</Text>
      {check.effects.map((t, i) => <Text key={i} style={{ color: colors.ink, fontSize: 12.5, lineHeight: 18, marginTop: 3 }}>• {t}</Text>)}
      <Text style={{ fontWeight: '700', color: colors.ink, marginTop: 8, fontSize: 13 }}>Safer way</Text>
      {check.fix.map((t, i) => <Text key={i} style={{ color: colors.ink, fontSize: 12.5, lineHeight: 18, marginTop: 2 }}>{i + 1}. {t}</Text>)}
    </View>
  );
}

export default function Profile() {
  useFeatures(); useT();
  const tourSaved = useTourSaved();
  const [profile, setProfile] = useState<any>(null);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [calories, setCalories] = useState('');
  const [calMode, setCalMode] = useState<'auto' | 'manual'>('auto');
  const [protein, setProtein] = useState('');
  const [water, setWater] = useState('');
  const [exerciseMin, setExerciseMin] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null);
  const { error, success, confirm } = useNotifications();
  const { S, colors, mode, setMode } = useThemedStyles();

  // change password modal
  const [pwModal, setPwModal] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  async function load() {
    try {
      const data: any = await read('/api/profile');
      const p = data.profile;
      setProfile(p);
      setName(p.name || '');
      setAge(p.age ? String(p.age) : '');
      setHeight(p.heightCm ? String(p.heightCm) : '');
      setWeight(p.currentWeightKg ? String(p.currentWeightKg) : '');
      setCalMode(p.goals?.calorieMode === 'manual' ? 'manual' : 'auto');
      setCalories(String(p.goals?.calorieTarget || 1800));
      setProtein(p.goals?.proteinTarget ? String(p.goals.proteinTarget) : ''); // blank = automatic
      setWater(String(p.goals?.waterTargetMl || 3000));
      setExerciseMin(String(p.goals?.exerciseMinutesTarget || 30));
      setTargetWeight(p.goals?.targetWeightKg ? String(p.goals.targetWeightKg) : '');
    } catch (e: any) { error('Profile unavailable', e.message); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true);
    try {
      await updateProfile({
        name, age: age ? Number(age) : null, heightCm: height ? Number(height) : null,
        currentWeightKg: weight ? Number(weight) : null, activityLevel: profile?.activityLevel || 'moderate',
        sex: profile?.sex || '',
        goals: {
          calorieMode: calMode,
          ...(calMode === 'manual' && Number(calories) >= 500 ? { calorieTarget: Number(calories) } : {}),
          proteinTarget: protein.trim() ? Number(protein) : null, waterTargetMl: Number(water),
          exerciseMinutesTarget: Number(exerciseMin), stepsTarget: profile?.goals?.stepsTarget || 10000,
          targetWeightKg: targetWeight ? Number(targetWeight) : null,
        },
      });
      success('Profile saved', 'Your goals and details were updated.');
      await load();
    } catch (e: any) { error('Save failed', e.message); } finally { setBusy(false); }
  }

  async function setUnit(key: 'weight' | 'energy' | 'volume', value: string) {
    try {
      const next = await updateProfile({ units: { ...profile.units, [key]: value } });
      setProfile(next);
    } catch (e: any) { error('Could not update units', e.message); }
  }

  async function logout() {
    await clearSession();
    resetWidget();
    await clearOfflineData(); await resetGymSync();
    clearProfileCache();
    router.replace('/login');
  }

  async function changePassword() {
    if (newPw.length < 8) return error('Password too short', 'Use at least 8 characters.');
    setPwBusy(true);
    try {
      await post('/api/account/change-password', { currentPassword: curPw, newPassword: newPw });
      setPwModal(false); setCurPw(''); setNewPw('');
      success('Password changed', 'Use your new password next time you log in.');
    } catch (e: any) { error('Could not change password', e.message); } finally { setPwBusy(false); }
  }

  async function doExport(format: 'csv' | 'json') {
    setExporting(format);
    try { await exportAndShare(format); }
    catch (e: any) { error('Export failed', e.message); }
    finally { setExporting(null); }
  }

  const [reporting, setReporting] = useState(false);
  async function doReport() {
    setReporting(true);
    try { await exportReportPdf(30, true); }
    catch (e: any) { error('Report failed', e.network ? 'The report needs a connection.' : e.message); }
    finally { setReporting(false); }
  }
  async function setWeeklyEmail(on: boolean) {
    try {
      const r: any = await patch('/api/profile', { notify: { weeklyEmail: on } });
      setProfile(r.profile || { ...profile, notify: { weeklyEmail: on } });
      success(on ? 'Weekly email on' : 'Weekly email off', on ? 'You\u2019ll get a summary every Monday.' : 'No more weekly emails.');
    } catch (e: any) { error('Could not save', e.message); }
  }
  async function setBackupEmail(on: boolean) {
    try {
      const r: any = await patch('/api/profile', { notify: { backupEmail: on } });
      setProfile(r.profile || { ...profile, notify: { ...(profile?.notify || {}), backupEmail: on } });
      success(on ? 'Backup email on' : 'Backup email off', on ? 'Your data arrives by email every Sunday.' : 'No more backup emails.');
    } catch (e: any) { error('Could not save', e.message); }
  }
  async function emailNow() {
    try { const r: any = await post('/api/progress/weekly/email', { end: new Date().toISOString().slice(0, 10) }); success('Sent', r.message || 'Check your inbox.'); }
    catch (e: any) { error('Could not send', e.message); }
  }

  async function deleteAccount() {
    const ok = await confirm({ title: 'Delete account?', message: 'This permanently deletes your FlexFit account and personal logs. This cannot be undone.', confirmText: 'Delete account', destructive: true });
    if (!ok) return;
    try {
      await del('/api/account/me');
      await cancelAllReminders();
      await clearSession();
      resetWidget();
      await clearOfflineData(); await resetGymSync();
      clearProfileCache();
      try { const d = new Directory(Paths.document, 'progress-photos'); if (d.exists) d.delete(); } catch { /* photos only ever lived on this phone */ }
      router.replace('/login');
    } catch (e: any) { error('Delete failed', e.message); }
  }

  const e = profile ? expectedEnergy(profile) : null;
  const pace = profile?.goals?.weeklyPaceKg || 0.5;
  const weeks = profile ? weeksToGoal(profile.currentWeightKg, profile.goals?.targetWeightKg, pace) : null;
  const savePlan = async (patchBody: any) => { try { await updateProfile(patchBody); await load(); } catch (err: any) { error('Save failed', err.message); } };
  const initial = (name || profile?.name || '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <Screen buddy="wave" buddySays="Hi there!" tab>
      {/* ---- header: who you are and where you are heading ---- */}
      <View style={[S.card, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
        <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: colors.primarySolid, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>{initial}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 21, fontWeight: '900', color: colors.ink }} numberOfLines={1}>{profile?.name || 'Your profile'}</Text>
          <Text style={S.muted}>{e ? `${e.calorieTarget.toLocaleString()} kcal/day · water ${((resolveTargets(profile)?.waterMl || 0) / 1000).toFixed(1)} L` : 'Add your details to get personal targets'}</Text>
          {profile?.currentWeightKg && profile?.goals?.targetWeightKg ? <WeightReveal compact reaction={false} text={`${profile.currentWeightKg} kg → ${profile.goals.targetWeightKg} kg${weeks ? ` · about ${weeks} weeks` : ''}`} style={S.muted} /> : null}
        </View>
      </View>

      {/* ---- 1. details & goals ---- */}
      <Section title="Details & goals" hint="Used to work out your calories, protein and water." colors={colors}>
        <Field label="Name" value={name} onChangeText={setName} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Age" value={age} onChangeText={setAge} keyboardType="numeric" /></View>
          <View style={{ flex: 1 }}><Field label="Height (cm)" value={height} onChangeText={setHeight} keyboardType="numeric" /></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Weight (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" /></View>
          <View style={{ flex: 1 }}><Field label="Target (kg)" value={targetWeight} onChangeText={setTargetWeight} keyboardType="decimal-pad" /></View>
        </View>
        <Text style={S.label}>Calorie target</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
          <Chip small label="Auto (recommended)" active={calMode === 'auto'} onPress={() => setCalMode('auto')} />
          <Chip small label="My own number" active={calMode === 'manual'} onPress={() => { setCalMode('manual'); const a = expectedEnergy(profile)?.autoTarget; if (a && !(profile?.goals?.calorieMode === 'manual')) setCalories(String(a)); }} />
        </View>
        {calMode === 'manual'
          ? <><Field label="Calories per day" value={calories} onChangeText={setCalories} keyboardType="numeric" /><TargetWarn check={targetSafety({ kcal: Number(calories), tdee: e?.tdee, sex: profile?.sex })} /></>
          : <Text style={[S.muted, { marginBottom: 12 }]}>{e ? `Worked out for you: ${e.autoTarget.toLocaleString()} kcal a day. It updates when your weight or goal changes.` : 'Add your age, height and weight and save to get your personal target.'}</Text>}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Protein (g)" value={protein} onChangeText={setProtein} keyboardType="numeric" placeholder="Auto" /></View>
          <View style={{ flex: 1 }}><Field label="Water (ml)" value={water} onChangeText={setWater} keyboardType="numeric" /></View>
        </View>
        <Field label="Exercise (min/day)" value={exerciseMin} onChangeText={setExerciseMin} keyboardType="numeric" />
        <Button title={busy ? 'Saving…' : 'Save details'} onPress={save} disabled={busy} />
      </Section>

      {/* ---- 2. plan ---- */}
      {profile && (
        <Section title="Your plan" hint="Tap to change. Targets update straight away." colors={colors}>
          <Text style={S.label}>Activity level</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {[['sedentary', 'Mostly sitting'], ['light', 'Light'], ['moderate', 'Moderate'], ['very_active', 'Very active'], ['extra_active', 'Athlete']].map(([k, l]) => (
              <Chip key={k} small label={l} active={(profile.activityLevel || 'moderate') === k} onPress={() => savePlan({ activityLevel: k })} />
            ))}
          </View>
          <Text style={[S.label, { marginTop: 8 }]}>Weight-change pace (kg per week)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {[0.25, 0.5, 0.75, 1].map((v) => <Chip key={v} small label={`${v}`} active={pace === v} onPress={() => savePlan({ goals: { weeklyPaceKg: v } })} />)}
          </View>
          <TargetWarn check={e?.direction === 'lose' ? targetSafety({ weightKg: profile?.currentWeightKg, weeklyPaceKg: pace }) : null} />
          <Text style={[S.label, { marginTop: 8 }]}>Daily steps goal</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {[6000, 8000, 10000, 12000].map((v) => <Chip key={v} small label={v.toLocaleString()} active={(profile.goals?.stepsTarget || 10000) === v} onPress={() => savePlan({ goals: { stepsTarget: v } })} />)}
          </View>
          {e ? (
            <View style={{ marginTop: 10, backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12 }}>
              <Text style={{ fontWeight: '800', color: colors.ink }}>{e.calorieTarget.toLocaleString()} kcal/day{e.mode === 'manual' ? ' (yours)' : ''}</Text>
              <Text style={S.muted}>Protein {resolveTargets(profile)!.macros.protein} g · maintenance {e.tdee.toLocaleString()} kcal</Text>
              {e.atFloor && <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>Held at a safe minimum — pick a slower pace.</Text>}
            </View>
          ) : <Text style={[S.muted, { marginTop: 10 }]}>Save your age, height and weight above to see your targets.</Text>}
        </Section>
      )}

      {/* ---- 3. look & units ---- */}
      <Section title="Appearance & units" colors={colors}>
        <Text style={S.label}>Theme</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {THEME_OPTIONS.map((opt) => {
            const active = mode === opt.key;
            return (
              <TouchableOpacity key={opt.key} accessibilityRole="button" accessibilityLabel={opt.label} accessibilityState={{ selected: active }} onPress={() => setMode(opt.key)}
                style={{ flex: 1, paddingVertical: 11, borderRadius: 13, alignItems: 'center', backgroundColor: active ? colors.primary : colors.chipBg, borderWidth: active ? 0 : 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 16 }}>{opt.icon}</Text>
                <Text style={{ marginTop: 3, fontWeight: '700', fontSize: 12, color: active ? '#fff' : colors.ink }}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {profile && (
          <>
            <Text style={S.label}>Weight</Text>
            <View style={{ flexDirection: 'row', marginBottom: 8 }}>
              <Chip small label="Kilograms" active={profile.units?.weight === 'kg'} onPress={() => setUnit('weight', 'kg')} />
              <Chip small label="Pounds" active={profile.units?.weight === 'lb'} onPress={() => setUnit('weight', 'lb')} />
            </View>
            <Text style={S.label}>Energy</Text>
            <View style={{ flexDirection: 'row', marginBottom: 8 }}>
              <Chip small label="kcal" active={profile.units?.energy === 'kcal'} onPress={() => setUnit('energy', 'kcal')} />
              <Chip small label="kJ" active={profile.units?.energy === 'kJ'} onPress={() => setUnit('energy', 'kJ')} />
            </View>
            <Text style={S.label}>Volume</Text>
            <View style={{ flexDirection: 'row' }}>
              <Chip small label="Millilitres" active={profile.units?.volume === 'ml'} onPress={() => setUnit('volume', 'ml')} />
              <Chip small label="Fluid ounces" active={profile.units?.volume === 'oz'} onPress={() => setUnit('volume', 'oz')} />
            </View>
          </>
        )}
      </Section>

      {/* ---- 4. shortcuts ---- */}
      <Section title="Plan & track" colors={colors} flush>
        <Row icon="🎯" label={profile?.goals?.bodyType ? 'Body plan (change my body goal)' : 'Body plan: choose the body you want'} onPress={() => router.push('/(tabs)/body' as any)} colors={colors} />
        {(() => {
          const rows: [string, string, string, string][] = [['planner', '📅', 'Meal planner & shopping list', '/plan'], ['recipes', '🍲', 'Recipes', '/recipes'], ['goals', '🎯', 'Goals & journey', '/goals'], ['northstar', '⭐', 'My plan, rewards & safety', '/northstar'], ['achievements', '🏆', 'Achievements & streaks', '/achievements'], ['weekly', '📊', 'Weekly summary', '/weekly']];
          const shown = rows.filter(([id]) => isVisible(id));
          return shown.map(([id, icon, label, href], i) => <Row key={id} icon={icon} label={label} onPress={() => router.push(href as any)} colors={colors} last={i === shown.length - 1} />);
        })()}
      </Section>

      {/* ---- 5. notifications ---- */}
      <Section title="Notifications" colors={colors} flush>
        <Row icon="🔔" label="Reminders & alerts" onPress={() => router.push('/reminders')} colors={colors} />
        <Row icon="💊" label="Medicines & supplements" onPress={() => router.push('/medicines' as any)} colors={colors} />
        <Row icon="✉️" label="Weekly summary email" value={profile?.notify?.weeklyEmail ? 'On' : 'Off'} onPress={() => setWeeklyEmail(!profile?.notify?.weeklyEmail)} colors={colors} />
        <Row icon="💾" label="Weekly data backup email" value={profile?.notify?.backupEmail ? 'On' : 'Off'} onPress={() => setBackupEmail(!profile?.notify?.backupEmail)} colors={colors} />
        <Row icon="📨" label="Email me this week's summary now" onPress={emailNow} colors={colors} last />
      </Section>

      {/* ---- 6. help ---- */}
      <Section title="Help" colors={colors} flush>
        <Row icon="🧭" label="Replay the app tour" value="1 min" onPress={() => replayTour()} colors={colors} last={tourSaved.status !== 'paused' && !tourSaved.checklistDismissed} />
        {tourSaved.status === 'paused' && <Row icon="▶️" label="Resume where I stopped" onPress={() => resumeTour()} colors={colors} last={!tourSaved.checklistDismissed} />}
        {tourSaved.checklistDismissed && <Row icon="✅" label="Show first-week checklist" onPress={() => showChecklist()} colors={colors} last />}
      </Section>

      <UiSettings />
      <HealthConnectData />
      <ToneSettings />
      <CoachLearning />

      {/* ---- 7. data ---- */}
      <Section title="Your data" colors={colors} flush>
        <Row icon="📄" label={reporting ? 'Preparing report…' : 'Dietitian report (PDF, 30 days)'} onPress={doReport} disabled={reporting} colors={colors} />
        <Row icon="⬇️" label={exporting === 'csv' ? 'Preparing CSV…' : 'Export as CSV'} onPress={() => doExport('csv')} disabled={!!exporting} colors={colors} />
        <Row icon="⬇️" label={exporting === 'json' ? 'Preparing JSON…' : 'Export as JSON'} onPress={() => doExport('json')} disabled={!!exporting} colors={colors} />
        <Row icon="⬆️" label="Import from another app (CSV)" onPress={() => router.push('/import-data' as any)} colors={colors} />
        <Row icon="🔗" label="Share a weekly summary with one person" onPress={() => router.push('/share' as any)} colors={colors} last />
      </Section>

      {/* ---- 8. account ---- */}
      <Section title="Account" colors={colors} flush>
        <Row icon="🔑" label="Change password" onPress={() => setPwModal(true)} colors={colors} />
        <Row icon="🚪" label="Log out" onPress={logout} colors={colors} last />
      </Section>

      <Text style={[S.muted, { lineHeight: 17, marginBottom: 16 }]}>
        FlexFit gives general wellness estimates, not medical advice. Calorie, water, step and fasting suggestions are starting points — talk to a doctor or dietitian before big changes, especially if you are pregnant, under 18, have diabetes, a heart condition or a history of eating disorders. Progress photos never leave your phone.
      </Text>

      <View style={{ borderWidth: 1, borderColor: '#e5484d66', borderRadius: 18, padding: 14, marginBottom: 24 }}>
        <Text style={{ fontWeight: '800', color: colors.danger, marginBottom: 4 }}>Danger zone</Text>
        <Text style={[S.muted, { marginBottom: 10 }]}>Deleting your account permanently removes your logs and cannot be undone.</Text>
        <TouchableOpacity accessibilityRole="button" onPress={deleteAccount} style={{ borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#e5484d1a' }}><Text style={{ color: colors.danger, fontWeight: '800' }}>Delete account</Text></TouchableOpacity>
      </View>

      <Modal visible={pwModal} transparent animationType="fade" onRequestClose={() => setPwModal(false)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: 'rgba(15,18,35,0.45)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.card, borderWidth: colors.cardBorderWidth, borderColor: colors.cardBorder, borderRadius: 22, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, marginBottom: 14 }}>Change password</Text>
            <Field label="Current password" value={curPw} onChangeText={setCurPw} secureTextEntry />
            <Field label="New password" value={newPw} onChangeText={setNewPw} secureTextEntry />
            <Button title={pwBusy ? 'Saving…' : 'Change password'} onPress={changePassword} disabled={pwBusy} />
            <TouchableOpacity onPress={() => setPwModal(false)} style={{ paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.muted, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

/** A titled group. `flush` = a list of rows with no inner padding. */
function Section({ title, hint, children, colors, flush }: { title: string; hint?: string; children: React.ReactNode; colors: any; flush?: boolean }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={{ fontSize: 12.5, fontWeight: '800', color: colors.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4, marginLeft: 4 }} accessibilityRole="header">{title}</Text>
      {!!hint && <Text style={{ fontSize: 12.5, color: colors.muted, marginBottom: 8, marginLeft: 4 }}>{hint}</Text>}
      <View style={{ backgroundColor: colors.card, borderWidth: colors.cardBorderWidth, borderColor: colors.cardBorder, borderRadius: 20, padding: flush ? 0 : 16, overflow: 'hidden', marginTop: hint ? 0 : 4 }}>{children}</View>
    </View>
  );
}
function Row({ icon, label, value, onPress, disabled, colors, last }: { icon: string; label: string; value?: string; onPress: () => void; disabled?: boolean; colors: any; last?: boolean }) {
  return (
    <TouchableOpacity accessibilityRole="button" onPress={onPress} disabled={disabled} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 54, paddingHorizontal: 16, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border, opacity: disabled ? 0.6 : 1 }}>
      <Text style={{ fontSize: 20, width: 34 }}>{icon}</Text>
      <Text style={{ flex: 1, color: colors.ink, fontWeight: '700', fontSize: 15 }}>{label}</Text>
      {!!value && <Text style={{ color: colors.primary, fontWeight: '800', marginRight: 8 }}>{value}</Text>}
      <Text style={{ color: colors.muted, fontSize: 22 }}>›</Text>
    </TouchableOpacity>
  );
}

// A crash in this tab shows a friendly retry screen (and is reported to Sentry) instead of closing the app.
export { ScreenError as ErrorBoundary } from '../../components/ScreenError';
