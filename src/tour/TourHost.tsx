// The tour UI for the phone: welcome (3 screens), a real spotlight with a cut-out, first-win cheers, the first-week checklist,
// screen hints with a "?" replay, "what's new" dots and the Rookie moment. State: tourStore.ts. Rules: tourEngine.js (shared with web).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Easing, Modal, Pressable, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/theme';
import { tapHaptic } from '../utils/haptics';
import Buddy from '../motion/Buddy';
import { CHARS, WHO_LIST, dayChar } from '../motion/chars';
import { hasSession, put } from '../config/api';
import { useProfile } from '../hooks/useProfile';
import * as T from './tourEngine';
import * as S from './tourStore';
import { measureAnchor, scrollAnchorIntoView } from './anchors';
import { RookieSticker } from './RookieSticker';

const BUILD = 33; // the app build "what's new" entries are compared with
const content = S.content;
import { ROUTE_OF, screenOf } from './screens';
const TAB_PAGES = new Set(['home', 'progress', 'tasks', 'profile']);

// ------------------------------------------------------------------------------------------------ measuring
function useAnchor(name: string | null | undefined, enabled: boolean, scroll = true) {
  const { width, height } = useWindowDimensions();
  const [rect, setRect] = useState<T.Rect | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    setRect(null); setMissing(false);
    if (!enabled || !name) return undefined;
    let alive = true, ticks = 0, scrolled = 0;
    const view = { w: width, h: height };
    const tick = async () => {
      if (!alive) return;
      const r = await measureAnchor(name);
      if (!alive) return;
      ticks += 1;
      if (r && T.usableRect(r, view)) {
        // below the fold but inside a ScrollView: bring it into view (at most 3 tries), then measure again
        const hidden = r.y + r.h > height - 8 || r.y < 0;
        if (scroll && hidden && scrolled < 3 && scrollAnchorIntoView(r, height)) { scrolled += 1; return; }
        setRect((p) => (p && Math.abs(p.x - r.x) < 1 && Math.abs(p.y - r.y) < 1 && Math.abs(p.w - r.w) < 1 && Math.abs(p.h - r.h) < 1 ? p : r));
        ticks = 0;
      } else if (ticks > 10) { setMissing(true); }
    };
    tick();
    const id = setInterval(tick, 400);   // also follows scrolling, rotation and the keyboard
    return () => { alive = false; clearInterval(id); };
  }, [name, enabled, width, height, scroll]);
  return { rect, missing };
}

