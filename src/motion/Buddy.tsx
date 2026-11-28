// The day's character, acting out each screen. Same API as before: <Buddy scene="lift" size={80} says="Let's lift!" />   <BuddyEmpty scene="sad" title="No workout yet" text="…" />
// Which character you see depends on the day of the week (chars.ts); pass who="naruto" to pin one. RN's built-in Animated, no new dependencies.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, Text, View } from 'react-native';
import { useTheme } from '../utils/theme';
import { useReduceMotion } from './motion';
import { CHARS, dayChar, stickerFor, type Who } from './chars';
import { insights, say } from './talk';
import { getCtx, refreshCtx } from '../utils/journeyCtx';
import { tapHaptic } from '../utils/haptics';

export type BuddyScene = 'lift' | 'sad' | 'drink' | 'eat' | 'scale' | 'walk' | 'task' | 'plan' | 'chart' | 'health' | 'chef' | 'habit' | 'cheer' | 'wave' | 'powerup' | 'victory' | 'levelup' | 'run' | 'fight' | 'pushup';
type Body = 'bob' | 'push' | 'slump' | 'wobble' | 'bounce' | 'nod' | 'beat' | 'jump';
export const SCENES: Record<BuddyScene, { label: string; body: Body; dur: number }> = {
  lift:   { label: 'lifting weights',       body: 'push',   dur: 600 },
  sad:    { label: 'feeling disappointed',  body: 'slump',  dur: 1800 },
  drink:  { label: 'drinking water',        body: 'bob',    dur: 900 },
  eat:    { label: 'eating',                body: 'bob',    dur: 700 },
  scale:  { label: 'stepping on the scale', body: 'wobble', dur: 600 },
  walk:   { label: 'walking',               body: 'bounce', dur: 300 },
  task:   { label: 'checking off tasks',    body: 'nod',    dur: 800 },
  plan:   { label: 'planning the week',     body: 'nod',    dur: 800 },
  chart:  { label: 'showing your progress', body: 'bob',    dur: 800 },
  health: { label: 'feeling healthy',       body: 'beat',   dur: 450 },
  chef:   { label: 'cooking',               body: 'bob',    dur: 450 },
  habit:  { label: 'keeping the streak',    body: 'push',   dur: 700 },
  cheer:  { label: 'celebrating',           body: 'jump',   dur: 260 },
  wave:   { label: 'waving hello',          body: 'bob',    dur: 500 },
  powerup: { label: 'powering up',          body: 'jump',   dur: 320 },
  victory: { label: 'celebrating a win',    body: 'jump',   dur: 280 },
  levelup: { label: 'levelling up',         body: 'beat',   dur: 420 },
  run:    { label: 'training hard',         body: 'bounce', dur: 260 },
  fight:  { label: 'ready to fight',        body: 'push',   dur: 450 },
  pushup: { label: 'doing push-ups',        body: 'push',   dur: 550 },
};

/** Picks a scene from a toast's text so each feature gets its own pose. */
export function sceneForText(text = '', kind = 'success'): BuddyScene {
  if (kind === 'error' || kind === 'warning') return 'sad';
  const t = text.toLowerCase();
  if (/water|\bml\b|drink/.test(t)) return 'drink';
  if (/food|meal|calorie|ate |eaten|recipe/.test(t)) return 'eat';
  if (/exercise|workout|activity|training/.test(t)) return 'lift';
  if (/weight|weigh/.test(t)) return 'scale';
  if (/step|walk/.test(t)) return 'walk';
  if (/task|reminder|todo/.test(t)) return 'task';
  if (/habit|streak/.test(t)) return 'habit';
  if (/plan/.test(t)) return 'plan';
  return 'cheer';
}

/** A looping 0..1 value that goes back and forth. Stays at 0 when `run` is false (Reduce Motion). */
export function useYoyo(ms: number, run: boolean) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!run) { v.setValue(0); return; }
    v.setValue(0);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [ms, run]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

const bodySpec = (b: Body, s: number): { ty?: number[]; rot?: number[]; sc?: number[] } => ({
  bob: { ty: [0, -0.03 * s] }, push: { sc: [1, 1.05] }, slump: { sc: [1, 1.01] }, wobble: { rot: [-2.5, 2.5] },
  bounce: { ty: [0, -0.07 * s], rot: [-1, 1] }, nod: { ty: [0, 0.02 * s], rot: [0, 1.5] }, beat: { sc: [1, 1.045] }, jump: { ty: [0, -0.12 * s] },
}[b]);

