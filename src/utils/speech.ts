// On-device speech-to-text through `expo-speech-recognition` (native module: needs a development build, not Expo Go).
// The package is loaded only if it is installed, so the app builds and runs without it and the mic button simply stays hidden.
// Install: `npx expo install expo-speech-recognition`, add its config plugin in app.json, then make a new dev build (see docs/PHASE3_LOGGING1.md).
export const LOCALES: [string, string][] = [['en-IN', 'English'], ['hi-IN', 'हिन्दी'], ['te-IN', 'తెలుగు'], ['ta-IN', 'தமிழ்']];

type Mod = { ExpoSpeechRecognitionModule: any; addSpeechRecognitionListener?: any };
let cached: Mod | null | undefined;
function load(): Mod | null {
  if (cached !== undefined) return cached;
  try { cached = require('expo-speech-recognition') as Mod; } catch { cached = null; }
  return cached;
}
export const speechAvailable = () => !!load()?.ExpoSpeechRecognitionModule;

export type Heard = { onResult: (text: string, final: boolean) => void; onEnd: () => void; onError: (message: string) => void };

/** Starts listening; always asks for ON-DEVICE recognition so audio is never sent to a cloud service. Returns a stop function. */
export async function listen(locale: string, cb: Heard): Promise<() => void> {
  const m = load();
  if (!m?.ExpoSpeechRecognitionModule) { cb.onError('Voice needs the latest app build.'); cb.onEnd(); return () => {}; }
  const M = m.ExpoSpeechRecognitionModule;
  const perm = await M.requestPermissionsAsync();
  if (!perm.granted) { cb.onError('Microphone permission is off. Turn it on in Settings to use voice.'); cb.onEnd(); return () => {}; }
  let onDevice = false;
  try { onDevice = !!M.supportsOnDeviceRecognition?.(); } catch { onDevice = false; }
  if (!onDevice) { cb.onError('This phone cannot recognise speech offline, so voice is off to keep your audio private. You can type instead.'); cb.onEnd(); return () => {}; }
  const subs = [
    M.addListener('result', (e: any) => { const t = e.results?.[0]?.transcript || ''; cb.onResult(String(t).trim(), !!e.isFinal); }),
    M.addListener('error', (e: any) => cb.onError(e?.error === 'no-speech' ? 'I did not hear anything. Try again.' : e?.error === 'language-not-supported' ? 'That language is not available on this phone.' : 'Voice did not work. You can type instead.')),
    M.addListener('end', () => { subs.forEach((s: any) => s?.remove?.()); cb.onEnd(); }),
  ];
  M.start({ lang: locale, interimResults: true, requiresOnDeviceRecognition: true, continuous: false });
  return () => { try { M.stop(); } catch { /* already stopped */ } };
}
