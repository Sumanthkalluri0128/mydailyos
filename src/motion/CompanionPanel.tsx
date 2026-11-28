// Tap the floating character and it opens THIS: it "thinks" through your real numbers out loud, shows how your day compares with where you
// should be at this hour, offers one best next move, a mood check-in that changes its advice, a 60-second challenge, and a question box that
// answers on the device first (instant, offline) and falls back to the server assistant. Logic lives in brain.ts; this file is only UI.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { router } from 'expo-router';
import { useTheme } from '../utils/theme';
import { post, today } from '../config/api';
import { newClientId, write } from '../utils/offline';
import { CHARS, stickerFor, type Who } from './chars';
import { say } from './talk';
import { getCtx, onCtx, refreshCtx } from '../utils/journeyCtx';
import { successHaptic, tapHaptic } from '../utils/haptics';
import { useReduceMotion } from './motion';
import { addBond, bondXp, getToday, markDare, setMood as saveMood } from './companionStore';
import { MOODS, analyze, answerLocal, bondLevelOf, bondProgress, bondTitle, dareFor, thinkingSteps, type Analysis, type Dare, type Mood, type Move, type Pace } from './brain';

const ROUTE: Record<string, string> = {
  dashboard: '/(tabs)', foodLogger: '/food', food: '/food', planner: '/plan', recipes: '/recipes', water: '/water', exercise: '/exercise',
  weight: '/weight', health: '/health', goals: '/goals', habit: '/habits', task: '/(tabs)/tasks', progress: '/(tabs)/progress', profile: '/(tabs)/profile',
};
const SCENE_OF: Record<string, string> = { drink: 'drink', eat: 'eat', lift: 'lift', sad: 'sad', party: 'victory', thumbs: 'habit', sleep: 'sleep', think: 'think', angry: 'angry', laugh: 'cheer', hype: 'cheer' };
const TONE_SCENE: Record<string, string> = { great: 'victory', good: 'cheer', push: 'powerup', fresh: 'wave' };
const TONE_SAY: Record<string, string> = { great: 'party', good: 'thumbs', push: 'hype', fresh: 'hype' };
const MOOD_REPLY: Record<Mood, string> = {
  great: "Love that energy! I'll aim a little higher for you today.",
  ok: 'Steady works. We keep it simple and consistent.',
  tired: "Got it, going lighter. Water and a gentle stretch count today. Rest is part of the plan.",
  stressed: 'Okay, easy does it. One minute of slow breathing first?',
};
const QUICK = ['Water left?', 'Calories left?', 'My streak', "What's next?", 'Tell me a joke'];
type Reply = { text: string; mood: string; actions?: { label: string; page?: string; ask?: string; water?: boolean; dare?: boolean; healthy?: boolean }[] };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

