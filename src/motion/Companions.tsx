// Roaming companion: ONE character wanders along the bottom of the screen (a different one tags in every few minutes), hop, nap at night, react to what you log,
// and can be picked up, dragged and THROWN (gravity + bounces). TAP it to open the interactive panel (CompanionPanel.tsx: it thinks through your real numbers,
// shows pace, best next move, mood check-in, 60-second challenge, ask box). Hold for quick actions, double-tap to celebrate. Analysis logic: brain.ts.
// Everything they say comes from your real data (talk.ts / journeyCtx.ts). Plain RN Animated/PanResponder, no new deps.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Image, PanResponder, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/theme';
import { hasSession, today } from '../config/api';
import { newClientId, write } from '../utils/offline';
import { CHARS, WHO_LIST, dayChar, stickerFor, type Who } from './chars';
import { CHIPS, insights, reactTo, reply, say } from './talk';
import { getCtx, onCtx, refreshCtx } from '../utils/journeyCtx';
import { impactHaptic, tapHaptic } from '../utils/haptics';
import { useReduceMotion } from './motion';
import CompanionPanel from './CompanionPanel';
import { addBond, bondLevel, bondXp, getNudgeState, noteEngaged, noteNudgeIgnored, noteNudgeShown } from './companionStore';
import { analyze, badgeFor, nudgeFor } from './brain';

const SIZE = 56, GRAV = 1900, BOUNCE = 0.46;   // companion size (was 80): smaller so it stays out of the way
import { bubbleOffset, ceilingY as ceilingYFor } from '../utils/layoutSafe';
const ceilingY = (H: number, floor: number, top: number) => ceilingYFor(H, floor, top, SIZE);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const idleScene = () => {
  const h = new Date().getHours();
  if (h >= 23 || h < 5) return 'sleep';
  if (h >= 6 && h < 9) return pick(['lift', 'drink', 'wave']);
  if (h >= 12 && h < 14) return pick(['eat', 'chef', 'wave']);
  if (h >= 19 && h < 22) return pick(['game', 'task', 'health', 'wave']);
  return pick(['wave', 'cheer', 'task', 'habit', 'health']);
};
const SCENE_OF: Record<string, string> = { drink: 'drink', eat: 'eat', lift: 'lift', sad: 'sad', party: 'victory', thumbs: 'habit', sleep: 'sleep', think: 'think', angry: 'angry' };

// Bond (how close you are to each character) now lives in companionStore.ts so the panel can share it.
const CAST_KEY = 'ff_companions_cast';
export { bondLevel };
const SNACKS = ['🍛', '🍜', '🍔', '🍱', '🥗', '🍎', '🍕'];
type Snack = { id: number; emoji: string; kind: 'food' | 'water'; x: number; y: number; vy: number; rest: boolean };
type Fx = { id: number; text: string; x: number; y: number };
function FloatFx({ f }: { f: Fx }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a, { toValue: 1, duration: 1200, useNativeDriver: true }).start(); }, [a]);
  return <Animated.Text pointerEvents="none" style={{ position: 'absolute', left: f.x - 12, top: f.y, fontSize: 20, opacity: a.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }), transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, -56] }) }, { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.3] }) }] }}>{f.text}</Animated.Text>;
}

type Sim = { x: number; y: number; vx: number; vy: number; dir: 1 | -1; mode: 'idle' | 'walk' | 'drag' | 'fly'; until: number; squash: number; t: number; target: null | { x: number; speed: number; snack?: Snack; until: number } };
// Bubble menu: icon tiles. Water / Food / Fix are real shortcuts; the rest are handled by ask().
const MENU: { k: string; icon: string; label: string; chip?: string }[] = [
  { k: 'water', icon: '💧', label: '+250 ml' }, { k: 'food', icon: '🍽️', label: 'Log food' },
  { k: 'next', icon: '🎯', label: "What's next", chip: "What's next?" }, { k: 'how', icon: '📊', label: 'How am I', chip: 'How am I doing?' },
  { k: 'motivate', icon: '🔥', label: 'Motivate', chip: 'Motivate me' }, { k: 'ask', icon: '💬', label: 'Ask me', chip: 'Ask me anything 💬' },
  { k: 'swap', icon: '🔄', label: 'Swap', chip: 'Swap me 🔄' },
];
type View_ = { w: Who; scene: string; seed: number; bubble: null | { who: string; text: string; chips?: boolean; picker?: boolean; bond?: number; nudge?: boolean } };

