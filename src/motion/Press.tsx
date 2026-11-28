// Tactile action feedback: PressableScale, AnimatedCheck, TimerRing.
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { impactHaptic, successHaptic, tapHaptic } from '../utils/haptics';
import { EASE, SPRING, useReduceMotion } from './motion';

const APressable = Animated.createAnimatedComponent(Pressable);
/** Wrap any button/card: sinks to 0.96 on touch, springs back with a little overshoot. Haptic on press-in. */
export function PressableScale({ children, style, scaleTo = 0.96, haptic = 'tap', onPressIn, onPressOut, ...rest }:
  PressableProps & { style?: StyleProp<ViewStyle>; scaleTo?: number; haptic?: 'tap' | 'impact' | 'none'; children?: React.ReactNode }) {
  const s = useRef(new Animated.Value(1)).current;
  const reduce = useReduceMotion();
  return (
    <APressable accessibilityRole="button" {...rest} style={[style, { transform: [{ scale: s }] }]}
      onPressIn={(e) => { if (haptic === 'tap') tapHaptic(); if (haptic === 'impact') impactHaptic(); if (!reduce) Animated.spring(s, { toValue: scaleTo, ...SPRING.snappy, useNativeDriver: true }).start(); onPressIn?.(e); }}
      onPressOut={(e) => { if (!reduce) Animated.spring(s, { toValue: 1, stiffness: 260, damping: 11, mass: 0.8, useNativeDriver: true }).start(); onPressOut?.(e); }}>
      {children}
    </APressable>
  );
}

const AP = Animated.createAnimatedComponent(Path);
/** Task/habit checkbox: circle fills, tick draws itself, quick pop + success haptic. Pair the label with `strike` for the strike-through. */
export function AnimatedCheck({ checked, onChange, size = 28, color = '#20A46B', borderColor = '#B9B9C8', label }:
  { checked: boolean; onChange?: (v: boolean) => void; size?: number; color?: string; borderColor?: string; label?: string }) {
  const reduce = useReduceMotion();
  const fill = useRef(new Animated.Value(checked ? 1 : 0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(fill, { toValue: checked ? 1 : 0, duration: reduce ? 0 : 300, easing: EASE.out, useNativeDriver: false }).start();
    if (checked && !reduce) Animated.sequence([
      Animated.timing(pop, { toValue: 1.25, duration: 120, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, ...SPRING.bouncy, useNativeDriver: true }),
    ]).start();
  }, [checked]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} hitSlop={10}
      onPress={() => { checked ? tapHaptic() : successHaptic(); onChange?.(!checked); }}>
      <Animated.View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pop }],
        borderColor: fill.interpolate({ inputRange: [0, 1], outputRange: [borderColor, color] }),
        backgroundColor: fill.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,0,0,0)', color] }) }}>
        <Svg width={size * 0.6} height={size * 0.6} viewBox="0 0 16 16">
          <AP d="M3 8.5 L6.5 12 L13 4.5" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray="16 16" strokeDashoffset={fill.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) as any} />
        </Svg>
      </Animated.View>
    </Pressable>
  );
}

const AC = Animated.createAnimatedComponent(Circle);
/** Focus-timer countdown ring: one linear timing for the whole session (JS only touches it on start/pause/resume). */
export function TimerRing({ totalSec, remainingSec, running, size = 180, stroke = 10, color = '#6847E8', track = 'rgba(120,120,150,.2)', children }:
  { totalSec: number; remainingSec: number; running: boolean; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode }) {
  const reduce = useReduceMotion();
  const prog = useRef(new Animated.Value(totalSec > 0 ? remainingSec / totalSec : 0)).current; // 1 = full, 0 = empty
  const kick = useRef(new Animated.Value(0)).current;
  const was = useRef(running);
  const r = (size - stroke) / 2, C = 2 * Math.PI * r;
  useEffect(() => {
    prog.stopAnimation();
    if (!running) { prog.setValue(totalSec > 0 ? remainingSec / totalSec : 0); return; }
    Animated.timing(prog, { toValue: 0, duration: remainingSec * 1000, easing: (t) => t, useNativeDriver: false }).start();
    if (!was.current && !reduce) { impactHaptic(); kick.setValue(0); Animated.timing(kick, { toValue: 1, duration: 800, easing: EASE.out, useNativeDriver: true }).start(); }
    was.current = running;
  }, [running, totalSec]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <AC cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${C} ${C}`}
          strokeDashoffset={prog.interpolate({ inputRange: [0, 1], outputRange: [C, 0] }) as any} rotation={-90} originX={size / 2} originY={size / 2} />
      </Svg>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: color,
        opacity: kick.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }), transform: [{ scale: kick.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.5] }) }] }} />
      {children}
    </Animated.View>
  );
}
