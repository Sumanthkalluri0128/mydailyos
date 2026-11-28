// Over-calorie days, handled kindly. One over day: a gentle note. 2–3 in a row: a course-correct card with a SMALL spread-out trim.
// A week over: a root-cause review (and an easier pace when the pace is the real problem). Never "burn it off" language.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useThemedStyles } from './UI';
import { useNotifications } from './Notifications';
import { read } from '../utils/offline';
import { post, today } from '../config/api';
import { updateProfile } from '../hooks/useProfile';
import { useOverAdvice } from '../hooks/useOverAdvice';
import Buddy from '../motion/Buddy';
import { ACCENT, dayChar } from '../motion/chars';

type Advice = { level: 'watch' | 'reduce' | 'high'; headline: string; detail: string; perDay: number; days: number; skipCut: boolean; todayTarget: number; tomorrowTarget: number };
type Over = {
  engine?: string;
  advice?: Advice | null;
  tier: 'none' | 'single' | 'streak' | 'week'; runDays: number; overDays7: number; message: string; cause: string | null; easierPace: number | null; easierTarget: number | null;
  target?: number; target0?: number;
  correction: { perDay: number; days: number; newTarget: number; safe: boolean; note: string } | null;
  causes: { enough: boolean; findings: { id: string; icon: string; title: string; detail: string }[] } | null;
};
const addDays = (s: string, n: number) => { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

export function OverDayCard({ hideNumbers = false }: { hideNumbers?: boolean }) {
  const { S, colors } = useThemedStyles();
  const { success, error } = useNotifications();
  const [srv, setSrv] = useState<Over | null>(null);
  const [busy, setBusy] = useState(false);
  // The on-phone engine (weekly ledger, capped credit, restrict-overeat check, calorie floor) decides tier and advice when it can run.
  // The server still supplies root causes and the easier-pace numbers.
  const eng = useOverAdvice();
  // A server on the same ledger engine (engine === 'ledger-v1') also knows the weight trend and feeds the meal planner, so it wins; the phone engine covers older servers.
  const d: Over | null = srv?.engine === 'ledger-v1' ? srv : eng
    ? { ...(srv || { causes: null, easierPace: null, easierTarget: null, correction: null }), tier: eng.tier, runDays: eng.runDays, overDays7: eng.overDays7, message: eng.message,
        advice: eng.advice, correction: null, target: eng.target, cause: eng.needsEasierPace && srv?.easierPace ? 'pace_too_aggressive' : (eng.cause === 'undereating_cycle' ? 'undereating_cycle' : null) }
    : srv;
  const load = useCallback(async () => {
    try { setSrv(await read<Over>(`/api/plan/over-days?today=${today()}&tz=${new Date().getTimezoneOffset()}`)); } catch { /* optional card */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  // ALWAYS starts collapsed (nothing is remembered between launches). Tap the slim line to open, Hide to close.
  const [open, setOpen] = useState(false);
  const [bodyH, setBodyH] = useState(0);
  const prog = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(prog, { toValue: open ? 1 : 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(); }, [open, prog]);
  if (!d || (d.tier === 'none' && !d.advice)) return null;
  const title = d.tier === 'none' ? 'GO A LITTLE LIGHTER' : d.tier === 'single' ? 'A LITTLE OVER' : d.tier === 'streak' ? `${d.runDays} DAYS OVER · COURSE-CORRECT` : 'THIS WEEK RAN OVER · REVIEW';
  const slim = d.tier === 'week' ? 'Weekly review' : d.tier === 'streak' ? 'Course-correct check-in' : d.tier === 'single' ? 'A little over: gentle note' : 'Go a little lighter';
  const toggle = () => setOpen((o) => !o);
  const who = dayChar();

  const rescue = async () => {
    setBusy(true);
    try {
      const r: any = await post('/api/plan/rescue-day', { date: addDays(today(), 1), today: today(), ...(d.advice && !d.advice.skipCut ? { goal: d.advice.tomorrowTarget } : {}) });
      success('Gentle day planned', `Tomorrow is set at about ${hideNumbers ? 'a lighter amount' : `${r.goal} kcal`}. Edit it in the planner.`);
      router.push('/plan' as any);
    } catch (e: any) { error('Could not plan it', e.message); } finally { setBusy(false); }
  };
  const easier = async () => {
    try { await updateProfile({ goals: { weeklyPaceKg: d.easierPace } }); success('Pace updated', `Now ${d.easierPace} kg a week. Your daily budget just got bigger.`); load(); }
    catch (e: any) { error('Could not change pace', e.message); }
  };

  const border = d.tier === 'single' ? colors.border : ACCENT[who];
  return (
    <View style={[S.card, { borderWidth: d.tier === 'single' ? 1 : 2, borderColor: border, paddingVertical: 4 }]}>
      <TouchableOpacity onPress={toggle} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${slim}. ${open ? 'Hide details' : 'Show details'}`} activeOpacity={0.8}
        style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Buddy scene="cheer" size={36} label="" who={who} talk={false} />
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: colors.ink }}>{slim}</Text>
        <Animated.Text style={{ color: colors.primary, fontWeight: '900', fontSize: 16, transform: [{ rotate: prog.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) }] }}>▸</Animated.Text>
      </TouchableOpacity>

      <Animated.View pointerEvents={open ? 'auto' : 'none'} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} accessibilityElementsHidden={!open}
        style={{ height: bodyH ? prog.interpolate({ inputRange: [0, 1], outputRange: [0, bodyH] }) : 0, opacity: prog, overflow: 'hidden' }}>
        <View onLayout={(e) => setBodyH(e.nativeEvent.layout.height)} style={{ position: 'absolute', left: 0, right: 0, top: 0, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* the character is already in the header bar: a second copy here made two when opened */}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.muted }}>{title}</Text>
              <Text style={[S.muted, { marginTop: 4, fontSize: 13, lineHeight: 19, color: colors.ink }]}>{d.advice?.headline || d.message}</Text>
            </View>
            <TouchableOpacity onPress={toggle} accessibilityRole="button" accessibilityLabel="Hide this card" hitSlop={8} style={{ alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 99, borderWidth: 1, borderColor: colors.border }}><Text style={{ color: colors.muted, fontWeight: '700', fontSize: 12 }}>Hide ▴</Text></TouchableOpacity>
          </View>

          {d.advice && (
            <View style={{ marginTop: 10, backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12 }}>
              <Text style={{ fontWeight: '800', color: colors.ink }}>{d.advice.skipCut ? 'No cutting needed' : hideNumbers ? 'A slightly lighter plan for the next days' : `Aim for about ${d.advice.todayTarget.toLocaleString()} kcal ${d.advice.todayTarget < (d.target ?? 1e9) ? 'today' : 'tomorrow'}`}</Text>
              <Text style={[S.muted, { marginTop: 2 }]}>{d.advice.detail}</Text>
              <TouchableOpacity onPress={() => router.push('/plan' as any)} accessibilityRole="button" style={{ marginTop: 8, minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>📅 Plan lighter meals →</Text></TouchableOpacity>
            </View>
          )}

          {d.correction && !d.advice && (
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontWeight: '800', color: colors.ink }}>{d.correction.safe ? `A gentle plan: about ${hideNumbers ? 'a little less' : `${d.correction.perDay} kcal less`} a day for ${d.correction.days} days` : 'No cutting needed'}</Text>
              <Text style={[S.muted, { marginTop: 2 }]}>{d.correction.note}</Text>
            </View>
          )}

          {d.cause === 'pace_too_aggressive' && d.easierPace && (
            <TouchableOpacity onPress={easier} accessibilityRole="button" style={{ marginTop: 10, backgroundColor: colors.primarySolid, borderRadius: 12, padding: 12, minHeight: 44 }}>
              <Text style={{ color: '#fff', fontWeight: '800', textAlign: 'center' }}>Switch to an easier pace ({d.easierPace} kg/week){!hideNumbers && d.easierTarget ? ` · ${d.easierTarget} kcal/day` : ''}</Text>
            </TouchableOpacity>
          )}

          {d.causes?.enough && d.causes.findings.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: 6 }}>What seems to be driving it</Text>
              {d.causes.findings.map((f) => (
                <View key={f.id} style={{ flexDirection: 'row', marginBottom: 8 }}>
                  <Text style={{ fontSize: 20, marginRight: 8 }}>{f.icon}</Text>
                  <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: colors.ink }}>{f.title}</Text><Text style={S.muted}>{f.detail}</Text></View>
                </View>
              ))}
            </View>
          )}

          {d.tier !== 'single' && d.advice && !d.advice.skipCut && (
            <TouchableOpacity onPress={rescue} disabled={busy} accessibilityRole="button" accessibilityLabel="Plan a gentle day for tomorrow" style={{ marginTop: 6, borderWidth: 1.5, borderColor: colors.primary, borderRadius: 12, padding: 12, minHeight: 44, opacity: busy ? 0.6 : 1 }}>
              <Text style={{ color: colors.primary, fontWeight: '800', textAlign: 'center' }}>🌿 Plan a gentle day for tomorrow</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </View>
  );
}
