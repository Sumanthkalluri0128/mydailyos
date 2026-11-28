import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { TimerRing } from '../../motion/Press';
import { tapHaptic } from '../../utils/haptics';
import { EXERCISES, Exercise, PlanItem, Routine } from '../../data/workoutPlan';
import { clock } from '../../utils/workoutEngine';
import { Check, ExerciseThumb, IconBtn, Pill, useWK } from './WorkoutKit';

// ------------------------------------------------------------------------------------------------ one exercise in a list
export function ExerciseRow({ ex, line, sub, onPress, right, done, swapped }: { ex: Exercise; line?: string; sub?: string; onPress?: () => void; right?: React.ReactNode; done?: boolean; swapped?: boolean }) {
  const k = useWK();
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${ex.name}. ${line || ''}`} activeOpacity={0.85} disabled={!onPress} onPress={() => { tapHaptic(); onPress?.(); }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: k.c.card, borderRadius: 18, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: done ? k.c.success : k.c.border }}>
      <ExerciseThumb ex={ex} size={58} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: '800', color: k.c.ink }}>{ex.name}</Text>
        {!!line && <Text style={{ fontSize: 12.5, color: k.c.muted, marginTop: 2, fontWeight: '600' }}>{line}</Text>}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          {!!sub && <Text style={{ fontSize: 11.5, color: k.c.muted }}>{sub}</Text>}
          {swapped && <Pill text="Your swap" tone="accent" icon="swap-horizontal" />}
        </View>
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={20} color={k.c.muted} /> : null)}
      {done && <Check checked size={26} />}
    </TouchableOpacity>
  );
}

// ------------------------------------------------------------------------------------------------ "pick one alternative"
export function AlternativesSheet({ visible, onClose, item, currentId, onPick, onInfo }: { visible: boolean; onClose: () => void; item: PlanItem | null; currentId: string; onPick: (id: string) => void; onInfo?: (id: string) => void }) {
  const k = useWK();
  if (!item) return null;
  const orig = EXERCISES[item.ex];
  const row = (id: string, label?: string) => {
    const ex = EXERCISES[id];
    if (!ex) return null;
    const on = currentId === id;
    return (
      <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: on ? k.accentSoft : k.c.card, borderRadius: 16, padding: 10, borderWidth: on ? 2 : 1, borderColor: on ? k.accent : k.c.border }}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`How to do ${ex.name}`} onPress={() => onInfo?.(id)} disabled={!onInfo}><ExerciseThumb ex={ex} size={54} /></TouchableOpacity>
        <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`Use ${ex.name}`} activeOpacity={0.8} style={{ flex: 1, minHeight: 48, justifyContent: 'center' }} onPress={() => { tapHaptic(); onPick(id); }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: k.c.ink }} numberOfLines={2}>{ex.name}</Text>
          <Text style={{ fontSize: 12, color: k.c.muted, marginTop: 2 }} numberOfLines={1}>{label ? `${label} · ` : ''}{ex.gear} · {ex.muscles[0]}</Text>
        </TouchableOpacity>
        <Check checked={on} size={28} />
      </View>
    );
  };
  return (
    <BottomSheet visible={visible} title="Swap exercise" onClose={onClose}>
      <Text style={{ color: k.c.muted, fontSize: 13, lineHeight: 18 }}>Pick one that suits your space, equipment and comfort. Same muscles, same sets and reps. Your choice is remembered for this day.</Text>
      <Text style={{ fontWeight: '900', color: k.c.ink, fontSize: 14, marginTop: 4 }}>Original in your plan</Text>
      {row(item.ex, orig ? 'Plan' : undefined)}
      <Text style={{ fontWeight: '900', color: k.c.ink, fontSize: 14, marginTop: 6 }}>Alternatives <Text style={{ color: k.accentText }}>(pick one)</Text></Text>
      {item.alts.map((a) => row(a))}
    </BottomSheet>
  );
}

// ------------------------------------------------------------------------------------------------ warm-up / cool-down / mobility checklist
export function RoutineList({ rows, picks, done, onToggle, onPick, readOnly }: { rows: Routine[]; picks: Record<string, string>; done?: string[]; onToggle?: (id: string) => void; onPick: (rowId: string, name: string) => void; readOnly?: boolean }) {
  const k = useWK();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View>
      {rows.map((r) => {
        const chosen = picks[r.id] || r.name;
        const isOpen = open === r.id;
        const ticked = !!done?.includes(r.id);
        return (
          <View key={r.id} style={{ backgroundColor: k.c.card, borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: ticked ? k.c.success : k.c.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingLeft: 6, paddingRight: 10 }}>
              {onToggle && !readOnly ? <Check checked={ticked} onPress={() => onToggle(r.id)} label={`Done: ${chosen}`} /> : <View style={{ width: 12 }} />}
              <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: isOpen }} accessibilityLabel={`${chosen}. Show alternatives`} activeOpacity={0.8} onPress={() => { tapHaptic(); setOpen(isOpen ? null : r.id); }} style={{ flex: 1, minHeight: 48, justifyContent: 'center', paddingLeft: 4 }}>
                <Text style={{ fontSize: 14.5, fontWeight: '800', color: k.c.ink, textDecorationLine: ticked ? 'line-through' : 'none' }}>{chosen}</Text>
                <Text style={{ fontSize: 12, color: k.c.muted, marginTop: 1 }} numberOfLines={isOpen ? 3 : 1}>{r.detail}</Text>
              </TouchableOpacity>
              <Ionicons name={isOpen ? 'chevron-up' : 'swap-horizontal'} size={18} color={k.c.muted} />
            </View>
            {isOpen && (
              <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: k.c.muted, marginBottom: 6 }}>PICK ONE</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {[r.name, ...r.alts].map((a) => {
                    const on = a === chosen;
                    return (
                      <TouchableOpacity key={a} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { tapHaptic(); onPick(r.id, a); }}
                        style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, backgroundColor: on ? k.accent : k.c.chipBg, borderWidth: on ? 0 : 1, borderColor: k.c.border }}>
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? '#fff' : k.c.ink }}>{a}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------ rest countdown shown between sets
export function RestBar({ left, total, onSkip, onAdd }: { left: number; total: number; onSkip: () => void; onAdd: (s: number) => void }) {
  const k = useWK();
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: k.accentSoft, borderColor: k.accentLine, borderWidth: 1, borderRadius: 20, padding: 12 }}>
      <TimerRing totalSec={total} remainingSec={left} running={left > 0} size={64} stroke={6} color={k.accent} track={k.c.border}>
        <Text style={{ fontSize: 14, fontWeight: '900', color: k.accentText }}>{clock(left)}</Text>
      </TimerRing>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '900', color: k.c.ink, fontSize: 15 }}>Rest</Text>
        <Text style={{ color: k.c.muted, fontSize: 12.5 }}>Breathe. Next set when the ring is empty.</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add 15 seconds" onPress={() => { tapHaptic(); onAdd(15); }} style={{ minHeight: 44, minWidth: 48, borderRadius: 14, backgroundColor: k.c.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderColor: k.c.border }}>
        <Text style={{ fontWeight: '800', color: k.c.ink, fontSize: 13 }}>+15s</Text>
      </TouchableOpacity>
      <IconBtn icon="play-skip-forward" label="Skip rest" onPress={onSkip} bg={k.accent} color="#fff" />
    </View>
  );
}
