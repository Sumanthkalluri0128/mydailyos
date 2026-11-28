import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { router } from 'expo-router';
import { useTheme, lift } from '../utils/theme';
import type { DayBalance } from '../utils/energy';
import type { Coach } from '../utils/coach';
import { Confetti } from '../motion/Confetti';
import { SPRING, useCelebrateOnce, useReduceMotion } from '../motion/motion';
import { successHaptic } from '../utils/haptics';
import Buddy, { type BuddyScene } from '../motion/Buddy';

const AC: any = Animated.createAnimatedComponent(Circle); // module scope: it used to be re-created on every render

const kj = (kcal: number, unit: string) => Math.round(unit === 'kJ' ? kcal * 4.184 : kcal);

function Ring({ size, stroke, pct, color, gradient, track, children, celebrateKey }: { size: number; stroke: number; pct: number; color: string; gradient?: [string, string]; track: string; children?: React.ReactNode; celebrateKey?: string }) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const anim = useRef(new Animated.Value(0)).current;
  const target = Math.max(0, Math.min(1, pct));
  const reduce = useReduceMotion();
  const pop = useRef(new Animated.Value(1)).current;
  const [fire, setFire] = useState(0);
  useCelebrateOnce(celebrateKey || 'ring', !!celebrateKey && target >= 1, () => {
    successHaptic();
    if (reduce) return;
    setFire((n) => n + 1);
    Animated.sequence([
      Animated.timing(pop, { toValue: 1.14, duration: 160, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, ...SPRING.bouncy, useNativeDriver: true }),
    ]).start();
  });
  useEffect(() => { Animated.timing(anim, { toValue: target, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(); }, [target, anim]);
  const offset = anim.interpolate({ inputRange: [0, 1], outputRange: [circ, 0] });
  const id = `g${size}${stroke}${color.replace('#', '')}`;
  return (
    <Animated.View style={{ width: size, height: size, transform: [{ scale: pop }] }}>
      <Svg width={size} height={size}>
        {gradient && <Defs><LinearGradient id={id} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={gradient[0]} /><Stop offset="1" stopColor={gradient[1]} /></LinearGradient></Defs>}
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <AC cx={size / 2} cy={size / 2} r={r} stroke={gradient ? `url(#${id})` : color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`} strokeDashoffset={offset} rotation={-90} originX={size / 2} originY={size / 2} />
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
      {!!celebrateKey && <Confetti fire={fire} />}
    </Animated.View>
  );
}

export type Mini = { key: string; icon: string; label: string; value: number; target: number; text: string; color: string; href: string };

/**
 * The whole "how is my day going" answer in one card, every number shown exactly once:
 *   coach line (what to do next) · calories ring (eaten / budget / activity) · water, steps, exercise rings.
 * Protein/carbs/fat live in the Macros card; the full calorie maths lives in the collapsible plan card.
 */
export function HomeHero({ bal, unit, minis, coach, onPressCalories, stepsPrompt, reaction }: {
  bal: DayBalance; unit: string; minis: Mini[]; coach: Coach; onPressCalories?: () => void; reaction?: { who?: any; scene: BuddyScene; says?: string } | null;
  stepsPrompt?: { kind: 'enable' | 'denied'; onPress: () => void } | null;
}) {
  const { colors: c } = useTheme();
  const over = bal.remaining < 0;
  const big = kj(Math.abs(bal.remaining), unit).toLocaleString();
  const a11y = over ? `${big} ${unit} over your budget today` : `${big} ${unit} left to eat today`;
  // Which character greets you: disappointed if the day is ending with no workout, cheering once the goal is met.
  const hour = new Date().getHours();
  const ex = minis.find((m) => m.key === 'exercise'), wa = minis.find((m) => m.key === 'water');
  const scene: BuddyScene = ex && ex.target > 0 && ex.value >= ex.target ? 'cheer'
    : ex && hour >= 17 && ex.value === 0 ? 'sad'
    : wa && hour >= 12 && wa.target > 0 && wa.value / wa.target < 0.4 ? 'drink'
    : ex && ex.value > 0 ? 'lift' : 'wave';
  const toneBg = coach.tone === 'great' ? c.successSoft : coach.tone === 'calm' ? c.chipBg : c.primarySoft;
  const toneInk = coach.tone === 'great' ? c.successInk : c.ink;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(fade, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }, [fade]);

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
      backgroundColor: c.card, borderWidth: c.cardBorderWidth, borderColor: c.cardBorder, borderRadius: 28, padding: 18, marginBottom: 16, ...lift(c, 2) }}>

      <View accessibilityRole="summary" style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: toneBg, borderRadius: 18, padding: 12, marginBottom: 18 }}>
        <View style={{ marginRight: 8, marginVertical: -6 }}><Buddy scene={reaction?.scene ?? scene} who={reaction?.who} size={64} label={reaction?.says ?? ""} /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: toneInk }}>{coach.title}</Text>
          <Text style={{ fontSize: 12.5, color: c.muted, marginTop: 1, lineHeight: 17 }}>{coach.text}</Text>
        </View>
      </View>

      <TouchableOpacity activeOpacity={0.9} onPress={onPressCalories} accessibilityRole="button" accessibilityLabel={`${a11y}. Open food log`} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ring size={150} stroke={15} pct={bal.budget > 0 ? bal.eaten / bal.budget : 0} color={over ? c.danger : c.kcal} gradient={over ? undefined : ['#F7B955', '#E8672A']} track={c.chipBg}>
          <Text style={{ fontSize: 31, fontWeight: '800', color: over ? c.danger : c.ink, letterSpacing: -1 }}>{big}</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: c.muted }}>{over ? `${unit} over` : `${unit} left`}</Text>
        </Ring>
        <View style={{ flex: 1, marginLeft: 18 }}>
          <Stat label="Eaten" value={kj(bal.eaten, unit).toLocaleString()} unit={unit} color={c.ink} c={c} />
          <Stat label="Budget" value={kj(bal.budget, unit).toLocaleString()} unit={unit} color={c.ink} c={c} sub={bal.bonus ? `+${kj(bal.bonus, unit).toLocaleString()} earned by activity` : undefined} />
          <Stat label="Activity" value={kj(bal.burned, unit).toLocaleString()} unit={unit} color={c.steps} c={c} last />
        </View>
      </TouchableOpacity>

      <View style={{ height: 1, backgroundColor: c.border, marginVertical: 18 }} />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {minis.map((m) => {
          const done = m.target > 0 && m.value >= m.target;
          return (
            <TouchableOpacity key={m.key} activeOpacity={0.85} onPress={() => router.push(m.href as any)} accessibilityRole="button"
              accessibilityLabel={`${m.label}: ${m.text}${done ? ', goal reached' : ''}`} style={{ alignItems: 'center', width: '31%' }}>
              <Ring size={66} stroke={7} pct={m.target > 0 ? m.value / m.target : 0} color={m.color} track={c.chipBg} celebrateKey={m.key}>
                <Text style={{ fontSize: 21 }}>{done ? '✅' : m.icon}</Text>
              </Ring>
              <Text style={{ fontSize: 13, fontWeight: '800', color: c.ink, marginTop: 8 }} numberOfLines={1}>{m.text}</Text>
              <Text style={{ fontSize: 12, color: c.muted, marginTop: 1 }}>{m.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {stepsPrompt && (
        <TouchableOpacity onPress={stepsPrompt.onPress} accessibilityRole="button" activeOpacity={0.85}
          style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: c.primarySoft, borderRadius: 14, padding: 12 }}>
          <Text style={{ fontSize: 18, marginRight: 10 }}>👟</Text>
          <Text style={{ flex: 1, fontSize: 12.5, color: c.ink, fontWeight: '600' }}>
            {stepsPrompt.kind === 'enable' ? 'Count your steps automatically' : 'Step counting is off — allow it in Settings'}
          </Text>
          <Text style={{ color: c.primary, fontWeight: '800' }}>{stepsPrompt.kind === 'enable' ? 'Turn on' : 'Open'}</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

function Stat({ label, value, unit, color, c, sub, last }: { label: string; value: string; unit: string; color: string; c: any; sub?: string; last?: boolean }) {
  return (
    <View style={{ marginBottom: last ? 0 : 12 }}>
      <Text style={{ fontSize: 12, fontWeight: '800', color: c.muted, letterSpacing: 0.6 }}>{label.toUpperCase()}</Text>
      <Text style={{ fontSize: 19, fontWeight: '800', color, marginTop: 1 }}>{value} <Text style={{ fontSize: 12, fontWeight: '600', color: c.muted }}>{unit}</Text></Text>
      {!!sub && <Text style={{ fontSize: 12, color: c.muted, marginTop: 1 }}>{sub}</Text>}
    </View>
  );
}
