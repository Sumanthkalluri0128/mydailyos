// On-device speech-to-text through the browser's SpeechRecognition (no audio goes to any FlexFit or paid service by us;
// some browsers do process speech in their vendor's cloud: Chrome does, so the button says so). Hidden where unsupported.
export const LOCALES = [["en-IN", "English"], ["hi-IN", "हिन्दी"], ["te-IN", "తెలుగు"], ["ta-IN", "தமிழ்"]];
export const speechSupported = () => typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

/** start(locale, { onResult(text, final), onEnd(), onError(msg) }) -> { stop() } */
export function startListening(locale, { onResult, onEnd, onError }) {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new R();
  rec.lang = locale || "en-IN";
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    let text = "", final = false;
    for (let i = 0; i < e.results.length; i += 1) { text += e.results[i][0].transcript; final = e.results[i].isFinal; }
    onResult?.(text.trim(), final);
  };
  rec.onerror = (e) => onError?.(e.error === "not-allowed" ? "Microphone permission is off. Allow it in the browser to use voice." : e.error === "no-speech" ? "I did not hear anything. Try again." : e.error === "language-not-supported" ? "This language is not supported on this device." : "Voice did not work. You can type instead.");
  rec.onend = () => onEnd?.();
  try { rec.start(); } catch { onError?.("Voice did not start. You can type instead."); onEnd?.(); }
  return { stop: () => { try { rec.stop(); } catch { /* already stopped */ } } };
}
