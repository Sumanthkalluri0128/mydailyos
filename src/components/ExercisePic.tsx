// The picture for an exercise on the phone: same illustrated figure as the web app (utils/exerciseFigure.ts is the shared drawing).
// The whole range of movement in one picture (finish pose faint behind the start, dashed arrow), three key frames to tap, Play for a
// smooth loop, the muscles it works lit up, and a short "how to" under it. An `image` URL from the server shows a real photo instead.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Defs, Line, Marker, Path, Polygon, Rect } from 'react-native-svg';
import { useThemedStyles } from './UI';
import { figureFor, ROLE_COLORS } from '../utils/exerciseFigure';

export function Shapes({ list, c }: { list: any[]; c: Record<string, string> }) {
  return (
    <>
      {list.map((s, i) => {
        const col = c[s.role] || '#888';
        const op = s.hiShape ? 0.72 : s.o;
        if (s.k === 'line') return <Line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={col} strokeWidth={s.w} strokeLinecap="round" opacity={op} />;
        if (s.k === 'circle') return <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={col} opacity={op} />;
        if (s.k === 'poly') { const pts = s.pts.map((p: number[]) => p.join(',')).join(' '); return s.grow ? <Polygon key={i} points={pts} fill="none" stroke={col} strokeWidth={s.grow} strokeLinejoin="round" opacity={op} /> : <Polygon key={i} points={pts} fill={col} opacity={op} />; }
        if (s.k === 'rect') return <Rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} fill={col} opacity={op} rotation={s.rot ? s.rot[0] : undefined} origin={s.rot ? `${s.rot[1]}, ${s.rot[2]}` : undefined} />;
        if (s.k === 'path') return s.stroke ? <Path key={i} d={s.d} fill="none" stroke={col} strokeWidth={s.stroke} strokeLinecap="round" opacity={op} /> : <Path key={i} d={s.d} fill={col} opacity={op} />;
        return null;
      })}
    </>
  );
}

function Stage({ fig, frame, ghost, p, c, height, label }: { fig: any; frame: number; ghost: boolean; p: number | null; c: Record<string, string>; height: number; label: string }) {
  const live = p !== null ? fig.tween(p) : null;
  const a = fig.arrow;
  return (
    <Svg viewBox="0 0 120 100" width="100%" height={height} accessibilityLabel={label}>
      <Defs><Marker id="bpf-head" viewBox="0 0 6 6" refX="4.5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><Path d="M0,0 L6,3 L0,6 Z" fill={c.arrow} /></Marker></Defs>
      <Line x1={4} y1={91.6} x2={116} y2={91.6} stroke={c.floor} strokeWidth={2} strokeLinecap="round" />
      <Shapes list={fig.env} c={c} />
      {ghost && !live && <Shapes list={fig.ghost} c={c} />}
      {live ? <><Shapes list={live.cables} c={c} /><Shapes list={live.body} c={c} /></> : <><Shapes list={(fig.cables && fig.cables[frame]) || []} c={c} /><Shapes list={fig.frames[frame]} c={c} /></>}
      {!live && frame === 0 && a ? <Path d={`M ${a.from[0]} ${a.from[1]} Q ${(a.from[0] + a.to[0]) / 2 + a.bow} ${(a.from[1] + a.to[1]) / 2 - a.bow * 0.4} ${a.to[0]} ${a.to[1]}`} fill="none" stroke={c.arrow} strokeWidth={1.6} strokeDasharray="3 2.4" strokeLinecap="round" markerEnd="url(#bpf-head)" /> : null}
    </Svg>
  );
}

export default function ExercisePic({ ex, slot, image, name }: { ex?: any; slot?: string; image?: string; name?: string }) {
  const { colors, isDark } = useThemedStyles();
  const e = ex || { slot, name, image };
  const c = (ROLE_COLORS as any)[isDark ? 'dark' : 'light'];
  const fig = useMemo(() => { try { return figureFor(e); } catch { return null; } }, [e.id, e.slot, e.kind, (e.targets || []).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [p, setP] = useState(0);
  const timer = useRef<any>(null);
  useEffect(() => {
    if (!playing) return undefined;
    const t0 = Date.now();
    timer.current = setInterval(() => {
      const t = ((Date.now() - t0) / 1000) % 4.4;       // 1.4 s up, 0.8 s hold, 1.4 s back, 0.8 s hold
      setP(t < 1.4 ? t / 1.4 : t < 2.2 ? 1 : t < 3.6 ? 1 - (t - 2.2) / 1.4 : 0);
    }, 50);
    return () => clearInterval(timer.current);
  }, [playing]);

  if (e.image) return <Image source={{ uri: e.image }} accessibilityLabel={e.name || 'Exercise'} style={{ width: '100%', height: 220, borderRadius: 12, marginTop: 10 }} resizeMode="cover" />;
  if (!fig) return null;
  const label = `${e.name || 'Exercise'}: ${fig.labels[frame]}`;
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ borderRadius: 14, backgroundColor: c.bg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
        <Stage fig={fig} frame={frame} ghost={frame === 0} p={playing ? p : null} c={c} height={230} label={label} />
        <TouchableOpacity onPress={() => { setPlaying((v) => !v); setFrame(0); }} accessibilityRole="button" accessibilityState={{ selected: playing }} style={{ position: 'absolute', right: 8, bottom: 8, backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{playing ? '⏸ Pause' : '▶ Play'}</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 6, gap: 6 }}>
        {fig.labels.map((l: string, i: number) => (
          <TouchableOpacity key={l} style={{ flex: 1, borderRadius: 10, borderWidth: !playing && frame === i ? 2 : 1, borderColor: !playing && frame === i ? colors.primary : colors.border, backgroundColor: c.bg, paddingBottom: 3 }} onPress={() => { setPlaying(false); setFrame(i); }} accessibilityRole="button" accessibilityLabel={`Show ${l}`}>
            <Svg viewBox="0 0 120 100" width="100%" height={72}><Line x1={4} y1={91.6} x2={116} y2={91.6} stroke={c.floor} strokeWidth={2} /><Shapes list={fig.env} c={c} /><Shapes list={(fig.cables && fig.cables[i]) || []} c={c} /><Shapes list={fig.frames[i]} c={c} /></Svg>
            <Text style={{ textAlign: 'center', fontSize: 11, color: colors.ink, opacity: 0.85 }}>{i + 1}  {l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {fig.muscles.length > 0 && <Text style={{ marginTop: 8, color: colors.ink, fontSize: 13 }}><Text style={{ color: c.hi }}>●</Text> Works: <Text style={{ fontWeight: '800' }}>{fig.muscles.join(', ')}</Text>{e.helpers && e.helpers.length ? <Text style={{ color: colors.muted }}> · helped by {e.helpers.join(', ')}</Text> : null}</Text>}
    </View>
  );
}
