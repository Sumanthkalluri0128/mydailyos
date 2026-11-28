import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../utils/theme';
import { tapHaptic } from '../utils/haptics';

export function Chip({ label, active, onPress, small, a11y }: { label: string; active?: boolean; onPress?: () => void; small?: boolean; a11y?: string }) {
  const { colors: c } = useTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button" accessibilityState={{ selected: !!active }} accessibilityLabel={a11y || label}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }} activeOpacity={0.8}
      onPress={() => { tapHaptic(); onPress?.(); }}
      style={{
        paddingVertical: small ? 7 : 10, paddingHorizontal: small ? 12 : 15, borderRadius: 999, marginRight: 7, marginBottom: 7,
        backgroundColor: active ? c.primary : c.chipBg, borderWidth: active ? 0 : 1, borderColor: c.border,
      }}
    >
      <Text style={{ fontSize: small ? 12 : 13, fontWeight: '700', color: active ? '#fff' : c.ink }}>{label}</Text>
    </TouchableOpacity>
  );
}