function useCountUp(target: number, run: boolean, ms = 700) {
  const [v, setV] = useState(run ? 0 : target);
  useEffect(() => {
    if (!run) { setV(target); return undefined; }
    let raf = 0; const t0 = Date.now();
    const tick = () => { const p = Math.min(1, (Date.now() - t0) / ms); setV(Math.round(target * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [target, run]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

function Dots({ color }: { color: string }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => { const l = Animated.loop(Animated.timing(t, { toValue: 3, duration: 1200, easing: Easing.linear, useNativeDriver: true })); l.start(); return () => l.stop(); }, [t]);
  return (
    <View style={{ flexDirection: 'row', gap: 4, paddingVertical: 4 }}>
      {[0, 1, 2].map((i) => <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, opacity: t.interpolate({ inputRange: [i - 1, i, i + 1, 3], outputRange: [0.25, 1, 0.25, 0.25], extrapolate: 'clamp' }) }} />)}
    </View>
  );
}

export default function CompanionPanel({ visible, who, onClose, onSwap, onEvent }: { visible: boolean; who: Who; onClose: () => void; onSwap: () => void; onEvent?: (e: { type: 'water' | 'dare' | 'mood'; note?: string }) => void }) {
  const { colors: c } = useTheme();
  const reduce = useReduceMotion();
  const [phase, setPhase] = useState<'thinking' | 'ready'>('thinking');
  const [steps, setSteps] = useState<string[]>([]);
  const [shown, setShown] = useState(0);
  const [a, setA] = useState<Analysis | null>(null);
  const [mood, setMoodState] = useState<Mood | null>(null);
  const moodRef = useRef<Mood | null>(null);
  const [line, setLine] = useState('');
  const [reply, setReply] = useState<Reply | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [daresDone, setDaresDone] = useState(0);
  const [dare, setDare] = useState<null | { def: Dare; left: number }>(null);
  const [bond, setBond] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const enter = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;

  // slide-up entrance and a gentle idle bob
  useEffect(() => {
    if (!visible) { enter.setValue(0); return undefined; }
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, stiffness: 240, damping: 20, mass: 0.9 }).start();
    if (reduce) return undefined;
    const l = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    l.start();
    return () => l.stop();
  }, [visible, reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  // open: think out loud about the real numbers, then show the result
  useEffect(() => {
    if (!visible) return undefined;
    let alive = true;
    setPhase('thinking'); setShown(0); setReply(null); setDare(null); setText(''); setBond(bondXp(who));
    (async () => {
      const day = await getToday();
      if (!alive) return;
      moodRef.current = day.mood; setMoodState(day.mood); setDaresDone(day.dares);
      const fresh = refreshCtx(true);
      const first = analyze(getCtx(), new Date(), day.mood);
      const st = thinkingSteps(first); setA(first); setSteps(st);
      if (reduce) setShown(st.length);
      else { for (let i = 1; i <= st.length; i++) { await sleep(480); if (!alive) return; setShown(i); tapHaptic(); } await sleep(350); }
      const ctx = await fresh; if (!alive) return;
      const done = analyze(ctx || getCtx(), new Date(), day.mood);
      setA(done); setLine(say(who, TONE_SAY[done.tone] || 'hype')); setPhase('ready');
      if (done.allDone || done.tone === 'great') successHaptic();
    })();
    const off = onCtx((cx) => { if (alive) setA(analyze(cx, new Date(), moodRef.current)); });
    return () => { alive = false; off(); };
  }, [visible, who]); // eslint-disable-line react-hooks/exhaustive-deps

  const dareDef = useMemo(() => dareFor(a, mood, new Date().getHours(), daresDone + (new Date().getDate())), [a, mood, daresDone]);

  const finishDare = useCallback(async (d: Dare) => {
    successHaptic(); setDare(null);
    const n = await markDare(d.id); setDaresDone(n);
    const r = addBond(who, d.bond); setBond(r.xp);
    setReply({ mood: 'party', text: `${d.title} done! +${d.bond} bond ❤️${r.up ? ` Bond level ${r.level}, we're getting closer!` : ''}` });
    onEvent?.({ type: 'dare', note: d.title });
  }, [who, onEvent]);
  useEffect(() => {
    if (!dare) return undefined;
    if (dare.left <= 0) { finishDare(dare.def); return undefined; }
    const t = setTimeout(() => setDare((x) => (x ? { ...x, left: x.left - 1 } : x)), 1000);
    return () => clearTimeout(t);
  }, [dare, finishDare]);

  const logWater = useCallback(async () => {
    try {
      await write('POST', '/api/water', { date: today(), amountMl: 250, clientId: newClientId('w') }, 'Water 250 ml');
      successHaptic(); addBond(who, 1); setBond(bondXp(who));
      setReply({ mood: 'drink', text: 'Glug glug! +250 ml logged. 💧' }); onEvent?.({ type: 'water' });
      refreshCtx(true);
    } catch { setReply({ mood: 'sad', text: 'Hmm, I could not log that. Try again?' }); }
  }, [who, onEvent]);

  const go = (path: string, params?: Record<string, string>) => { onClose(); setTimeout(() => router.push((params ? { pathname: path, params } : path) as any), 60); };
  const doMove = (m: Move) => {
    tapHaptic();
    if (m.action.type === 'water') logWater();
    else if (m.action.type === 'dare') setDare({ def: dareDef, left: dareDef.seconds });
    else go(m.action.path, m.action.params);
  };
  const ask = useCallback(async (q: string) => {
    const question = q.trim(); if (!question || busy) return;
    setText(''); tapHaptic();
    const local = answerLocal(question, a, Date.now() % 97);
    if (local) { setReply({ text: local.text, mood: local.mood, actions: local.actions }); return; }
    setBusy(true);
    try {
      const d = await post<any>('/api/assistant/ask', { question, today: today(), hour: new Date().getHours() });
      setReply({ text: d?.text || 'Hmm, I have no answer for that one.', mood: 'think', actions: d?.actions });
    } catch (e: any) {
      setReply({ mood: 'sad', text: e?.network ? 'I could not reach the server. Offline I can still answer about water, calories, steps, your streak and your next move.' : (e?.message || 'Something went wrong.') });
    } finally { setBusy(false); }
  }, [a, busy]);
  const act = (x: NonNullable<Reply['actions']>[number]) => {
    tapHaptic();
    if (x.water) logWater();
    else if (x.dare) setDare({ def: dareDef, left: dareDef.seconds });
    else if (x.healthy) go('/(tabs)', { open: 'healthy' });
    else if (x.page && ROUTE[x.page]) go(ROUTE[x.page]);
    else if (x.ask) ask(x.ask);
  };
  const pickMood = async (m: Mood) => {
    tapHaptic(); const next = mood === m ? null : m;
    setMoodState(next); moodRef.current = next; await saveMood(next);
    setA(analyze(getCtx(), new Date(), next)); onEvent?.({ type: 'mood' });
    if (next) setReply({ mood: next === 'tired' ? 'sleep' : next === 'stressed' ? 'think' : 'hype', text: MOOD_REPLY[next], actions: next === 'stressed' || next === 'tired' ? [{ label: next === 'stressed' ? 'Box breathing' : 'Gentle stretch', dare: true }] : undefined });
  };
  useEffect(() => { if (reply) setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 120); }, [reply]);

  const score = useCountUp(a?.score || 0, !reduce && phase === 'ready');
  const lvl = bondLevelOf(bond);
  const scene = phase === 'thinking' ? 'think' : (reply && SCENE_OF[reply.mood]) || TONE_SCENE[a?.tone || 'fresh'] || 'wave';
  const pic = stickerFor(who, scene, reply ? reply.text.length : 0);
  const toneColor = a?.tone === 'push' ? '#E0A020' : a?.tone === 'fresh' ? c.primary : c.success;
  const paceStyle = (p: Pace) => p === 'done' || p === 'ahead' ? { bg: c.successSoft, ink: c.successInk, t: p === 'done' ? '✓ done' : 'ahead' } : p === 'on' ? { bg: c.chipBg, ink: c.muted, t: 'on pace' } : p === 'behind' ? { bg: c.warnSoft, ink: c.warnInk, t: 'behind' } : { bg: c.dangerSoft, ink: c.dangerInk, t: p === 'over' ? 'over' : 'late' };
  const card = { backgroundColor: c.raised, borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 12, marginTop: 10 } as const;
  const R = 30, CIRC = 2 * Math.PI * R;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close companion" onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View style={{ maxHeight: '90%', backgroundColor: c.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: c.border, opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }] }}>
            <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 26 }}>
              {/* header: who, bond, swap, close */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Animated.View style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }}>
                  <Image source={pic.src} style={{ width: 80, height: 80 }} resizeMode="contain" accessibilityIgnoresInvertColors />
                </Animated.View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: c.ink }}>{CHARS[who]}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: c.muted }}>❤️ Bond {lvl} · {bondTitle(lvl)}</Text>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: c.chipBg, marginTop: 5, overflow: 'hidden' }}><View style={{ width: `${Math.round(bondProgress(bond) * 100)}%`, height: 6, backgroundColor: '#ff6b8b' }} /></View>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Swap character" hitSlop={8} onPress={() => { onClose(); setTimeout(onSwap, 80); }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.chipBg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 16 }}>🔄</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={onClose} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.chipBg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 14, color: c.muted }}>✕</Text></Pressable>
              </View>

              {phase === 'thinking' ? (
                <View style={card} accessibilityLiveRegion="polite">
                  <Text style={{ fontSize: 11, fontWeight: '800', color: c.muted, textTransform: 'uppercase', marginBottom: 6 }}>Thinking…</Text>
                  {steps.slice(0, shown).map((s, i) => <Text key={i} style={{ fontSize: 13.5, color: c.ink, marginBottom: 4 }}>• {s}</Text>)}
                  {shown < steps.length || !reduce ? <Dots color={c.primary} /> : null}
                </View>
              ) : (
                <>
                  {/* verdict + score ring */}
                  <View style={[card, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
                    {a && !a.empty ? (
                      <View style={{ width: 76, height: 76, alignItems: 'center', justifyContent: 'center' }} accessible accessibilityLabel={`Day score ${a.score} out of 100`}>
                        <Svg width={76} height={76}>
                          <Circle cx={38} cy={38} r={R} stroke={c.chipBg} strokeWidth={8} fill="none" />
                          <Circle cx={38} cy={38} r={R} stroke={toneColor} strokeWidth={8} fill="none" strokeLinecap="round" strokeDasharray={`${CIRC}`} strokeDashoffset={CIRC * (1 - clamp(score, 0, 100) / 100)} rotation={-90} origin="38, 38" />
                        </Svg>
                        <Text style={{ position: 'absolute', fontSize: 20, fontWeight: '800', color: c.ink }}>{score}</Text>
                      </View>
                    ) : <Text style={{ fontSize: 40 }}>👋</Text>}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 17, fontWeight: '800', color: c.ink }}>{a && !a.empty ? a.verdict : 'Ready when you are'}</Text>
                      <Text style={{ fontSize: 13, color: c.muted, marginTop: 2 }}>{a && !a.empty ? a.summary : 'Log a meal or some water and I will tell you exactly how your day is going.'}</Text>
                      {!!line && <Text style={{ fontSize: 13, fontWeight: '700', color: c.primary, marginTop: 6 }}>“{line}”</Text>}
                    </View>
                  </View>

                  {/* pace rows: bar + tick where you should be right now */}
                  {a && !a.empty && (
                    <View style={card}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: c.muted, textTransform: 'uppercase', marginBottom: 8 }}>Pace right now (tick = where you should be)</Text>
                      {a.quests.slice(0, 6).map((q) => {
                        const ps = paceStyle(q.pace);
                        return (
                          <View key={q.id} style={{ marginBottom: 10 }} accessible accessibilityLabel={`${q.title}, ${q.pct} percent, ${ps.t}`}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: c.ink, flexShrink: 1 }}>{q.title} · {q.pct}%</Text>
                              <View style={{ backgroundColor: ps.bg, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ fontSize: 10.5, fontWeight: '800', color: ps.ink }}>{ps.t}</Text></View>
                            </View>
                            <View style={{ height: 8, borderRadius: 4, backgroundColor: c.chipBg }}>
                              <View style={{ width: `${clamp(q.pct, 0, 100)}%`, height: 8, borderRadius: 4, backgroundColor: q.pace === 'over' || q.pace === 'late' ? c.danger : q.pace === 'behind' ? '#E0A020' : c.success }} />
                              {q.expected > 0 && q.pace !== 'done' && <View style={{ position: 'absolute', left: `${clamp(q.expected, 0, 99)}%`, top: -3, width: 2, height: 14, borderRadius: 1, backgroundColor: c.ink, opacity: 0.55 }} />}
                            </View>
                          </View>
                        );
                      })}
                      <Text style={{ fontSize: 12.5, color: c.muted }}>🔮 {a.forecast}</Text>
                    </View>
                  )}

                  {/* best next move */}
                  {a && a.top && (
                    <View style={[card, { borderColor: c.primary, borderWidth: 1.5 }]}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: c.primary, textTransform: 'uppercase' }}>Best next move</Text>
                      <Text style={{ fontSize: 13.5, color: c.ink, marginTop: 4, lineHeight: 19 }}>{a.top.emoji} {a.top.why}</Text>
                      <Pressable accessibilityRole="button" accessibilityLabel={a.top.cta} onPress={() => doMove(a.top!)} style={({ pressed }) => ({ marginTop: 10, backgroundColor: c.primarySolid, borderRadius: 12, paddingVertical: 11, alignItems: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14.5 }}>{a.top.cta}</Text>
                      </Pressable>
                    </View>
                  )}
                  {a && a.allDone && (
                    <View style={[card, { backgroundColor: c.successSoft, borderColor: c.success }]}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: c.successInk }}>🎉 Every quest is done today!</Text>
                      <Pressable accessibilityRole="button" onPress={() => go('/plan')} style={{ marginTop: 8 }}><Text style={{ color: c.primary, fontWeight: '800' }}>Plan tomorrow →</Text></Pressable>
                    </View>
                  )}

                  {/* mood check-in */}
                  <View style={card}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: c.muted, textTransform: 'uppercase', marginBottom: 8 }}>How are you feeling?</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {MOODS.map((m) => (
                        <Pressable key={m.k} accessibilityRole="button" accessibilityState={{ selected: mood === m.k }} accessibilityLabel={m.label} onPress={() => pickMood(m.k)} style={({ pressed }) => ({ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: mood === m.k ? c.primarySolid : c.chipBg, transform: [{ scale: pressed ? 0.94 : 1 }] })}>
                          <Text style={{ fontSize: 20 }}>{m.emoji}</Text>
                          <Text style={{ fontSize: 10.5, fontWeight: '800', color: mood === m.k ? '#fff' : c.muted }}>{m.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  {/* 60-second challenge */}
                  <View style={card}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: c.muted, textTransform: 'uppercase' }}>Challenge{daresDone ? ` · ${daresDone} done today` : ''}</Text>
                    {dare ? (
                      <View style={{ alignItems: 'center', paddingVertical: 6 }}>
                        <Text style={{ fontSize: 34, fontWeight: '800', color: c.ink }}>{dare.def.emoji} {Math.floor(dare.left / 60)}:{String(dare.left % 60).padStart(2, '0')}</Text>
                        <Text style={{ fontSize: 13, color: c.muted, textAlign: 'center' }}>{dare.def.title}. {dare.def.how}</Text>
                        <View style={{ alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: c.chipBg, marginTop: 10, overflow: 'hidden' }}><View style={{ width: `${Math.round(((dare.def.seconds - dare.left) / dare.def.seconds) * 100)}%`, height: 6, backgroundColor: c.success }} /></View>
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                          <Pressable accessibilityRole="button" onPress={() => finishDare(dare.def)} style={{ backgroundColor: c.success, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 18 }}><Text style={{ color: '#fff', fontWeight: '800' }}>Done ✓</Text></Pressable>
                          <Pressable accessibilityRole="button" onPress={() => setDare(null)} style={{ backgroundColor: c.chipBg, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 18 }}><Text style={{ color: c.muted, fontWeight: '800' }}>Stop</Text></Pressable>
                        </View>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
                        <Text style={{ fontSize: 28 }}>{dareDef.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: c.ink }}>{dareDef.title}</Text>
                          <Text style={{ fontSize: 12, color: c.muted }}>{dareDef.seconds}s · earns +{dareDef.bond} bond</Text>
                        </View>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Start ${dareDef.title}`} onPress={() => { tapHaptic(); setDare({ def: dareDef, left: dareDef.seconds }); }} style={({ pressed }) => ({ backgroundColor: c.primarySolid, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 16, transform: [{ scale: pressed ? 0.95 : 1 }] })}><Text style={{ color: '#fff', fontWeight: '800' }}>Start</Text></Pressable>
                      </View>
                    )}
                  </View>

                  {/* ask: answered on the device first, server as fallback */}
                  <View style={card}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: c.muted, textTransform: 'uppercase', marginBottom: 8 }}>Ask {CHARS[who]}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
                      {QUICK.map((q) => <Pressable key={q} accessibilityRole="button" onPress={() => ask(q)} style={({ pressed }) => ({ marginRight: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 99, backgroundColor: c.chipBg, opacity: pressed ? 0.7 : 1 })}><Text style={{ fontSize: 12.5, fontWeight: '700', color: c.primary }}>{q}</Text></Pressable>)}
                    </ScrollView>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 }}>
                      <TextInput value={text} onChangeText={setText} onSubmitEditing={() => ask(text)} returnKeyType="send" maxLength={300} placeholder="Ask anything about your day…" placeholderTextColor={c.muted} accessibilityLabel="Your question" style={{ flex: 1, minHeight: 44, borderWidth: 1.5, borderColor: c.border, borderRadius: 22, paddingHorizontal: 14, color: c.ink, fontSize: 15 }} />
                      <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={busy || !text.trim()} onPress={() => ask(text)} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primarySolid, opacity: busy || !text.trim() ? 0.45 : 1 }}><Text style={{ color: '#fff', fontSize: 16 }}>➤</Text></Pressable>
                    </View>
                    {busy && <View style={{ marginTop: 8 }}><Dots color={c.primary} /></View>}
                    {reply && (
                      <View style={{ marginTop: 10, backgroundColor: c.chipBg, borderRadius: 14, padding: 12 }} accessibilityLiveRegion="polite">
                        <Text style={{ fontSize: 14, lineHeight: 20, color: c.ink }}>{reply.text}</Text>
                        {!!reply.actions?.length && (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                            {reply.actions.map((x) => <Pressable key={x.label} accessibilityRole="button" onPress={() => act(x)} style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: c.primarySolid, opacity: pressed ? 0.8 : 1 })}><Text style={{ fontSize: 12.5, fontWeight: '800', color: '#fff' }}>{x.page || x.healthy ? '→ ' : ''}{x.label}</Text></Pressable>)}
                          </View>
                        )}
                      </View>
                    )}
                    <Pressable accessibilityRole="button" onPress={() => { onClose(); setTimeout(() => router.push({ pathname: '/assistant', params: { who } } as any), 60); }} style={{ marginTop: 12, alignSelf: 'flex-start' }}><Text style={{ color: c.primary, fontWeight: '800', fontSize: 13 }}>Open the full chat →</Text></Pressable>
                  </View>
                </>
              )}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