/** Host: only shown once signed in. */
export default function Companions() {
  const [signed, setSigned] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = () => hasSession().then((v) => alive && setSigned(v)).catch(() => {});
    check();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && check());
    const t = setInterval(check, 5000);
    return () => { alive = false; sub.remove(); clearInterval(t); };
  }, []);
  const path = usePathname();
  return signed && path !== '/assistant' ? <Layer /> : null;     // the chat screen is the character, so it is not floating on top of itself
}

function Badge({ b }: { b: { emoji: string; urgent: boolean } }) {
  const { colors: c } = useTheme();
  const reduce = useReduceMotion();
  const sc = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce) return undefined;
    const l = Animated.loop(Animated.sequence([Animated.timing(sc, { toValue: 1.2, duration: 650, useNativeDriver: true }), Animated.timing(sc, { toValue: 1, duration: 650, useNativeDriver: true })]));
    l.start(); return () => l.stop();
  }, [reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', top: -8, right: -8, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 3, backgroundColor: b.urgent ? '#E5484D' : c.raised, borderWidth: 1.5, borderColor: b.urgent ? '#fff' : c.border, alignItems: 'center', justifyContent: 'center', transform: [{ scale: sc }] }}>
      <Text style={{ fontSize: 12 }}>{b.emoji}</Text>
    </Animated.View>
  );
}

