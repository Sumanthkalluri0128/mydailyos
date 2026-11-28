// Drawn portion shapes (katori, roti, ladle, glass, spoon) with typical sizes. No photos.
import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { useThemedStyles } from './UI';
import { Chip } from './Chip';
import { GUIDES, guideText } from './portionGuides';

function Shape({ id, scale, color }: { id: string; scale: number; color: string }) {
  const fill = 'rgba(79,140,255,0.18)';
  if (id === 'katori') return <Svg width={80 * scale} height={60 * scale} viewBox="0 0 80 60"><Path d="M8 20 H72 Q70 52 40 54 Q10 52 8 20 Z" fill={fill} stroke={color} strokeWidth={2.5} /><Ellipse cx={40} cy={20} rx={32} ry={6} fill="none" stroke={color} strokeWidth={2.5} /></Svg>;
  if (id === 'roti') return <Svg width={64 * scale} height={64 * scale} viewBox="0 0 80 80"><Circle cx={40} cy={40} r={36} fill="rgba(224,160,48,0.25)" stroke={color} strokeWidth={2.5} /><Circle cx={28} cy={32} r={3} fill={color} opacity={0.35} /><Circle cx={50} cy={48} r={3.5} fill={color} opacity={0.35} /></Svg>;
  if (id === 'ladle') return <Svg width={90 * scale} height={60 * scale} viewBox="0 0 90 60"><Path d="M4 36 Q4 54 24 54 Q44 54 44 36 Z" fill={fill} stroke={color} strokeWidth={2.5} /><Path d="M44 38 L86 10" stroke={color} strokeWidth={4} strokeLinecap="round" /></Svg>;
  if (id === 'glass') return <Svg width={50 * scale} height={80 * scale} viewBox="0 0 50 80"><Path d="M8 6 H42 L38 74 H12 Z" fill="none" stroke={color} strokeWidth={2.5} /><Path d="M10 24 H40 L37.5 72 H12.5 Z" fill="rgba(79,140,255,0.25)" /></Svg>;
  return <Svg width={80 * scale} height={40 * scale} viewBox="0 0 80 40"><Ellipse cx={20} cy={20} rx={16} ry={11} fill={fill} stroke={color} strokeWidth={2.5} /><Path d="M36 20 H76" stroke={color} strokeWidth={4} strokeLinecap="round" /></Svg>;
}

export function PortionGuide() {
  const { S, colors } = useThemedStyles();
  const [open, setOpen] = useState(false);
  const [gid, setGid] = useState('katori');
  const g = GUIDES.find((x) => x.id === gid)!;
  return (
    <View style={{ marginBottom: 8 }}>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: colors.primary, fontWeight: '800' }}>📏 Portion guide {open ? '▴' : '▾'}</Text>
      </TouchableOpacity>
      {open && (
        <View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{GUIDES.map((x) => <Chip key={x.id} small label={x.title} active={x.id === gid} onPress={() => setGid(x.id)} />)}</View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginVertical: 10 }}>
            {g.items.map((i) => (
              <View key={i.id} style={{ alignItems: 'center' }} accessible accessibilityLabel={guideText(g, i)}>
                <Shape id={g.id} scale={i.scale} color={colors.ink} />
                <Text style={[S.muted, { fontSize: 12, marginTop: 4 }]}>{guideText(g, i)}</Text>
              </View>
            ))}
          </View>
          <Text style={[S.muted, { fontSize: 12 }]}>{g.note} Typical sizes: yours may differ.</Text>
        </View>
      )}
    </View>
  );
}
