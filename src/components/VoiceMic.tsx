import { useEffect, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from './UI';
import { Chip } from './Chip';
import Buddy from '../motion/Buddy';
import { LOCALES, listen, speechAvailable } from '../utils/speech';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Character mic. Hidden when the speech package is not in this build. Heard text goes to an editable review, never straight to the log.
export function VoiceMic({ onText, onError }: { onText: (t: string) => void; onError: (m: string) => void }) {
  const { S, colors } = useThemedStyles();
  const [on, setOn] = useState(false);
  const [locale, setLocale] = useState('en-IN');
  const [live, setLive] = useState('');
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => { AsyncStorage.getItem('ff-voice-locale').then((v) => v && setLocale(v)).catch(() => {}); return () => stop.current?.(); }, []);
  if (!speechAvailable()) return null;
  const toggle = async () => {
    if (on) { stop.current?.(); return; }
    setLive(''); setOn(true);
    stop.current = await listen(locale, { onResult: (t, final) => { setLive(t); if (final && t) onText(t); }, onEnd: () => setOn(false), onError: (m) => { setOn(false); onError(m); } });
  };
  return (
    <View style={{ marginTop: 8 }}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={on ? 'Stop listening' : 'Speak your meal'} accessibilityState={{ selected: on }} onPress={toggle} style={[S.button, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primary : colors.chipBg }]}>
        <Buddy scene={on ? 'powerup' : 'wave'} size={32} />
        <Text style={{ marginLeft: 8, fontWeight: '800', color: on ? '#fff' : colors.ink }}>{on ? 'Listening… tap to stop' : 'Speak your meal'}</Text>
      </TouchableOpacity>
      {on && !!live && <Text style={[S.muted, { marginTop: 4 }]} accessibilityLiveRegion="polite">“{live}”</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
        {LOCALES.map(([id, l]) => <Chip key={id} small label={l} active={locale === id} onPress={() => { setLocale(id); AsyncStorage.setItem('ff-voice-locale', id).catch(() => {}); }} />)}
      </View>
    </View>
  );
}
