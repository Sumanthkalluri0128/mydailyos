// Monthly "season recap" image, drawn on this phone with react-native-svg and shared as a PNG. No server image API, nothing uploaded.
// Health numbers stay off unless you switch them on.
import { useEffect, useRef, useState } from 'react';
import { Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useThemedStyles } from './UI';
import { Chip } from './Chip';
import { useNotifications } from './Notifications';
import { get, today } from '../config/api';
import { buildCard, monthLabel } from '../utils/wrappedCard';
import { ACCENT, CHARS } from '../motion/chars';

const ym = (d: string) => d.slice(0, 7);
const prevMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`; };

export function WrappedCard() {
  const { S, colors } = useThemedStyles();
  const { error } = useNotifications();
  const { width } = useWindowDimensions();
  const thisMonth = ym(today());
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(thisMonth);
  const [health, setHealth] = useState(false);
  const [data, setData] = useState<any>(null);
  const svg = useRef<any>(null);

  useEffect(() => {
    if (!open) return; let alive = true;
    get<any>(`/api/wrapped?month=${month}&health=${health ? 1 : 0}`).then((j) => { if (alive && j?.success) setData(j.wrapped); }).catch((e: any) => { if (alive) error('Could not load', e.network ? 'This needs a connection.' : e.message); });
    return () => { alive = false; };
  }, [open, month, health]); // eslint-disable-line react-hooks/exhaustive-deps

  const who = data?.character?.who;
  const card = data ? buildCard(data, { accent: (who && (ACCENT as any)[who]) || '#6847e8', characterName: who ? (CHARS as any)[who] || who : '' }) : null;
  const size = Math.min(width - 56, 420);

  const share = () => {
    if (!svg.current?.toDataURL) { error('Could not make the image', 'Please try again.'); return; }
    svg.current.toDataURL(async (b64: string) => {
      try {
        const uri = `${FileSystem.cacheDirectory}flexfit-recap-${month}.png`;
        await FileSystem.writeAsStringAsync(uri, b64, { encoding: 'base64' });
        if (!(await Sharing.isAvailableAsync())) { error('Sharing is not available', 'The image was saved in the app cache.'); return; }
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your FlexFit season recap', UTI: 'public.png' });
      } catch (e: any) { error('Could not share', e.message); }
    });
  };

  return (
    <View style={S.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, fontWeight: '800', color: colors.ink, fontSize: 16 }}>Season recap</Text>
        <Chip small label={open ? 'Hide' : 'Make my card'} active={open} onPress={() => setOpen((o) => !o)} />
      </View>
      {open && (
        <>
          <Text style={S.muted}>A picture of your month with your streak, best week, favourite foods and characters. Made on this phone. Nothing is uploaded.</Text>
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            {[thisMonth, prevMonth(thisMonth)].map((m) => <Chip key={m} small label={monthLabel(m)} active={month === m} onPress={() => setMonth(m)} />)}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <Text style={{ flex: 1, color: colors.ink }}>Include my health numbers (workout days, calories, weight change)</Text>
            <Chip small label={health ? 'On' : 'Off'} active={health} onPress={() => setHealth((h) => !h)} />
          </View>
          {card && (
            <View style={{ alignItems: 'center', marginVertical: 12 }}>
              <Svg ref={svg} width={size} height={size * (card.h / card.w)} viewBox={`0 0 ${card.w} ${card.h}`} accessibilityLabel={`Season recap preview for ${monthLabel(month)}`}>
                {card.ops.map((o: any, i: number) => o.t === 'rect'
                  ? <Rect key={i} x={o.x} y={o.y} width={o.w} height={o.h} rx={o.r} fill={o.fill} />
                  : <SvgText key={i} x={o.x} y={o.y} fontSize={o.size} fontWeight={String(o.weight)} fill={o.fill} textAnchor={o.align === 'center' ? 'middle' : o.align === 'right' ? 'end' : 'start'}>{o.text}</SvgText>)}
              </Svg>
            </View>
          )}
          <TouchableOpacity style={S.button} onPress={share} disabled={!card} accessibilityRole="button" accessibilityLabel="Share the season recap image"><Text style={S.buttonText}>Share image</Text></TouchableOpacity>
        </>
      )}
    </View>
  );
}
