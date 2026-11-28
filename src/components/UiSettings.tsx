// Profile: "Show all features" (simple vs advanced mode) and the UI language.
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useThemedStyles } from './UI';
import { Chip } from './Chip';
import Buddy from '../motion/Buddy';
import { useNotifications } from './Notifications';
import { refreshReminders } from '../utils/notifications';
import { setShowAll, useFeatures } from '../utils/features';
import { authenticate, loadLock, lockCapable, saveLock } from '../utils/appLock';
import { DEFAULT_LOCK, LockSettings, TIMEOUTS, lockMessage, lockOutcome } from '../utils/appLockPure';
import { LANGS, needsReview, setLang, useT } from '../i18n';

const NAME: Record<string, string> = { recipes: 'nav.recipes', health: 'nav.health', goals: 'nav.goals', habit: 'nav.habit', achievements: 'nav.goals', weekly: 'nav.progress', northstar: 'nav.goals' };

export function UiSettings() {
  const { S, colors } = useThemedStyles();
  const { error } = useNotifications();
  const f = useFeatures();
  const { t, lang } = useT();
  const [busy, setBusy] = useState(false);
  const toggle = async () => { setBusy(true); try { await setShowAll(!f.showAll); } catch (e: any) { error('Could not save that', e.network ? 'This needs a connection.' : e.message); } finally { setBusy(false); } };
  const locked = f.showAll ? [] : f.locked || [];
  const [lock, setLock] = useState<LockSettings>(DEFAULT_LOCK);
  const [lockNote, setLockNote] = useState('');
  useEffect(() => { loadLock().then(setLock); }, []);
  const changeLock = async (next: LockSettings) => { setLock(next); await saveLock(next); };
  const toggleLock = async () => {
    if (lock.enabled) { setLockNote(''); return changeLock({ ...lock, enabled: false }); }
    // turn it on only after the phone confirms it is you, so the lock can always be opened
    if (!(await lockCapable())) { setLockNote('Set a screen lock (PIN, pattern or fingerprint) in your phone settings first, then try again.'); return; }
    const o = lockOutcome(await authenticate('Turn on the FlexFit lock'));
    if (o === 'unlocked') { setLockNote(''); await changeLock({ ...lock, enabled: true }); } else setLockNote(lockMessage(o));
  };
  return (
    <View style={S.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Buddy scene="health" size={52} who="kakashi" talk={false} label="" />
        <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16, flex: 1, marginLeft: 8 }}>{t('mode.title')}</Text>
        <Chip small label={f.showAll ? t('mode.all') : t('mode.simple')} active={f.showAll} onPress={() => !busy && toggle()} />
      </View>
      <Text style={S.muted}>{t('mode.hint')}</Text>
      {locked.map((x) => <Text key={x.id} style={[S.muted, { marginTop: 4 }]}>• {t(NAME[x.id] || 'nav.more')} · {t('mode.locked', { hint: x.hint })}</Text>)}
      <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16, marginTop: 16 }}>{t('a11y.title')}</Text>
      <Text style={S.muted}>{t('a11y.phoneHint')}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
        <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16, flex: 1 }}>App lock</Text>
        <Chip small label={lock.enabled ? 'On' : 'Off'} active={lock.enabled} a11y={`App lock is ${lock.enabled ? 'on' : 'off'}. Tap to change.`} onPress={toggleLock} />
      </View>
      <Text style={S.muted}>Ask for your fingerprint, face, PIN or pattern when FlexFit opens. Off by default. Your data stays on this phone either way.</Text>
      {lock.enabled && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
          {TIMEOUTS.map((s) => <Chip key={s} small label={s === 0 ? 'Every time' : s < 60 ? `${s} s` : `${s / 60} min`} active={lock.timeoutSec === s} onPress={() => changeLock({ ...lock, timeoutSec: s })} />)}
        </View>
      )}
      {!!lockNote && <Text style={[S.muted, { marginTop: 6 }]}>{lockNote}</Text>}
      <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 16, marginTop: 16 }}>{t('lang.title')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
        {LANGS.map((l) => <Chip key={l} small label={t(`lang.${l}`)} active={lang === l} onPress={async () => { await setLang(l); refreshReminders(true).catch(() => {}); }} />)}
      </View>
      <Text style={S.muted}>{t('lang.hint')}{needsReview(lang) ? ` ${t('lang.review')}` : ''}</Text>
    </View>
  );
}
