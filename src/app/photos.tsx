// Progress photos are stored ONLY on this phone (never uploaded), which keeps them private.
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { Screen, useThemedStyles } from '../components/UI';
import { useNotifications } from '../components/Notifications';
import { today } from '../config/api';
import { prettyDate } from '../utils/dates';
import { initialPair, movePair, spanText } from '../utils/photoCompare';

type Photo = { name: string; uri: string; date: string };
const dir = () => new Directory(Paths.document, 'progress-photos');

function loadPhotos(): Photo[] {
  const d = dir();
  if (!d.exists) return [];
  return d.list().filter((x): x is File => x instanceof File && /\.jpe?g$/i.test(x.name))
    .map((f) => ({ name: f.name, uri: f.uri, date: f.name.slice(0, 10) }))
    .sort((a, b) => b.name.localeCompare(a.name));
}

export default function Photos() {
  const { S, colors } = useThemedStyles();
  const { error, success, undoableDelete } = useNotifications();
  const { width } = useWindowDimensions();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pairIdx, setPairIdx] = useState({ before: -1, after: -1 });
  const tile = (width - 40 - 16) / 3;

  const refresh = useCallback(() => { try { const p = loadPhotos().slice().sort((a, b) => a.name.localeCompare(b.name)); setPhotos(p); setPairIdx((cur) => (p.length && cur.after >= 0 && cur.after < p.length ? cur : initialPair(p))); } catch (e: any) { error('Could not read photos', e.message); } }, [error]);
  useEffect(refresh, [refresh]);

  const add = async (camera: boolean) => {
    try {
      const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return Alert.alert('Permission needed', camera ? 'Allow camera access in Settings to take a photo.' : 'Allow photo access in Settings to pick a photo.');
      const r = camera
        ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (r.canceled || !r.assets?.[0]) return;
      const d = dir(); if (!d.exists) d.create({ intermediates: true });
      const dest = new File(d, `${today()}-${Date.now()}.jpg`);
      new File(r.assets[0].uri).copy(dest);
      success('Photo saved', 'Stored privately on this phone.');
      refresh();
    } catch (e: any) { error('Could not save photo', e.message); }
  };

  const remove = (p: Photo) => {
    const before = photos;
    setPhotos((cur) => cur.filter((x) => x.name !== p.name));
    undoableDelete('Photo removed', () => { try { new File(p.uri).delete(); } catch (e: any) { error('Delete failed', e.message); } refresh(); }, () => setPhotos(before));
  };
  const b = photos[pairIdx.before], a = photos[pairIdx.after];
  const Scrub = ({ which, label }: { which: 'before' | 'after'; label: string }) => {
    const idx = which === 'before' ? pairIdx.before : pairIdx.after;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
        <Text style={{ width: 54, fontWeight: '800', color: colors.ink }}>{label}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label}: earlier photo`} onPress={() => setPairIdx(movePair(photos, pairIdx, which, idx - 1))} style={{ padding: 10 }}><Text style={{ color: colors.primary, fontSize: 20 }}>◀</Text></TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }} accessibilityLabel={`${label}: ${photos[idx]?.date || ''}`}>
          {photos.map((p, i) => <TouchableOpacity key={p.name} hitSlop={8} onPress={() => setPairIdx(movePair(photos, pairIdx, which, i))} accessibilityLabel={`${label}: ${p.date}`}><View style={{ width: i === idx ? 16 : 9, height: i === idx ? 16 : 9, borderRadius: 8, backgroundColor: i === idx ? colors.primary : colors.border }} /></TouchableOpacity>)}
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label}: later photo`} onPress={() => setPairIdx(movePair(photos, pairIdx, which, idx + 1))} style={{ padding: 10 }}><Text style={{ color: colors.primary, fontSize: 20 }}>▶</Text></TouchableOpacity>
      </View>
    );
  };

  return (
    <Screen>
      <Text style={S.title}>Progress photos</Text>
      <Text style={S.sub}>Private — saved only on this phone and never uploaded. They are removed if you uninstall the app.</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        <TouchableOpacity style={[S.button, { flex: 1 }]} onPress={() => add(true)}><Text style={S.buttonText}>📷 Take photo</Text></TouchableOpacity>
        <TouchableOpacity style={[S.button, { flex: 1, backgroundColor: colors.chipBg }]} onPress={() => add(false)}><Text style={[S.buttonText, { color: colors.ink }]}>🖼️ Choose</Text></TouchableOpacity>
      </View>

      {photos.length >= 2 && !!b && !!a && (
        <View style={[S.card, { padding: 12 }]}>
          <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: 8 }}>Before → After · {spanText(b, a)}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[b, a].map((p, k) => (
              <View key={`${k}-${p.name}`} style={{ flex: 1 }}>
                <Image source={{ uri: p.uri }} accessibilityLabel={`${k ? 'After' : 'Before'} photo, ${p.date}`} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 12, backgroundColor: colors.chipBg }} />
                <Text style={[S.muted, { textAlign: 'center', marginTop: 4 }]}>{prettyDate(p.date)}</Text>
              </View>
            ))}
          </View>
          <Scrub which="before" label="Before" />
          <Scrub which="after" label="After" />
        </View>
      )}
      {photos.length > 1 && <Text style={[S.muted, { marginBottom: 8 }]}>Slide the dates above to compare. Tap a photo to use it as After, long-press to delete.</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {photos.map((p) => (
          <TouchableOpacity key={p.name} onPress={() => setPairIdx((cur) => movePair(photos, cur, 'after', photos.indexOf(p)))} onLongPress={() => remove(p)} accessibilityLabel={`Photo from ${p.date}`}>
            <Image source={{ uri: p.uri }} style={{ width: tile, height: tile * 1.33, borderRadius: 12, borderWidth: photos[pairIdx.after]?.name === p.name ? 3 : 0, borderColor: colors.primary, backgroundColor: colors.chipBg }} />
            <Text style={[S.muted, { textAlign: 'center', marginTop: 3 }]}>{prettyDate(p.date)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!photos.length && <View style={S.card}><Text style={S.muted}>No photos yet. Take one today so you can see your progress later — same spot, same light, every 2–4 weeks.</Text></View>}
    </Screen>
  );
}
