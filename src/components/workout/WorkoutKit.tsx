// Small building blocks shared by every Workout screen, so the tab looks and behaves as one thing.
// Colours come from the app theme (light + dark); the one addition is an orange "energy" accent for the main actions.
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Text, TextInput, TouchableOpacity, View, ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { lift, radius, useTheme } from '../../utils/theme';
import { tapHaptic } from '../../utils/haptics';
import { Exercise, Cat } from '../../data/workoutPlan';
import { figureFor, ROLE_COLORS } from '../../utils/exerciseFigure';
import { Shapes } from '../ExercisePic';
import { photoFor } from '../../data/exerciseImages';

/** Solid orange that keeps white text readable (4.5:1). */
export const ACCENT = '#C94F08';

export function useWK() {
  const { colors: c, isDark } = useTheme();
  return useMemo(() => ({
    c, isDark,
    accent: ACCENT,
    accentText: isDark ? '#F59A55' : '#B84304',        // orange used as text / icon colour on the page background
    accentSoft: isDark ? '#2B1D12' : '#FFF1E6',
    accentLine: isDark ? '#5A3516' : '#F6CDAE',
    good: c.success, goodSoft: c.successSoft,
  }), [c, isDark]);
}

export const CAT_EMOJI: Record<Cat, string> = { Chest: '🫁', Back: '🦾', Shoulders: '💪', Arms: '💪', Legs: '🦵', Glutes: '🍑', Core: '🎯', Cardio: '🏃' };

// ------------------------------------------------------------------------------------------------ layout
export function Card({ children, style, onPress, tint }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void; tint?: 'accent' | 'good' }) {
  const k = useWK();
  const base: ViewStyle = {
    backgroundColor: tint === 'accent' ? k.accentSoft : tint === 'good' ? k.goodSoft : k.c.card,
    borderRadius: radius.lg, padding: 16, marginBottom: 12,
    borderWidth: tint === 'accent' ? 1 : k.c.cardBorderWidth, borderColor: tint === 'accent' ? k.accentLine : k.c.cardBorder,
    ...lift(k.c, 1),
  };
  if (onPress) return <TouchableOpacity activeOpacity={0.85} onPress={() => { tapHaptic(); onPress(); }} style={[base, style]}>{children}</TouchableOpacity>;
  return <View style={[base, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const k = useWK();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 10 }}>
      <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '800', color: k.c.ink, letterSpacing: -0.2 }}>{children}</Text>
      {right}
    </View>
  );
}

export function Header({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack?: () => void; right?: React.ReactNode }) {
  const k = useWK();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10, gap: 8 }}>
      {onBack !== undefined && (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={() => { tapHaptic(); (onBack || (() => router.back()))(); }}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: k.c.chipBg, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={22} color={k.c.ink} />
        </TouchableOpacity>
      )}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} accessibilityRole="header" style={{ fontSize: 20, fontWeight: '900', color: k.c.ink, letterSpacing: -0.3 }}>{title}</Text>
        {!!subtitle && <Text numberOfLines={1} style={{ fontSize: 12.5, color: k.c.muted, marginTop: 1 }}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

export function Seg<T extends string>({ options, value, onChange }: { options: { k: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  const k = useWK();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: k.c.chipBg, borderRadius: radius.pill, padding: 4, marginBottom: 14, borderWidth: 1, borderColor: k.c.border }} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.k === value;
        return (
          <TouchableOpacity key={o.k} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => { if (!on) { tapHaptic(); onChange(o.k); } }}
            style={{ flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? k.accent : 'transparent' }}>
            <Text style={{ fontWeight: '800', fontSize: 13.5, color: on ? '#fff' : k.c.muted }}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------ controls
export function Btn({ label, onPress, kind = 'primary', icon, disabled, small, style }: { label: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'soft' | 'danger'; icon?: string; disabled?: boolean; small?: boolean; style?: ViewStyle }) {
  const k = useWK();
  const bg = kind === 'primary' ? k.accent : kind === 'danger' ? k.c.dangerSolid : kind === 'soft' ? k.accentSoft : 'transparent';
  const fg = kind === 'primary' || kind === 'danger' ? '#fff' : kind === 'soft' ? k.accentText : k.c.ink;
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} activeOpacity={0.85} disabled={disabled}
      onPress={() => { tapHaptic(); onPress(); }}
      style={[{ minHeight: small ? 44 : 54, borderRadius: radius.md, paddingHorizontal: small ? 14 : 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: bg, borderWidth: kind === 'ghost' ? 1.5 : 0, borderColor: k.c.border, opacity: disabled ? 0.5 : 1 }, kind === 'primary' ? lift(k.c, 2) : null, style]}>
      {!!icon && <Ionicons name={icon as any} size={small ? 17 : 20} color={fg} />}
      <Text style={{ color: fg, fontWeight: '800', fontSize: small ? 14 : 16 }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function IconBtn({ icon, onPress, label, color, bg, size = 44 }: { icon: string; onPress: () => void; label: string; color?: string; bg?: string; size?: number }) {
  const k = useWK();
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={() => { tapHaptic(); onPress(); }} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg || k.c.chipBg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon as any} size={Math.round(size * 0.48)} color={color || k.c.ink} />
    </TouchableOpacity>
  );
}

export function Pill({ text, tone = 'plain', icon }: { text: string; tone?: 'plain' | 'accent' | 'good' | 'warn'; icon?: string }) {
  const k = useWK();
  const bg = tone === 'accent' ? k.accentSoft : tone === 'good' ? k.c.successSoft : tone === 'warn' ? k.c.warnSoft : k.c.chipBg;
  const fg = tone === 'accent' ? k.accentText : tone === 'good' ? k.c.successInk : tone === 'warn' ? k.c.warnInk : k.c.muted;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: bg, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 }}>
      {!!icon && <Ionicons name={icon as any} size={12} color={fg} />}
      <Text style={{ color: fg, fontWeight: '800', fontSize: 11.5 }}>{text}</Text>
    </View>
  );
}

