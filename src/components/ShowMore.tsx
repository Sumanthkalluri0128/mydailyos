import React, { useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../utils/theme';

/** Long history lists start with the newest few entries; one tap reveals the rest, and the same tap folds them away again. */
export function useShowMore<T>(items: T[], limit = 3) {
  const [open, setOpen] = useState(false);
  return { shown: open ? items : items.slice(0, limit), hidden: Math.max(0, items.length - limit), open, toggle: () => setOpen((o) => !o) };
}

export function ShowMoreButton({ hidden, open, onPress, noun = 'days' }: { hidden: number; open: boolean; onPress: () => void; noun?: string }) {
  const { colors } = useTheme();
  if (hidden <= 0) return null;
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={open ? `Show fewer ${noun}` : `Show ${hidden} more ${noun}`} onPress={onPress}
      style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
      <Text style={{ color: colors.primary, fontWeight: '800' }}>{open ? 'Show less ⌃' : `Show ${hidden} more ${noun} ⌄`}</Text>
    </TouchableOpacity>
  );
}