const MOOD_SCENE: Record<string, BuddyScene> = { sad: 'sad', party: 'victory', drink: 'drink', eat: 'eat', lift: 'lift', sleep: 'sad', think: 'scale', angry: 'fight' };

export default function Buddy({ scene = 'wave', size = 96, says, label, who, talk = true }: { scene?: BuddyScene; size?: number; says?: string; label?: string; who?: Who; talk?: boolean }) {
  const cfg = SCENES[scene] || SCENES.wave;
  const reduce = useReduceMotion();
  const { colors: c } = useTheme();
  const char = who ?? dayChar();
  const v = useYoyo(cfg.dur, !reduce);
  const spec = bodySpec(cfg.body, size);
  const map = (arr: number[], f: (n: number) => any = (n) => n) => v.interpolate({ inputRange: [0, 1], outputRange: arr.map(f) });
  const transform: any[] = [];
  if (spec.ty) transform.push({ translateY: map(spec.ty) });
  if (spec.rot) transform.push({ rotate: map(spec.rot, (n) => `${n}deg`) });
  if (spec.sc) transform.push({ scale: map(spec.sc) });

  // Tap: hop with squash & stretch, switch to a matching sticker and say something about the day.
  const hop = useRef(new Animated.Value(0)).current;
  const [tap, setTap] = useState(0);
  const [mood, setMood] = useState<BuddyScene | null>(null);
  const [bubble, setBubble] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const onTap = () => {
    if (!talk) return;
    tapHaptic();
    const n = tap + 1; setTap(n);
    refreshCtx();
    const ins = insights(getCtx(), char);
    const line = ins.length && n % 2 ? ins[(n >> 1) % ins.length] : null;
    const m = line?.mood || ['hype', 'laugh', 'thumbs'][n % 3];
    setMood(MOOD_SCENE[m] || 'cheer');
    setBubble(line ? line.text : say(char, m));
    hop.setValue(0);
    Animated.spring(hop, { toValue: 1, useNativeDriver: true, stiffness: 260, damping: 8, mass: 0.7 }).start(() => hop.setValue(0));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setMood(null); setBubble(''); }, 3800);
  };
  const hopY = hop.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, -size * 0.28, 0] });
  const hopS = hop.interpolate({ inputRange: [0, 0.2, 0.5, 1], outputRange: [1, 1.1, 0.94, 1] });
  const pic = stickerFor(char, mood || scene, mood ? tap : 0);
  const buddy = (
    <View>
      {!!bubble && (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: size + 4, alignSelf: 'center', width: Math.max(150, size * 2), zIndex: 5, paddingVertical: 8, paddingHorizontal: 11, borderRadius: 14, backgroundColor: c.raised, borderWidth: 1, borderColor: c.border }}>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: c.ink }}>{bubble}</Text>
        </View>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel={label ?? `${CHARS[char]} is ${cfg.label}. Tap to chat.`} onPress={onTap} style={{ width: size, height: size }}>
        <Animated.View style={{ width: size, height: size, transform: [{ translateY: hopY }, { scale: hopS }, ...transform], transformOrigin: '50% 100%' } as any}>
          <Image source={pic.src} style={{ width: size, height: size }} resizeMode="contain" />
        </Animated.View>
      </Pressable>
    </View>
  );
  if (!says) return buddy;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {buddy}
      <View style={{ maxWidth: 190, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, backgroundColor: c.raised, borderWidth: 1, borderColor: c.border }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: c.ink }}>{says}</Text>
      </View>
    </View>
  );
}

/** Friendly empty state: a character instead of plain grey text. */
export function BuddyEmpty({ scene = 'sad', title, text, size = 110 }: { scene?: BuddyScene; title: string; text?: string; size?: number }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 14, gap: 4 }}>
      <Buddy scene={scene} size={size} />
      <Text style={{ fontSize: 16, fontWeight: '800', color: c.ink, marginTop: 4, textAlign: 'center' }}>{title}</Text>
      {!!text && <Text style={{ fontSize: 13, color: c.muted, textAlign: 'center' }}>{text}</Text>}
    </View>
  );
}
