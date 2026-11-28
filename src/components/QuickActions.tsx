import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme, lift } from '../utils/theme';
import { PressableScale } from '../motion/Press';
import Buddy, { type BuddyScene } from '../motion/Buddy';

type Action = { key: string; icon: BuddyScene; label: string; onPress: () => void; busy?: boolean; onLongPress?: () => void };

/** One-tap shortcuts for the things people do many times a day. */
export type WaterOption = { label: string; ml: number };

export function QuickActions({ onWater, waterLabel, busy, waterOptions }: { onWater: (ml?: number) => void; waterLabel: string; busy?: boolean; waterOptions?: WaterOption[] }) {
  const { colors: c } = useTheme();
  const [menu, setMenu] = useState(false); // long-press on the water button opens the amount choices
  const actions: Action[] = [
    { key: 'food', icon: 'eat', label: 'Food', onPress: () => router.push('/food' as any) },
    { key: 'water', icon: 'drink', label: waterLabel, onPress: () => { setMenu(false); onWater(); }, busy, onLongPress: waterOptions?.length ? () => setMenu((v) => !v) : undefined },
    { key: 'plan', icon: 'plan', label: 'Plan', onPress: () => router.push('/plan' as any) },
    { key: 'workout', icon: 'lift', label: 'Workout', onPress: () => router.push('/exercise' as any) },
    { key: 'steps', icon: 'walk', label: 'Steps', onPress: () => router.push('/health' as any) },
  ];
  return (
    <View style={{ marginBottom: 20 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {actions.map((a) => (
        <PressableScale key={a.key} disabled={a.busy} accessibilityLabel={a.label}
          onPress={a.onPress} onLongPress={a.onLongPress} delayLongPress={350}
          accessibilityHint={a.onLongPress ? 'Press and hold to choose a different amount' : undefined}
          style={{ width: '18.8%', minHeight: 76, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: c.card,
            borderWidth: c.cardBorderWidth, borderColor: c.cardBorder, opacity: a.busy ? 0.6 : 1, ...lift(c, 1) }}>
          <Buddy scene={a.icon} size={44} label="" />
          <Text style={{ fontSize: 12, fontWeight: '700', color: c.ink, marginTop: 5 }} numberOfLines={1}>{a.label}</Text>
        </PressableScale>
      ))}
    </View>
    {menu && !!waterOptions?.length && (
      <View accessibilityRole="menu" style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, padding: 10, borderRadius: 18, backgroundColor: c.primarySoft }}>
        <Text style={{ fontWeight: '800', color: c.ink, marginRight: 10 }}>💧 Add</Text>
        {waterOptions.map((o) => (
          <TouchableOpacity key={o.label} accessibilityRole="menuitem" accessibilityLabel={`Add ${o.label} of water`} onPress={() => { setMenu(false); onWater(o.ml); }}
            style={{ minHeight: 44, minWidth: 64, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: c.card, marginRight: 8, borderWidth: 1, borderColor: c.primary }}>
            <Text style={{ fontWeight: '800', color: c.primary }}>{o.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity accessibilityLabel="Close" onPress={() => setMenu(false)} hitSlop={12} style={{ marginLeft: 'auto', padding: 6 }}><Text style={{ color: c.muted, fontSize: 18, fontWeight: '700' }}>✕</Text></TouchableOpacity>
      </View>
    )}
    </View>
  );
}
