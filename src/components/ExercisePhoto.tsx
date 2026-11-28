// The real exercise photo (cut from the plan sheets) for the exercise screen. Tap to enlarge. Same photo-by-name rule as the web app
// (data/exerciseImages.ts is generated from the web file). No photo for a movement = the caller shows the drawn figure instead.
import { useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import { photoFor } from '../data/exerciseImages';
import { useTheme } from '../utils/theme';

/** Width / height of a bundled image, so strips and square photos both fill the card without stretching. */
function ratioOf(src: any, fallback = 1.6): number {
  try {
    const r = Image.resolveAssetSource(src);
    return r && r.width && r.height ? r.width / r.height : fallback;
  } catch { return fallback; }
}

export default function ExercisePhoto({ name, fallbackName }: { name?: string; fallbackName?: string }) {
  const { colors } = useTheme();
  const [zoom, setZoom] = useState(false);
  const photo = photoFor(name) || photoFor(fallbackName);
  if (!photo) return null;
  const src = photo.how || photo.thumb;
  const ratio = ratioOf(src);
  return (
    <>
      <Pressable onPress={() => setZoom(true)} accessibilityRole="button" accessibilityLabel={`Enlarge the photos for ${name}`}
        style={{ marginTop: 10, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' }}>
        <Image source={src} accessibilityLabel={`${name}: step by step photos`} style={{ width: '100%', aspectRatio: Math.max(0.9, Math.min(ratio, 3.2)) }} resizeMode="contain" />
        <View style={{ position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>⤢ Tap to enlarge</Text>
        </View>
      </Pressable>
      <Modal visible={zoom} transparent animationType="fade" onRequestClose={() => setZoom(false)} statusBarTranslucent>
        <Pressable onPress={() => setZoom(false)} accessibilityRole="button" accessibilityLabel="Close"
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 12 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' }}>
            <Image source={src} style={{ width: '100%', aspectRatio: ratio }} resizeMode="contain" />
          </View>
          <Text style={{ color: '#fff', textAlign: 'center', marginTop: 12, fontWeight: '700' }}>Tap anywhere to close</Text>
        </Pressable>
      </Modal>
    </>
  );
}

/** The sheet's own tips for this movement (empty when there are none). */
export const tipsFor = (name?: string, fallbackName?: string): string[] => (photoFor(name) || photoFor(fallbackName))?.tips || [];
