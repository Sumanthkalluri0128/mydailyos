// THE PLANNING SENSEI: a short chat that asks the right 3-4 questions (like a dietitian), saves each answer at once and ends with an editable
// "Your plan setup" card. Quick-reply chips, a typing animation, progress dots, Skip, "Use my usual" and Back on every question.
// The questions and the lines the character says come from the server (/api/food-prefs/flow), so the phone and the web behave the same.
// Allergy answers are health data: stored privately, exported with the account and never overridden by the planner.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from './UI';
import { Chip } from './Chip';
import { useNotifications } from './Notifications';
import { QuestionInput } from './QuestionInput';
import { SenseiSticker } from './SenseiSticker';
import Buddy from '../motion/Buddy';
import { CHARS, WHO_LIST, dayChar, type Who } from '../motion/chars';
import { del, get, post, put, today } from '../config/api';
import { TONES, answerText, askLine, chosenLabels, dotsFor, draftValid, draftValue, emptyDraft, introLine, knownLine, reactLine, type Question } from '../utils/sensei';

type Msg = { from: 'bot' | 'me'; text: string; typing?: boolean };
const TONE_LABEL: Record<string, string> = { cheer: 'Cheerful', calm: 'Calm', strict: 'Straight to the point' };

export function SenseiChat({ onDone, onClose, focus }: { onDone: (state: any) => void; onClose: () => void; focus?: string | null }) {
  const { S, colors } = useThemedStyles();
  const { error, success } = useNotifications();
  const t = today();
  const [flow, setFlow] = useState<any>(null);
  const [qs, setQs] = useState<Question[]>([]);
  const [qi, setQi] = useState(0);
  const [draft, setDraft] = useState<any>(null);
  const [thread, setThread] = useState<Msg[]>([]);
  const [stage, setStage] = useState<'ask' | 'summary'>('ask');
  const [state, setState] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [calm, setCalm] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const alive = useRef(true);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setCalm).catch(() => {}); return () => { alive.current = false; }; }, []);

  const dayWho = useMemo(() => dayChar(), []);
  const who: Who = state?.coach?.who && (CHARS as any)[state.coach.who] ? state.coach.who : dayWho;
  const tone: string = TONES.includes(state?.coach?.tone) ? state.coach.tone : 'cheer';
  const lines = flow?.lines;
  const q = qs[qi];
  const wait = (ms: number) => new Promise((r) => setTimeout(r, calm ? 0 : ms));

  const say = useCallback(async (text: string) => {
    setThread((m) => [...m, { from: 'bot', text: '', typing: true }]);
    await wait(500 + Math.min(500, text.length * 6));
    if (!alive.current) return;
    setThread((m) => { const c = [...m]; const i = c.map((x) => !!x.typing).lastIndexOf(true); if (i >= 0) c[i] = { from: 'bot', text }; return c; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calm]);
  const me = (text: string) => setThread((m) => [...m, { from: 'me', text }]);
  useEffect(() => { const id = setTimeout(() => scroller.current?.scrollToEnd({ animated: !calm }), 60); return () => clearTimeout(id); }, [thread, stage, qi, calm]);

  const open = useCallback(async (list: Question[], index: number, f: any, st: any) => {
    const question = list[index];
    setDraft(emptyDraft(question));
    await say(askLine({ lines: f.lines, who: st?.coach?.who && (CHARS as any)[st.coach.who] ? st.coach.who : dayChar(), tone: st?.coach?.tone || 'cheer', question, index }));
    if (question.hint) await say(question.hint);
  }, [say]);

  useEffect(() => {
    (async () => {
      try {
        const d = await get<any>(`/api/food-prefs/flow?today=${t}${focus ? `&only=${focus}` : ''}`);
        setFlow(d); setState(d); setQs(d.questions);
        const w = d.coach?.who && (CHARS as any)[d.coach.who] ? d.coach.who : dayChar(); const tn = d.coach?.tone || 'cheer';
        if (!focus) { await say(introLine({ lines: d.lines, who: w, tone: tn, mode: d.mode })); const k = knownLine(d.known); if (k) await say(k); }
        if (!d.questions.length) { setStage('summary'); return; }
        await open(d.questions, 0, d, d);
      } catch (e: any) { setErr(e.network ? 'The sensei needs a connection. Try again in a moment.' : e.message || 'I could not start.'); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback(async () => {
    setStage('summary');
    try { const d = await post<any>('/api/food-prefs/complete', {}); setState((s: any) => ({ ...s, ...d })); if (d.unlockedSticker) setUnlocked(true); } catch { /* retried next time */ }
    await say(reactLine({ lines, who, tone, done: true }));
  }, [lines, say, who, tone]);

  const advance = useCallback(async (resp: any) => {
    if (resp?.followUp) { const list = [...qs.slice(0, qi + 1), resp.followUp, ...qs.slice(qi + 1)]; setQs(list); setQi(qi + 1); await open(list, qi + 1, flow, resp); return; }
    if (qi + 1 < qs.length) { setQi(qi + 1); await open(qs, qi + 1, flow, resp); return; }
    if (focus || edit) { setStage('summary'); return; }
    await finish();
  }, [qs, qi, flow, open, finish, focus, edit]);

  const save = async (body: any) => {
    setBusy(true); setErr('');
    try { const d = await post<any>('/api/food-prefs/answer', { today: t, ...body }); setState((s: any) => ({ ...s, ...d })); return d; }
    catch (e: any) { setErr(e.network ? 'I could not save that. Check your connection.' : e.message || 'I could not save that.'); return null; }
    finally { setBusy(false); }
  };

  const send = async (value: any) => {
    if (!q || busy || !draftValid(q, value)) return;
    const v = draftValue(q, value);
    me(answerText(q, v) || 'Done');
    const d = await save({ id: q.id, value: v }); if (!d) return;
    await say(reactLine({ lines, who, tone, qid: q.id, value: v, labels: chosenLabels(q, v) }));
    await advance(d);
  };
  const skip = async () => { if (!q || busy) return; me('Skip'); const d = await save({ id: q.id, skipped: true }); if (!d) return; await say(reactLine({ lines, who, tone, qid: q.id, skipped: true })); await advance(d); };
  const usual = async () => { if (!q || busy) return; me('Use my usual'); const d = await save({ id: q.id, usual: true }); if (!d) return; await say(reactLine({ lines, who, tone, qid: q.id, usual: true })); await advance(d); };
  const back = async () => { if (qi === 0 || busy) return; setQi(qi - 1); setDraft(emptyDraft(qs[qi - 1])); me('Back'); await say(`Sure. ${qs[qi - 1].ask}`); };

  const editChip = async (id: string) => {
    setEdit(id); setErr('');
    try { const d = await get<any>(`/api/food-prefs/flow?today=${t}&only=${id}`); if (d.questions?.[0]) { setQs(d.questions); setQi(0); setDraft(emptyDraft(d.questions[0])); } }
    catch { setErr('I could not open that. Try again.'); setEdit(null); }
  };
  const saveEdit = async (value: any) => {
    const qq = qs[0]; if (!qq || !draftValid(qq, value)) return;
    const d = await save({ id: qq.id, value: draftValue(qq, value) }); if (!d) return;
    if (d.followUp) { setQs([d.followUp]); setQi(0); setDraft(emptyDraft(d.followUp)); return; }
    setEdit(null);
  };
  const setCoach = async (next: any) => {
    const merged = { who: state?.coach?.who || who, tone, ...next };
    setState((s: any) => ({ ...s, coach: merged }));
    try { await put('/api/food-prefs/coach', merged); } catch { error('Could not save the coach', 'Try again.'); }
  };
  const forget = async () => { try { await del('/api/food-prefs'); success('Cleared', 'Your food preferences were cleared.'); onClose(); } catch { error('Could not clear them', 'Try again.'); } };

  if (err && !flow) return <View style={S.card}><Text style={{ color: '#c93a3f', fontWeight: '700' }}>{err}</Text><Chip label="Close" onPress={onClose} /></View>;
  const dots = dotsFor(qi, qs.length);
  const typing = thread.some((m) => m.typing);
  const eq = edit ? qs[0] : null;

  return (
    <View style={S.card} accessibilityLabel="Planning sensei">
      <View style={[S.between, { alignItems: 'center' }]}>
        <Buddy scene={stage === 'summary' ? 'victory' : 'chef'} size={52} who={who} talk={false} label="Sensei" />
        <View style={{ flex: 1, paddingHorizontal: 8 }}>
          <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16 }}>🍱 Planning sensei</Text>
          <Text style={S.muted}>{stage === 'summary' ? 'Your plan setup' : flow?.mode === 'update' ? 'Quick check-in' : 'A few quick questions'}</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" onPress={onClose}><Text style={{ color: colors.primary, fontWeight: '800' }}>Close</Text></TouchableOpacity>
      </View>
      {stage === 'ask' && qs.length > 0 && (
        <View accessible accessibilityLabel={`Question ${qi + 1} of ${qs.length}`} style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          {dots.map((d, i) => <View key={i} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: d === 'todo' ? colors.border : colors.primary, opacity: d === 'done' ? 0.55 : 1 }} />)}
        </View>
      )}

      <ScrollView ref={scroller} style={{ maxHeight: 300, marginTop: 10 }} nestedScrollEnabled accessibilityLiveRegion="polite">
        {thread.map((m, i) => (
          <View key={i} style={{ alignSelf: m.from === 'me' ? 'flex-end' : 'flex-start', maxWidth: '90%', marginBottom: 8, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 16, backgroundColor: m.from === 'me' ? colors.primary : colors.chipBg, borderWidth: m.from === 'me' ? 0 : 1, borderColor: colors.border }}>
            <Text style={{ color: m.from === 'me' ? '#fff' : colors.ink, fontSize: 14.5 }}>{m.typing ? '•  •  •' : m.text}</Text>
          </View>
        ))}
      </ScrollView>

      {stage === 'ask' && q && !typing && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, borderStyle: 'dashed', paddingTop: 10 }}>
          <QuestionInput key={q.id} q={q} draft={draft} setDraft={setDraft} onSend={send} busy={busy} />
          <View style={[S.between, { marginTop: 10 }]}>
            <TouchableOpacity accessibilityRole="button" disabled={qi === 0 || busy} onPress={back} style={{ opacity: qi === 0 ? 0.4 : 1, paddingVertical: 8 }}><Text style={{ color: colors.primary, fontWeight: '800' }}>← Back</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={skip} style={{ paddingVertical: 8 }}><Text style={{ color: colors.primary, fontWeight: '800' }}>Skip</Text></TouchableOpacity>
            <Chip small label="Use my usual" onPress={usual} />
          </View>
        </View>
      )}
      {!!err && flow && <Text style={{ color: '#c93a3f', fontWeight: '700', marginTop: 8 }} accessibilityRole="alert">{err}</Text>}

      {stage === 'summary' && state && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
          {unlocked && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: '#fff1db', marginBottom: 10 }}>
              <SenseiSticker size={72} /><Text style={{ flex: 1, color: '#5a3a1c' }}><Text style={{ fontWeight: '800' }}>Sticker unlocked! </Text>You finished your setup, so you earned the Meal Sensei sticker.</Text>
            </View>
          )}
          <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16 }}>Your plan setup</Text>
          <Text style={[S.muted, { marginBottom: 6 }]}>Tap anything to change it.{state.chips.some((c: any) => !c.set) ? ' Anything "Not set" uses a sensible default until you tell me.' : ''}</Text>
          {state.safety?.flagged && (
            <View style={{ padding: 10, borderRadius: 12, backgroundColor: '#e5484d14', borderWidth: 1, borderColor: '#e5484d66', marginBottom: 8 }}>
              <Text style={{ fontWeight: '800', color: colors.ink }}>🩺 Please check with a doctor or dietitian</Text><Text style={S.muted}>{state.safety.note}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {state.chips.map((c: any) => <Chip key={c.id} small active={c.set} label={`${c.emoji} ${c.label}: ${c.value}`} onPress={() => editChip(c.id)} />)}
          </View>
          {eq && (
            <View style={{ marginTop: 8, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.primary }}>
              <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: 6 }}>{eq.ask}</Text>
              <QuestionInput key={eq.id} q={eq} draft={draft} setDraft={setDraft} onSend={saveEdit} busy={busy} />
              <TouchableOpacity accessibilityRole="button" onPress={() => setEdit(null)} style={{ paddingTop: 8 }}><Text style={{ color: colors.primary, fontWeight: '800' }}>Cancel</Text></TouchableOpacity>
            </View>
          )}
          <Text style={[S.label, { marginTop: 10 }]}>Coach</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Chip small label="Today's character" active={!state.coach?.who} onPress={() => setCoach({ who: '' })} />
            {WHO_LIST.map((w) => <Chip key={w} small label={(CHARS as any)[w]} active={state.coach?.who === w} onPress={() => setCoach({ who: w })} />)}
          </ScrollView>
          <Text style={S.label}>Tone</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{TONES.map((x) => <Chip key={x} small label={TONE_LABEL[x]} active={tone === x} onPress={() => setCoach({ tone: x })} />)}</View>
          <Text style={[S.muted, { marginVertical: 8 }]}>🔒 Allergies and health answers stay private. They are part of your data export and are deleted with your account.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip label="Preview my plan" active onPress={() => { if (!edit) onDone(state); }} />
            <TouchableOpacity accessibilityRole="button" onPress={forget} style={{ paddingVertical: 8 }}><Text style={{ color: colors.primary, fontWeight: '800' }}>Forget my answers</Text></TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