function Layer() {
  const { colors: c } = useTheme();
  const reduce = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const floor = insets.bottom + 74;                    // sits above the tab bar
  const who = useRef<Who[]>([]);
  if (!who.current.length) who.current = [dayChar()];
  const [view, setView] = useState<View_[]>(() => who.current.map((w, i) => ({ w, scene: idleScene(), seed: i, bubble: null })));
  const viewRef = useRef(view); viewRef.current = view;
  const [panel, setPanel] = useState(false);
  const panelOpenRef = useRef(false);
  const openPanelRef = useRef<() => void>(() => {});
  const nudgeStamp = useRef(0);
  const [badge, setBadge] = useState<{ emoji: string; urgent: boolean } | null>(null);
  const refs = useRef<(View | null)[]>([null]);
  const imgRefs = useRef<(View | null)[]>([null]);
  const dims = useRef({ W, H, floor, top: insets.top }); dims.current = { W, H, floor, top: insets.top };
  const sim = useRef<Sim[]>([0].map((i) => ({ x: 30 + i * 140, y: 0, vx: 0, vy: 0, dir: 1, mode: 'idle', until: Date.now() + 1500 + i * 1500, squash: 0, t: i, target: null }))).current;
  const timers = useRef<any[]>([]);
  const patch = (i: number, p: Partial<View_>) => setView((v) => v.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const bubble = (i: number, b: View_['bubble'], ms = 8000, scene?: string) => {
    patch(i, { bubble: b, ...(scene ? { scene, seed: Math.floor(Math.random() * 97) } : {}) });
    clearTimeout(timers.current[i]); timers.current[i] = setTimeout(() => patch(i, { bubble: null }), ms);
  };
  const hop = (i: number, p = 520) => { const s = sim[i]; if (s.y <= 1 && s.mode !== 'drag') { s.vy = p; s.squash = 0.35; } };
  // floating hearts / sparkles, snacks that fall from the sky, bond levels
  const [fx, setFx] = useState<Fx[]>([]);
  const [snacks, setSnacks] = useState<Snack[]>([]);
  const snackRef = useRef<Snack[]>([]); const snackEls = useRef<Record<number, View | null>>({});
  const burst = (i: number, text: string, n = 1) => {
    const made = Array.from({ length: n }, (_, k) => ({ id: Date.now() + i * 7 + k + Math.random(), text, x: sim[i].x + SIZE / 2 + (k - (n - 1) / 2) * 22, y: dims.current.H - dims.current.floor - SIZE - sim[i].y - 10 }));
    setFx((f) => [...f.slice(-12), ...made]); setTimeout(() => setFx((f) => f.filter((x) => !made.includes(x))), 1300);
  };
  const feelBond = (i: number, n: number, note?: string) => {
    const w = viewRef.current[i].w; const r = addBond(w, n);
    if (r.up) { burst(i, '💖', 3); bubble(i, { who: CHARS[w], text: `Bond level ${r.level}! ${note || "We're getting closer!"}` }, 4500, 'victory'); }
  };
  const dropSnack = (kind: 'food' | 'water') => {
    if (snackRef.current.filter((x) => x.kind === kind).length >= 3) return;
    const sn: Snack = { id: Date.now() + Math.random(), emoji: kind === 'water' ? pick(['💧', '🥤']) : pick(SNACKS), kind, x: rnd(30, Math.max(60, dims.current.W - 70)), y: dims.current.H * 0.55, vy: 0, rest: false };
    snackRef.current = [...snackRef.current, sn]; setSnacks((l) => [...l, sn]);
    setTimeout(() => { if (snackRef.current.includes(sn)) { snackRef.current = snackRef.current.filter((x) => x !== sn); setSnacks((l) => l.filter((x) => x.id !== sn.id)); } }, 20000);
  };
  // remembered cast: which two characters you chose
  useEffect(() => {
    AsyncStorage.getItem(CAST_KEY).then((v) => {
      if (!v) return; const c = JSON.parse(v); if (Array.isArray(c) && WHO_LIST.includes(c[0])) { who.current = [c[0]]; setView((vs) => vs.map((x, k) => ({ ...x, w: who.current[k] }))); }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (reduce) return undefined;
    let raf = 0, last = Date.now();
    const loop = () => {
      const now = Date.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const { W: w, floor: f } = dims.current;
      const H_ = dims.current.H;
      snackRef.current.forEach((sn) => {
        sn.vy -= GRAV * dt; sn.y += sn.vy * dt;
        // y here is "height above the floor"; start high, land at 0
        if (sn.y <= 0) { sn.y = 0; if (Math.abs(sn.vy) > 140) sn.vy = -sn.vy * 0.3; else { sn.vy = 0; sn.rest = true; } }
        snackEls.current[sn.id]?.setNativeProps({ style: { transform: [{ translateX: sn.x }, { translateY: H_ - f - 34 - sn.y }] } });
      });
      sim.forEach((s, i) => {
        s.t += dt;
        if ((s.mode === 'idle' || s.mode === 'walk') && !s.target && !viewRef.current[i].bubble) {
          const free = snackRef.current.filter((x) => x.rest && !sim.some((o) => o.target?.snack === x));
          if (free.length) { const nearest = [...free].sort((a, b) => Math.abs(a.x - s.x) - Math.abs(b.x - s.x))[0]; s.target = { x: nearest.x - 20, speed: 120, snack: nearest, until: now + 9000 }; s.mode = 'walk'; }
        }
        if (s.mode !== 'drag') {
          if (s.y > 0 || s.vy !== 0) {
            s.vy -= GRAV * dt; s.y += s.vy * dt;
            { const maxY = ceilingY(dims.current.H, dims.current.floor, dims.current.top); if (s.y > maxY) { s.y = maxY; if (s.vy > 0) s.vy = 0; } }
            if (s.y <= 0) { s.y = 0; if (Math.abs(s.vy) > 260) { s.vy = -s.vy * BOUNCE; s.squash = Math.min(0.45, Math.abs(s.vy) / 1400 + 0.2); } else { s.vy = 0; if (s.mode === 'fly') { s.mode = 'idle'; s.until = now + 600; s.vx = 0; } } }
          }
          if (s.mode === 'fly') { s.x += s.vx * dt; if (s.x < 0) { s.x = 0; s.vx = Math.abs(s.vx) * 0.6; } if (s.x > w - SIZE) { s.x = w - SIZE; s.vx = -Math.abs(s.vx) * 0.6; } s.vx *= s.y <= 0 ? 0.9 : 0.995; }
          else if (s.target) {
            const dx = s.target.x - s.x;
            if (Math.abs(dx) < 10 || now > s.target.until) {
              const t = s.target; s.target = null; s.mode = 'idle'; s.until = now + 1200;
              if (t.snack && snackRef.current.includes(t.snack)) {
                snackRef.current = snackRef.current.filter((x) => x !== t.snack); setSnacks((l) => l.filter((x) => x.id !== t.snack!.id));
                const w = viewRef.current[i].w; const water = t.snack.kind === 'water';
                patch(i, { scene: water ? 'drink' : 'eat', seed: Math.floor(Math.random() * 97) }); hop(i, 420); burst(i, water ? '💦' : '😋'); feelBond(i, 5, 'Thanks for the snack!');
                const q = getCtx()?.today?.quests?.find((x: any) => x.id === (water ? 'water' : 'calories'));
                bubble(i, { who: CHARS[w], text: water ? (q ? `Glug glug! You're at ${q.pct}% of your water goal.` : 'Glug glug! Stay hydrated, you!') : (q && q.value ? `Yum! That's ${q.value} of ${q.target} kcal today (${q.pct}%).` : say(w, 'eat')) }, 5200, water ? 'drink' : 'eat');
              }
            } else { s.dir = dx > 0 ? 1 : -1; s.x += s.dir * Math.min(Math.abs(dx), s.target.speed * dt); s.mode = 'walk'; }
          }
          else if (s.mode === 'walk') { s.x += s.dir * 42 * dt; if (s.x < 6) { s.x = 6; s.dir = 1; } if (s.x > w - SIZE - 6) { s.x = w - SIZE - 6; s.dir = -1; } if (now > s.until) { s.mode = 'idle'; s.until = now + rnd(2500, 7000); if (Math.random() < 0.6) patch(i, { scene: idleScene(), seed: Math.floor(rnd(0, 99)) }); } }
          else if (s.mode === 'idle' && now > s.until && !viewRef.current[i].bubble) {
            const hh = new Date().getHours();
            if (hh >= 23 || hh < 5) { s.until = now + 8000; patch(i, { scene: 'sleep' }); }
            else { s.mode = 'walk'; s.dir = Math.random() < 0.5 ? -1 : 1; s.until = now + rnd(2200, 5200); }
          }
        }
        s.squash *= Math.pow(0.0008, dt);
        const walking = s.mode === 'walk';
        const bob = walking ? Math.abs(Math.sin(s.t * 9)) * 6 : s.mode === 'idle' ? Math.sin(s.t * 2.2) * 1.5 : 0;
        const sx = 1 + s.squash * 0.6 - (s.vy > 0 ? 0.08 : 0), sy = 1 - s.squash * 0.55 + (s.vy > 200 ? 0.1 : 0);
        const rot = s.mode === 'fly' ? Math.max(-25, Math.min(25, s.vx * 0.03)) : s.mode === 'drag' ? Math.sin(s.t * 14) * 6 : walking ? Math.sin(s.t * 9) * 4 : 0;
        imgRefs.current[i]?.setNativeProps({ style: { transform: [{ scaleX: (s.dir < 0 && s.mode !== 'drag' ? -1 : 1) * sx }] } });
        refs.current[i]?.setNativeProps({ style: { transform: [{ translateX: s.x }, { translateY: -(s.y + bob) }, { scaleY: sy }, { rotate: `${rot}deg` }] } });
      });
      raf = requestAnimationFrame(loop);
    };
    sim.forEach((s, i) => { s.x = rnd(20, Math.max(40, dims.current.W - 120)); s.until = Date.now() + 1000 + i * 1500; });
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  // Attention badge: a pulsing icon on the character when your biggest gap deserves a look (refreshed whenever new numbers arrive).
  useEffect(() => {
    const upd = (cx: any) => setBadge(badgeFor(analyze(cx, new Date(), null)));
    upd(getCtx()); return onCtx(upd);
  }, []);
  // It speaks up on its own only when there is something worth saying (pace analysis), and talks less if you ignore it.
  useEffect(() => {
    refreshCtx();
    const t = setInterval(() => {
      if (AppState.currentState !== 'active' || viewRef.current.some((v) => v.bubble) || panelOpenRef.current) return;
      const s0 = sim[0]; if (s0.mode === 'drag' || s0.mode === 'fly') return;
      const i = 0, w = who.current[i];
      refreshCtx().then((ctx) => {
        if (panelOpenRef.current || viewRef.current.some((v) => v.bubble)) return;
        const n = nudgeFor(analyze(ctx, new Date(), null), { now: Date.now(), ...getNudgeState() }, new Date().getHours());
        if (!n) return;
        noteNudgeShown(n.key);
        const stamp = Date.now(); nudgeStamp.current = stamp;
        bubble(i, { who: CHARS[w], text: n.text, nudge: true }, 9000, SCENE_OF[n.mood] || 'cheer'); hop(i, 380);
        setTimeout(() => { if (nudgeStamp.current === stamp) { nudgeStamp.current = 0; noteNudgeIgnored(); } }, 9500);   // nobody reacted: back off next time
      });
    }, 30000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Other parts of the app can poke them: Companions.react('Water logged', 'success')
  useEffect(() => {
    listeners.add(async (text, kind) => {
      const i = 0;
      if (kind === 'success') await refreshCtx(true);
      const t = text.toLowerCase();
      if (kind === 'success' && /water|\bml\b|drink/.test(t)) { dropSnack('water'); return; }
      if (kind === 'success' && /food|meal|ate |eaten|recipe|logged|added/.test(t) && !/weight|task|habit|goal/.test(t)) { dropSnack('food'); return; }
      const r = reactTo(text, kind, getCtx(), who.current[i]);
      bubble(i, { who: CHARS[who.current[i]], text: r.text }, 6000, SCENE_OF[r.mood] || 'cheer'); hop(i, 560);
    });
    return () => listeners.clear();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lastTap = useRef([0]);
  const tapTimer = useRef<any>(0);
  const openMenuRef = useRef<(i: number) => void>(() => {});
  const openMenu = (i: number) => openMenuRef.current(i);
  const lastTouch = useRef(Date.now());
  const swapRef = useRef<((i: number, w: Who, note?: string) => void) | null>(null);
  const pans = useMemo(() => [0].map((i) => {
    let start = { x: 0, y: 0, moved: false, long: false, pts: [] as { x: number; y: number; t: number }[] }, holdT: any = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => { lastTouch.current = Date.now(); const s = sim[i]; start = { x: s.x, y: s.y, moved: false, long: false, pts: [{ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, t: Date.now() }] };
        clearTimeout(holdT); holdT = setTimeout(() => { if (!start.moved) { start.long = true; impactHaptic(); openMenu(i); } }, 520); },
      onPanResponderMove: (_e, g) => {
        const s = sim[i];
        if (!start.moved && Math.hypot(g.dx, g.dy) > 8) { clearTimeout(holdT); start.moved = true; s.mode = 'drag'; s.vx = 0; s.vy = 0; patch(i, { bubble: null, scene: 'shock', seed: 1 }); tapHaptic(); }
        if (start.moved) { s.x = Math.max(0, Math.min(dims.current.W - SIZE, start.x + g.dx)); s.y = Math.max(0, Math.min(ceilingY(dims.current.H, dims.current.floor, dims.current.top), start.y - g.dy)); start.pts.push({ x: g.moveX, y: g.moveY, t: Date.now() }); if (start.pts.length > 6) start.pts.shift(); }
      },
      onPanResponderTerminate: () => { clearTimeout(holdT); },
      onPanResponderRelease: (_e, g) => {
        clearTimeout(holdT);
        const s = sim[i], w = who.current[i];
        if (start.moved) {
          const a = start.pts[0], b = start.pts[start.pts.length - 1]; const dt = Math.max(0.016, (b.t - a.t) / 1000);
          s.vx = Math.max(-1400, Math.min(1400, (b.x - a.x) / dt)); s.vy = Math.max(-900, Math.min(1500, -(b.y - a.y) / dt)); s.mode = 'fly'; s.squash = 0;
          const speed = Math.hypot(s.vx, s.vy); impactHaptic();
          patch(i, { scene: speed > 900 ? 'shock' : 'cheer', seed: 2 }); setTimeout(() => patch(i, { scene: idleScene() }), 1800);
          if (speed > 1100) setTimeout(() => bubble(i, { who: CHARS[w], text: pick(['Whoaaa!', 'I can fly?!', 'Again again!', 'Wheee!']) }, 2200), 200);
          return;
        }
        if (start.long) return;                                   // press-and-hold already opened the quick menu
        const now = Date.now();
        if (now - lastTap.current[i] < 320) { // double tap: celebrate (cancels the pending "open chat")
          clearTimeout(tapTimer.current); hop(i, 760); impactHaptic(); burst(i, '🎉', 3); feelBond(i, 2); patch(i, { scene: 'victory', seed: now % 97 }); setTimeout(() => patch(i, { scene: idleScene() }), 2600); lastTap.current[i] = 0; return;
        }
        lastTap.current[i] = now; hop(i, 520); tapHaptic(); burst(i, '❤️'); feelBond(i, 1); s.mode = 'idle'; s.until = Date.now() + 9000;
        // a single tap opens the interactive panel (it thinks about your day; the full chat is one tap inside it)
        clearTimeout(tapTimer.current);
        tapTimer.current = setTimeout(() => { nudgeStamp.current = 0; noteEngaged(); openPanelRef.current(); }, 330);
      },
    });
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  openMenuRef.current = (i: number) => {
    const w = who.current[i]; hop(i, 420); burst(i, '❤️');
    refreshCtx().then((ctx) => {
      const ins = insights(ctx, w); const k = viewRef.current[i].seed || 0;
      const line = ins.length ? ins[k % ins.length] : { mood: 'hype', text: say(w, 'hype') };
      bubble(i, { who: CHARS[w], text: line.text, chips: true, bond: bondLevel(bondXp(w)) }, 12000, SCENE_OF[line.mood] || 'cheer'); patch(i, { seed: k + 1 });
    });
  };
  const swap = (i: number, w: Who, note?: string) => {
    who.current = who.current.map((x, k) => (k === i ? w : x)) as Who[];
    AsyncStorage.setItem(CAST_KEY, JSON.stringify(who.current)).catch(() => {});
    patch(i, { w, scene: 'victory', seed: Math.floor(Math.random() * 97), bubble: { who: CHARS[w], text: note || `${CHARS[w]} joins the party!` } }); hop(i, 760); impactHaptic(); burst(i, '✨', 3);
    clearTimeout(timers.current[i]); timers.current[i] = setTimeout(() => patch(i, { bubble: null, scene: idleScene() }), 3500);
  };
  swapRef.current = swap;
  openPanelRef.current = () => { panelOpenRef.current = true; patch(0, { bubble: null }); impactHaptic(); setPanel(true); };
  const closePanel = () => { panelOpenRef.current = false; setPanel(false); lastTouch.current = Date.now(); };
  const onPanelEvent = (e: { type: 'water' | 'dare' | 'mood' }) => {
    if (e.type === 'water') { hop(0, 420); burst(0, '💦', 2); }
    else if (e.type === 'dare') { hop(0, 760); burst(0, '💪', 3); patch(0, { scene: 'victory', seed: Date.now() % 97 }); setTimeout(() => patch(0, { scene: idleScene() }), 2600); }
    else { hop(0, 420); burst(0, '❤️'); }
  };
  // a different character tags in every few minutes, unless you're playing with this one
  useEffect(() => {
    const t = setInterval(() => {
      const s = sim[0]; const v = viewRef.current[0];
      if (AppState.currentState !== 'active' || v.bubble || s.mode === 'drag' || s.mode === 'fly' || s.target || snackRef.current.length) return;
      if (Date.now() - lastTouch.current < 45000) return;
      const h = new Date().getHours(); if (h >= 23 || h < 5) return;
      const next = pick(WHO_LIST.filter((k) => k !== v.w)); const prev = CHARS[v.w];
      bubble(0, { who: prev, text: pick(['Tagging out — see you!', "My turn's over, bye!", 'Time for a swap!']) }, 1800, 'wave');
      setTimeout(() => swapRef.current?.(0, next, `${prev} tagged you in!`), 1900);
    }, 170000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const menuAct = async (i: number, m: { k: string; chip?: string }) => {
    const w = who.current[i];
    if (m.k === 'food') { patch(i, { bubble: null }); router.push('/food' as any); return; }
    if (m.k === 'fix') { patch(i, { bubble: null }); router.push({ pathname: '/(tabs)', params: { open: 'fix' } } as any); return; }
    if (m.k === 'water') {
      try { await write('POST', '/api/water', { date: today(), amountMl: 250, clientId: newClientId('w') }, 'Water 250 ml'); refreshCtx(true); hop(i, 420); burst(i, '💦', 2); bubble(i, { who: CHARS[w], text: 'Glug glug! +250 ml logged. 💧' }, 3200, 'drink'); }
      catch { bubble(i, { who: CHARS[w], text: 'Hmm, I could not log that. Try again?' }, 3000, 'sad'); }
      return;
    }
    if (m.chip) ask(i, m.chip);
  };
  const closeBubble = (i: number) => { clearTimeout(timers.current[i]); patch(i, { bubble: null, scene: idleScene() }); };
  const holdBubble = (i: number) => clearTimeout(timers.current[i]);                                                     // stay open while touched
  const releaseBubble = (i: number) => { clearTimeout(timers.current[i]); timers.current[i] = setTimeout(() => patch(i, { bubble: null }), 6000); };
  const ask = (i: number, chip: string) => {
    if (chip.startsWith('Ask me anything')) { patch(i, { bubble: null }); openPanelRef.current(); return; }
    if (chip.startsWith('Swap me')) { bubble(i, { who: 'Choose who joins you', text: '', picker: true }, 20000); return; }
    if (chip === 'How am I doing?' || chip === "What's next?" || chip === 'Motivate me') { patch(i, { bubble: null }); hop(i, 420); openPanelRef.current(); return; }
    const w = who.current[i]; const r = reply(chip, w, getCtx());
    bubble(i, { who: CHARS[w], text: r.text, chips: true }, 14000, SCENE_OF[r.mood] || 'cheer'); hop(i, 420);
  };

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 50 }}>
      {snacks.map((sn) => <View key={sn.id} ref={(el) => { snackEls.current[sn.id] = el; }} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 26 }}>{sn.emoji}</Text></View>)}
      {fx.map((f) => <FloatFx key={f.id} f={f} />)}
      {view.map((v, i) => {
        const st = stickerFor(v.w, v.scene, v.seed);
        return (
          <View key={v.w} ref={(el) => { refs.current[i] = el; }} {...pans[i].panHandlers} accessibilityRole="button" accessibilityLabel={`${CHARS[v.w]} — tap for your day check-in, hold for quick actions, drag to throw`}
            style={{ position: 'absolute', left: 0, bottom: floor, width: SIZE, height: SIZE }}>
            <View ref={(el) => { imgRefs.current[i] = el; }}><Image source={st.src} style={{ width: SIZE, height: SIZE }} resizeMode="contain" /></View>
            {i === 0 && !!badge && !v.bubble && !panel && <Badge b={badge} />}
            {!!v.bubble && (
              <View style={{ position: 'absolute', bottom: SIZE + 6, left: bubbleOffset(sim[i].x, dims.current.W, SIZE, v.bubble.chips ? 256 : 220), width: Math.min(v.bubble.chips ? 256 : 220, dims.current.W - 16), alignItems: 'center' }} pointerEvents="box-none">
                <View onTouchStart={() => holdBubble(i)} onTouchEnd={() => releaseBubble(i)} style={{ maxWidth: v.bubble.chips ? 256 : 220, padding: 10, borderRadius: 14, backgroundColor: c.raised, borderWidth: 1, borderColor: c.border }} pointerEvents="box-none">
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: c.muted, textTransform: 'uppercase', flexShrink: 1 }}>{v.bubble.who}{v.bubble.bond ? ` · ❤️ bond ${v.bubble.bond}` : ''}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => closeBubble(i)} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.chipBg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 10, color: c.muted }}>✕</Text></Pressable>
                  </View>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: c.ink }}>{v.bubble.text}</Text>
                  {v.bubble.nudge && (
                    <Pressable accessibilityRole="button" accessibilityLabel="See details" onPress={() => { nudgeStamp.current = 0; noteEngaged(); clearTimeout(timers.current[i]); patch(i, { bubble: null }); openPanelRef.current(); }} style={{ marginTop: 6, alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 99, backgroundColor: c.primarySolid }}>
                      <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#fff' }}>See why ›</Text>
                    </Pressable>
                  )}
                  {v.bubble.picker && (
                    <ScrollView horizontal style={{ marginTop: 6, maxWidth: 210 }} showsHorizontalScrollIndicator={false}>
                      {WHO_LIST.map((x) => <Pressable key={x} accessibilityRole="button" accessibilityLabel={`Switch character to ${x}`} onPress={() => swap(i, x)} style={{ marginRight: 4, padding: 3, borderRadius: 10, backgroundColor: c.chipBg }}><Image source={stickerFor(x, 'cheer', 0).src} style={{ width: 38, height: 38 }} resizeMode="contain" /></Pressable>)}
                    </ScrollView>
                  )}
                  {v.bubble.chips && (() => {
                    const q = getCtx()?.today; const cal = q?.quests?.find((x: any) => x.id === 'calories');
                    const items = cal && cal.pct > 108 ? [{ k: 'fix', icon: '🌿', label: 'Fix my day' }, ...MENU] : MENU;
                    return (
                      <View>
                        {q?.total > 0 && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                            <View style={{ flex: 1, height: 6, borderRadius: 99, backgroundColor: c.chipBg, overflow: 'hidden' }}><View style={{ width: `${Math.round((q.done / q.total) * 100)}%`, height: 6, borderRadius: 99, backgroundColor: c.primarySolid }} /></View>
                            <Text style={{ fontSize: 10.5, fontWeight: '700', color: c.muted }}>{q.done}/{q.total} quests</Text>
                          </View>
                        )}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                          {items.map((m: any) => (
                            <Pressable key={m.k} accessibilityRole="button" accessibilityLabel={m.label} onPress={() => menuAct(i, m)}
                              style={({ pressed }) => ({ width: m.k === 'fix' ? '100%' : '23%', flexGrow: m.k === 'fix' ? 1 : 0, flexDirection: m.k === 'fix' ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: m.k === 'fix' ? 6 : 1, paddingVertical: 7, borderRadius: 12, backgroundColor: m.k === 'fix' ? '#e5484d22' : c.chipBg, transform: [{ scale: pressed ? 0.93 : 1 }] })}>
                              <Text style={{ fontSize: 18 }}>{m.icon}</Text>
                              <Text style={{ fontSize: 9.5, fontWeight: '800', color: m.k === 'fix' ? '#d13a40' : c.primary, textAlign: 'center' }} numberOfLines={1}>{m.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    );
                  })()}
                </View>
              </View>
            )}
          </View>
        );
      })}
      <CompanionPanel visible={panel} who={view[0].w} onClose={closePanel} onSwap={() => bubble(0, { who: 'Choose who joins you', text: '', picker: true }, 20000)} onEvent={onPanelEvent} />
    </View>
  );
}

const listeners = new Set<(text: string, kind: string) => void>();
/** Let the companions react to something that just happened, e.g. companionsReact('Water logged', 'success'). */
export const companionsReact = (text: string, kind = 'success') => listeners.forEach((f) => f(text, kind));
