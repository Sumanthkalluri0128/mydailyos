// Low / medium / high glycemic load for ONE serving. Only foods with a published value show it; every other food shows nothing.
import { Text, View } from 'react-native';
import { useThemedStyles } from './UI';

const LABEL: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };

export function GlycemicTag({ food }: { food: any }) {
  const { colors } = useThemedStyles();
  const g = food?.glycemic;
  if (!g?.known) return null;
  const band = g.glBand || g.giBand;
  const bg = band === 'low' ? colors.primarySoft : colors.chipBg;
  return (
    <View accessibilityLabel={`${LABEL[band]} glycemic ${g.glBand ? 'load' : 'index'}`} style={{ alignSelf: 'flex-start', backgroundColor: bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 2 }}>
      <Text style={{ fontSize: 11, fontWeight: '800', color: band === 'high' ? colors.muted : colors.primary }}>{LABEL[band]} {g.glBand ? 'GL' : 'GI'}</Text>
    </View>
  );
}

export function PairingTip({ food }: { food: any }) {
  const { S, colors } = useThemedStyles();
  if (!food?.pairing && !food?.glycemic?.known) return null;
  const g = food.glycemic;
  return (
    <View style={{ marginBottom: 10 }}>
      {g?.known && <Text style={S.muted}>GI {g.gi}{g.gl !== null && g.gl !== undefined ? ` · load ${g.gl} per serving` : ''}{g.verified === false ? ' (value being verified)' : ''}. Source: {g.source}</Text>}
      {!!food.pairing && <Text style={{ color: colors.ink, marginTop: 4 }}>💡 {food.pairing}</Text>}
    </View>
  );
}