export function Tile({ icon, value, label, tint }: { icon: string; value: string; label: string; tint?: string }) {
  const k = useWK();
  return (
    <View style={{ flex: 1, backgroundColor: k.c.card, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', borderWidth: k.c.cardBorderWidth || 1, borderColor: k.c.cardBorderWidth ? k.c.cardBorder : k.c.border }}
      accessible accessibilityLabel={`${label}: ${value}`}>
      <Ionicons name={icon as any} size={20} color={tint || k.accentText} />
      <Text style={{ fontSize: 17, fontWeight: '900', color: k.c.ink, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={{ fontSize: 11.5, color: k.c.muted, marginTop: 1, fontWeight: '600' }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function Bar({ pct, color, height = 8 }: { pct: number; color?: string; height?: number }) {
  const k = useWK();
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: p }} style={{ height, borderRadius: height, backgroundColor: k.c.chipBg, overflow: 'hidden' }}>
      <View style={{ width: `${p}%`, height: '100%', borderRadius: height, backgroundColor: color || k.accent }} />
    </View>
  );
}

export function Check({ checked, onPress, size = 30, label }: { checked: boolean; onPress?: () => void; size?: number; label?: string }) {
  const k = useWK();
  const body = (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: checked ? k.c.success : 'transparent', borderWidth: checked ? 0 : 2, borderColor: k.c.border }}>
      {checked && <Ionicons name="checkmark" size={Math.round(size * 0.62)} color={k.isDark ? '#06140D' : '#fff'} />}
    </View>
  );
  if (!onPress) return body;
  return (
    <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} onPress={() => { tapHaptic(); onPress(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>{body}</TouchableOpacity>
  );
}

/** − [value] +  The value can also be typed. Always shows the number in the person's unit; the caller converts. */
export function Stepper({ value, onChange, step = 1, min = 0, max = 999, decimals = 0, label, width = 120, highlight }: { value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; decimals?: number; label: string; width?: number; highlight?: boolean }) {
  const k = useWK();
  const fmt = (n: number) => (Number.isInteger(n) || decimals === 0 ? String(Math.round(n * 10) / 10) : n.toFixed(decimals));
  const [text, setText] = useState(fmt(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) { setSeen(value); setText(fmt(value)); }
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n * 100) / 100));
  const commit = () => { const n = Number(text.replace(',', '.')); if (Number.isFinite(n)) onChange(clamp(n)); else setText(fmt(value)); };
  const btn = (sign: 1 | -1) => (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${sign > 0 ? 'More' : 'Less'} ${label}`} onPress={() => { tapHaptic(); onChange(clamp(value + sign * step)); }}
      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }} style={{ width: 38, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={sign > 0 ? 'add' : 'remove'} size={20} color={k.accentText} />
    </TouchableOpacity>
  );
  return (
    <View style={{ width, flexDirection: 'row', alignItems: 'center', backgroundColor: k.c.chipBg, borderRadius: radius.sm, borderWidth: highlight ? 2 : 1, borderColor: highlight ? k.accent : k.c.border }}>
      {btn(-1)}
      <TextInput accessibilityLabel={label} value={text} onChangeText={setText} onBlur={commit} onSubmitEditing={commit} keyboardType={decimals ? 'decimal-pad' : 'number-pad'} selectTextOnFocus
        style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '900', color: k.c.ink, paddingVertical: 8, minWidth: 36 }} />
      {btn(1)}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------ pictures
/** A small picture of the exercise (first pose of the illustrated figure). Falls back to an emoji tile when there is no figure. */
export function ExerciseThumb({ ex, size = 56, radiusPx = 14 }: { ex: Exercise; size?: number; radiusPx?: number }) {
  const k = useWK();
  const fig = useMemo(() => {
    try {
      const kind = ({ Dumbbell: 'free weights', Cable: 'cable', Machine: 'machine', Band: 'band' } as Record<string, string>)[ex.gear];
      return figureFor({ id: ex.fig, slot: ex.slot, name: ex.name, kind, targets: ex.targets });
    } catch { return null; }
  }, [ex.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const col = (ROLE_COLORS as any)[k.isDark ? 'dark' : 'light'];
  const photo = useMemo(() => photoFor(ex.name), [ex.name]); // the real photo wins over the drawing, same rule as the web app
  return (
    <View style={{ width: size, height: size, borderRadius: radiusPx, backgroundColor: photo ? '#fff' : col.bg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: k.c.border }}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {photo ? <Image source={photo.thumb} style={{ width: size, height: size }} resizeMode="contain" fadeDuration={0} />
        : fig ? (
        <Svg viewBox="0 0 120 100" width={size} height={size * 0.83}>
          <Line x1={4} y1={91.6} x2={116} y2={91.6} stroke={col.floor} strokeWidth={2} strokeLinecap="round" />
          <Shapes list={fig.env} c={col} />
          <Shapes list={(fig.cables && fig.cables[0]) || []} c={col} />
          <Shapes list={fig.frames[0]} c={col} />
        </Svg>
      ) : <Text style={{ fontSize: Math.round(size * 0.46) }}>{CAT_EMOJI[ex.cat]}</Text>}
    </View>
  );
}

export const minutesText = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim() : `${m} min`);

/** Re-renders every `ms` milliseconds with the current time (for clocks and countdowns). */
export function useNow(ms = 1000): number {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}