// ------------------------------------------------------------------------------------------------ small pieces
function Btn({ label, onPress, primary, link, c, a11y }: { label: string; onPress: () => void; primary?: boolean; link?: boolean; c: any; a11y?: string }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y || label} onPress={() => { tapHaptic(); onPress(); }} hitSlop={6}
      style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: primary ? c.primary : 'transparent', borderWidth: primary || link ? 0 : 1, borderColor: c.border }}>
      <Text style={{ color: primary ? '#fff' : link ? c.muted : c.ink, fontWeight: primary ? '900' : '700', textDecorationLine: link ? 'underline' : 'none' }}>{label}</Text>
    </TouchableOpacity>
  );
}
const Dots = ({ n, on, c }: { n: number; on: number; c: any }) => (
  <View style={{ flexDirection: 'row', gap: 4, marginBottom: 10 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {Array.from({ length: n }, (_, i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 4, backgroundColor: i <= on ? c.primary : c.chipBg }} />)}
  </View>
);

// ------------------------------------------------------------------------------------------------ welcome
function Welcome({ profile, onClose }: { profile: any; onClose: () => void }) {
  const { colors: c } = useTheme();
  const saved = S.useSaved();
  const w = Number(profile?.currentWeightKg), t = Number(profile?.goals?.targetWeightKg);
  const guess = !(w > 0 && t > 0) || Math.abs(w - t) < 0.4 ? 'stay' : t < w ? 'lose' : 'build';
  const [i, setI] = useState(0);
  const [goal, setGoal] = useState(saved.goal || guess);
  const [coach, setCoach] = useState<string>(saved.coach || dayChar());
  const sc = content.welcome[i]; const last = i === content.welcome.length - 1;
  useEffect(() => { AccessibilityInfo.announceForAccessibility?.(`${sc.title}. ${sc.text}`); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = () => {
    if (sc.choice === 'goal') S.chooseGoal(goal);
    if (sc.choice === 'coach') { S.chooseCoach(coach); hasSession().then((ok) => ok && put('/api/food-prefs/coach', { who: coach, tone: '' })).catch(() => {}); }
    if (last) S.beginTour(); else setI(i + 1);
  };
  const choices = sc.choice === 'goal' ? content.goals.map((g) => ({ id: g.id, label: g.label, on: goal === g.id, set: () => setGoal(g.id) }))
    : sc.choice === 'coach' ? WHO_LIST.slice(0, 8).map((k) => ({ id: k, label: (CHARS as any)[k], on: coach === k, set: () => setCoach(k) })) : [];
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(10,8,30,0.6)', justifyContent: 'center', padding: 14 }} accessibilityViewIsModal>
        <View style={{ backgroundColor: c.card, borderRadius: 22, padding: 20, alignItems: 'center' }}>
          <View style={{ alignSelf: 'stretch' }}><Dots n={content.welcome.length} on={i} c={c} /></View>
          <Buddy scene={sc.choice === 'coach' ? 'cheer' : 'wave'} size={100} who={(sc.choice === 'coach' ? coach : dayChar()) as any} talk={false} />
          <Text accessibilityRole="header" style={{ color: c.ink, fontWeight: '900', fontSize: 21, marginTop: 6, textAlign: 'center' }}>{sc.emoji} {sc.title}</Text>
          <Text style={{ color: c.ink, fontSize: 15, lineHeight: 22, marginTop: 6, textAlign: 'center' }}>{sc.text}</Text>
          {choices.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12 }}>
              {choices.map((o) => (
                <TouchableOpacity key={o.id} accessibilityRole="button" accessibilityState={{ selected: o.on }} onPress={() => { tapHaptic(); o.set(); }}
                  style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 99, borderWidth: 2, borderColor: o.on ? c.primary : c.border, backgroundColor: o.on ? c.primarySoft : 'transparent', justifyContent: 'center' }}>
                  <Text style={{ color: c.ink, fontWeight: '800' }}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            {i > 0 && <Btn label="Back" onPress={() => setI(i - 1)} c={c} />}
            <Btn label={last ? 'Start the tour' : 'Next'} primary onPress={go} c={c} />
          </View>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
            <Btn label="Not now" link onPress={onClose} c={c} />
            <Btn label="Don't show again" link onPress={() => { S.dontShowAgain(); onClose(); }} c={c} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------------ spotlight
function Spotlight({ step, index, total, onNext, onBack, onSkip }: { step: any; index: number; total: number; onNext: () => void; onBack: () => void; onSkip: () => void }) {
  const { colors: c } = useTheme();
  const { width, height } = useWindowDimensions();
  const { rect, missing } = useAnchor(step.anchor, true);
  const [tip, setTip] = useState({ w: Math.min(320, width - 16), h: 170 });
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => { if (missing) S.skipMissing(); }, [missing]);
  useEffect(() => { AccessibilityInfo.announceForAccessibility?.(`Step ${index + 1} of ${total}. ${step.title}. ${step.text}`); }, [step.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { onSkip(); return true; }); return () => sub.remove(); }, [onSkip]);
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.out(Easing.quad), useNativeDriver: true }), Animated.timing(pulse, { toValue: 0, duration: 800, useNativeDriver: true })]));
    loop.start(); return () => loop.stop();
  }, [pulse]);
  if (!rect) return null;
  const pad = 6; const r = { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad), w: rect.w + pad * 2, h: rect.h + pad * 2 };
  const pos = T.placeTip(r, { w: width, h: height }, tip);
  const interactive = T.isInteractive(step.id);
  const dim = { position: 'absolute' as const, backgroundColor: 'rgba(10,8,30,0.58)' };
  const px = Math.max(16, Math.min(r.x + r.w / 2 - pos.x - 7, tip.w - 30));
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 300 }} pointerEvents="box-none">
      <View style={[dim, { left: 0, top: 0, right: 0, height: r.y }]} />
      <View style={[dim, { left: 0, right: 0, top: r.y + r.h, bottom: 0 }]} />
      <View style={[dim, { left: 0, top: r.y, width: r.x, height: r.h }]} />
      <View style={[dim, { left: r.x + r.w, top: r.y, right: 0, height: r.h }]} />
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: 14, borderWidth: 3, borderColor: c.primary, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }] }} />
      <View onLayout={(e) => { const { width: w, height: h } = e.nativeEvent.layout; if (Math.abs(w - tip.w) > 2 || Math.abs(h - tip.h) > 2) setTip({ w, h }); }}
        accessibilityViewIsModal accessibilityLabel={`${step.title}. ${step.text}`}
        style={{ position: 'absolute', left: pos.x, top: pos.y, width: Math.min(320, width - 16), backgroundColor: c.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: c.border, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 14 }}>
        <View pointerEvents="none" style={{ position: 'absolute', [pos.side === 'below' ? 'top' : 'bottom']: -7, left: px, width: 14, height: 14, backgroundColor: c.card, borderColor: c.border, borderLeftWidth: 1, borderTopWidth: 1, transform: [{ rotate: pos.side === 'below' ? '45deg' : '225deg' }] }} />
        <Dots n={total} on={index} c={c} />
        <Text accessibilityRole="header" style={{ color: c.ink, fontWeight: '900', fontSize: 16 }}>{step.title}</Text>
        <Text style={{ color: c.ink, fontSize: 14.5, lineHeight: 21, marginTop: 4 }}>{step.text}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 }}>
          {index > 0 && <Btn label="Back" onPress={onBack} c={c} />}
          <Btn label={interactive ? 'Skip this step' : index + 1 === total ? 'Finish' : 'Next'} primary onPress={onNext} c={c} />
          <Btn label="Skip tour" link onPress={onSkip} c={c} />
        </View>
      </View>
    </View>
  );
}

