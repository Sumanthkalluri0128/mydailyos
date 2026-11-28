// ONE stat card for Home (water, steps, exercise, weight). Web and mobile share the same props, so the sticker's reserved slot,
// the ＋ button position and the card height live here once instead of being repeated per card.
//   width: card width in px (the sticker shrinks to fit after the badge and the ＋; it is hidden below 28 px, never cropped or on top of the ＋)
//   plus:  { label, onPress, tourRef?, testID? } adds the ＋ shortcut next to the badge
import React from 'react';
import { TouchableOpacity, Text, View } from 'react-native';
import { useTheme } from '../../utils/theme';
import { fitSticker } from '../../utils/layoutSafe';
import { Bar, Card, IconBadge, Peek } from './HomeParts';

export const STAT_CARD_MIN_HEIGHT = 158;

export function StatCard({ width, icon, tint, label, onPress, plus, sticker, children }: {
  width: number; icon: string; tint: string; label: string; onPress: () => void;
  plus?: { label: string; onPress: () => void; tourRef?: any; testID?: string };
  sticker?: number | null; children: React.ReactNode;
}) {
  const { colors: c } = useTheme();
  // reserved slot: after the badge (and the ＋) to the card edge
  const px = sticker ? (plus ? fitSticker(width - 16 - 98 - 8, 74, 28) : fitSticker(width - 16 - 56 - 8)) : 0;
  return (
    <Card onPress={onPress} label={label} tint={tint} style={{ width, minHeight: STAT_CARD_MIN_HEIGHT, overflow: 'visible' }}>
      <IconBadge emoji={icon} tint={tint} size={40} />
      {plus && <>
        {plus.tourRef && <View ref={plus.tourRef} testID={plus.testID} collapsable={false} pointerEvents="none" style={{ position: 'absolute', left: 64, top: 19, width: 34, height: 34 }} />}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={plus.label} hitSlop={8} onPress={plus.onPress}
          style={{ position: 'absolute', left: 64, top: 19, width: 34, height: 34, borderRadius: 17, backgroundColor: `${tint}33`, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: c.primary, fontSize: 18, fontWeight: '900', lineHeight: 20 }}>＋</Text>
        </TouchableOpacity>
      </>}
      {px > 0 && sticker ? <Peek src={sticker} size={px} style={{ right: 4, top: 0 }} /> : null}
      <View style={{ marginTop: 'auto' as any, paddingTop: 12 }}>{children}</View>
    </Card>
  );
}

/** The thin progress bar under a card's numbers. */
export function StatBar({ pct, color }: { pct: number; color: string }) {
  return <><View style={{ height: 8 }} /><Bar pct={pct} color={color} /></>;
}