// ------------------------------------------------------------------------------------------------ first-week checklist (rendered on Home)
export function FirstWeekChecklist() {
  const { colors: c } = useTheme();
  const saved = S.useSaved();
  const [open, setOpen] = useState(true);
  if (!saved.welcomeSeen || saved.checklistDismissed) return null;
  const ck = T.checklistState(saved.events);
  return (
    <View testID="tour-checklist" style={{ backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 12, marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`Your first week, ${ck.label}`} onPress={() => setOpen(!open)} style={{ minHeight: 44, justifyContent: 'center', flex: 1 }}>
          <Text style={{ color: c.ink, fontWeight: '900' }}>Your first week · {ck.label}  {open ? '▾' : '▸'}</Text>
        </TouchableOpacity>
        {saved.status === 'paused' && <Btn label="Resume tour" onPress={S.resumeTour} c={c} />}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Hide first-week checklist" onPress={S.dismissChecklist} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.muted, fontSize: 16 }}>✕</Text></TouchableOpacity>
      </View>
      <Dots n={ck.total} on={ck.done - 1} c={c} />
      {open && ck.items.map((x) => (
        <View key={x.id} accessible accessibilityLabel={`${x.label}, ${x.done ? 'done' : 'to do'}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 34 }}>
          <Text>{x.done ? '✅' : '⬜'}</Text><Text style={{ color: x.done ? '#1c7a43' : c.ink, fontWeight: '700' }}>{x.label}</Text>
        </View>
      ))}
      {ck.complete && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <RookieSticker size={52} label={false} /><Text style={{ color: c.ink, fontWeight: '800', flex: 1 }}>{ck.reward?.text}</Text>
          {!saved.rewardClaimed && <Btn label="Claim" primary onPress={S.claimReward} c={c} />}
        </View>
      )}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------ hints + what's new
function Hints({ screen, quiet, bottom }: { screen: string; quiet: boolean; bottom: number }) {
  const { colors: c } = useTheme();
  const saved = S.useSaved();
  const hint = !quiet ? T.hintsFor(screen, saved.hintsSeen)[0] : null;
  useEffect(() => { if (hint) AccessibilityInfo.announceForAccessibility?.(`Tip. ${hint.text}`); }, [hint?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!hint) return null;
  return (
    <View style={{ position: 'absolute', left: 10, right: 10, bottom, zIndex: 250, backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.primary, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, elevation: 10 }}>
      <Text style={{ color: c.ink, flex: 1, fontSize: 14, lineHeight: 20 }}>💡 {hint.text}</Text>
      <Btn label="Got it" primary onPress={() => S.markHints([hint.id])} c={c} />
    </View>
  );
}
function WhatsNew({ screen, quiet, bottom }: { screen: string; quiet: boolean; bottom: number }) {
  const { colors: c } = useTheme();
  const saved = S.useSaved();
  const entry = !quiet ? T.whatsNewFor(saved.newSeen, BUILD).find((w) => w.anchor) : null;
  const { rect } = useAnchor(entry?.anchor, !!entry, false);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [entry?.id, screen]);
  if (!entry || !rect) return null;
  return (
    <>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="What's new" onPress={() => setOpen(true)} style={{ position: 'absolute', left: rect.x + rect.w - 22, top: rect.y - 12, width: 44, height: 44, zIndex: 240, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#ff4f81', borderWidth: 2, borderColor: '#fff' }} />
      </TouchableOpacity>
      {open && (
        <View style={{ position: 'absolute', left: 10, right: 10, bottom, zIndex: 250, backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.primary, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ color: c.ink, flex: 1, fontSize: 14, lineHeight: 20 }}>🆕 {entry.text}</Text>
          <Btn label="Got it" primary onPress={() => { S.markNewSeen(entry.id); setOpen(false); }} c={c} />
        </View>
      )}
    </>
  );
}

// ------------------------------------------------------------------------------------------------ host (mounted once in the root layout)
export function TourHost() {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const { profile } = useProfile();
  const saved = S.useSaved();
  const [welcome, setWelcome] = useState(false);
  const [finish, setFinish] = useState(false);
  const [cheer, setCheer] = useState<string | null>(null);
  const screen = screenOf(path);
  const eng = T.init({ goal: saved.goal || 'stay', saved: saved.path.length ? saved : null });
  const step: any = saved.status === 'active' ? T.current({ ...eng, status: 'active' }) : null;

  useEffect(() => { S.hydrate().then(async () => { if (await hasSession()) S.syncFromServer(); }); return S.connectEvents(); }, []);
  // a brand-new account: welcome opens once on Home after onboarding
  useEffect(() => {
    if (welcome || saved.welcomeSeen || screen !== 'home') return undefined;
    let on = true; const id = setTimeout(async () => { if (on && (await S.tourPending()) && (await hasSession())) setWelcome(true); }, 1200);
    return () => { on = false; clearTimeout(id); };
  }, [screen, saved.welcomeSeen, welcome]);
  useEffect(() => S.onCheer(({ text }) => { setCheer(text); setTimeout(() => setCheer(null), 2400); }), []);
  // the tour wants another screen: take the person there
  useEffect(() => { if (step && screen && step.screen !== screen && ROUTE_OF[step.screen]) { try { router.navigate(ROUTE_OF[step.screen] as any); } catch { /* ignore */ } } }, [step?.id, screen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (saved.status === 'done' && !saved.rewardClaimed) setFinish(true); }, [saved.status, saved.rewardClaimed]);
  // Profile > "Replay" raises this through the store (status becomes active); nothing else needed here.

  const onSkip = useCallback(() => S.skipTour(), []);
  const onScreen = !!step && step.screen === screen;
  const quiet = welcome || !!step || finish;
  const tabBar = 62 + Math.max(insets.bottom, 8);
  const bottom = (screen && TAB_PAGES.has(screen) ? tabBar : Math.max(insets.bottom, 8)) + 10;
  const hasHints = !!(screen && T.allHints(screen).length);
  return (
    <>
      {welcome && <Welcome profile={profile} onClose={() => { S.closeWelcome(); setWelcome(false); }} />}
      {onScreen && <Spotlight key={step.id} step={step} index={saved.index} total={saved.path.length} onNext={S.nextStep} onBack={S.backStep} onSkip={onSkip} />}
      {finish && (
        <Modal transparent animationType="fade" onRequestClose={() => { S.claimReward(); setFinish(false); }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(10,8,30,0.6)', justifyContent: 'center', padding: 14 }} accessibilityViewIsModal>
            <View style={{ backgroundColor: c.card, borderRadius: 22, padding: 20, alignItems: 'center' }}>
              <Buddy scene="victory" size={110} who={dayChar() as any} talk={false} />
              <Text accessibilityRole="header" style={{ color: c.ink, fontWeight: '900', fontSize: 21, marginTop: 6 }}>You are a Rookie now</Text>
              <View style={{ marginVertical: 10 }}><RookieSticker size={92} ink={c.ink} /></View>
              <Text style={{ color: c.ink, textAlign: 'center', marginBottom: 12 }}>{content.checklistReward.text}</Text>
              <Btn label="Claim sticker" primary onPress={() => { S.claimReward(); setFinish(false); }} c={c} />
            </View>
          </View>
        </Modal>
      )}
      {cheer && (
        <View pointerEvents="none" accessibilityLiveRegion="polite" style={{ position: 'absolute', alignSelf: 'center', bottom: bottom + 8, zIndex: 320, backgroundColor: '#1c7a43', borderRadius: 99, paddingVertical: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Buddy scene="powerup" size={36} who={dayChar() as any} talk={false} /><Text style={{ color: '#fff', fontWeight: '800' }}>{cheer}</Text>
        </View>
      )}
      {screen && <Hints screen={screen} quiet={quiet} bottom={bottom} />}
      {screen && <WhatsNew screen={screen} quiet={quiet} bottom={bottom} />}
      {hasHints && !quiet && (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Show tips for this screen" onPress={() => { tapHaptic(); S.resetHints(screen as string); }}
          style={{ position: 'absolute', left: 10, bottom: bottom - 6, width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <Text style={{ color: c.ink, fontWeight: '900' }}>?</Text>
        </TouchableOpacity>
      )}
    </>
  );
}
