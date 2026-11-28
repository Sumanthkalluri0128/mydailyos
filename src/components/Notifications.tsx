import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { impactHaptic, tapHaptic } from '../utils/haptics';
import { useTheme, ThemeColors } from '../utils/theme';
import Buddy, { sceneForText } from '../motion/Buddy';
import { companionsReact } from '../motion/Companions';
import { t } from '../i18n';

type Kind = 'success' | 'error' | 'warning' | 'info' | 'undo';
type Toast = { id: number; kind: Kind; title: string; message?: string; actionLabel?: string; onAction?: () => void };
type ConfirmOptions = { title: string; message?: string; confirmText?: string; destructive?: boolean };

type Ctx = {
  toast: (kind: Kind, title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /**
   * Deletes something optimistically and shows a 5s "Undo" toast instead of a confirm dialog —
   * faster, and just as safe since the action can still be reversed.
   *   undoableDelete('Water entry removed', () => api.delete(id), () => api.restore(id))
   */
  undoableDelete: (title: string, onCommit: () => void | Promise<void>, onUndo: () => void | Promise<void>, delayMs?: number) => void;
};

const NotificationContext = createContext<Ctx | null>(null);
let nextId = 1;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { colors: tc } = useTheme();
  const styles = useMemo(() => makeStyles(tc), [tc]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  // Identical toasts inside a short window collapse into one, and a burst (e.g. an offline queue syncing) never stacks more than one new toast per 400 ms.
  const lastShown = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const lastAny = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(x => x.id !== id));
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  }, []);

  const toast = useCallback((kind: Kind, title: string, message?: string, actionLabel?: string, onAction?: () => void, duration = 3200) => {
    const nowMs = Date.now();
    const key = `${kind}|${title}|${message || ''}`;
    const isUndo = !!onAction;
    if (!isUndo && lastShown.current.key === key && nowMs - lastShown.current.at < 4000) return -1; // same message just shown
    if (!isUndo && kind !== 'error' && nowMs - lastAny.current < 400) return -1;                      // burst: drop the extras
    lastShown.current = { key, at: nowMs }; lastAny.current = nowMs;
    const id = nextId++;
    setToasts(prev => [...prev.filter(x => `${x.kind}|${x.title}|${x.message || ''}` !== key).slice(-1), { id, kind, title, message, actionLabel, onAction }]);
    timers.current.set(id, setTimeout(() => dismiss(id), duration));
    return id;
  }, [dismiss]);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>(resolve => {
    setConfirmState({ options, resolve });
  }), []);

  const undoableDelete = useCallback((title: string, onCommit: () => void | Promise<void>, onUndo: () => void | Promise<void>, delayMs = 5000) => {
    impactHaptic();
    let undone = false;
    const id = toast('undo', title, t('undo.sensei'), t('common.undo'), () => {
      undone = true;
      dismiss(id);
      Promise.resolve(onUndo()).catch(() => {});
      toast('success', t('undo.back'), undefined, undefined, undefined, 1800);
    }, delayMs);
    setTimeout(() => { if (!undone) Promise.resolve(onCommit()).catch(() => {}); }, delayMs + 50);
  }, [toast, dismiss]);

  const value = useMemo<Ctx>(() => ({
    toast: (k, t, m) => toast(k, t, m),
    success: (t,m) => { companionsReact(`${t} ${m || ''}`, 'success'); return toast('success',t,m); },
    error: (t,m) => { companionsReact(`${t} ${m || ''}`, 'error'); return toast('error',t,m); },
    warning: (t,m) => toast('warning',t,m),
    info: (t,m) => toast('info',t,m),
    confirm,
    undoableDelete,
  }), [toast, confirm, undoableDelete]);

  const finishConfirm = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  return <NotificationContext.Provider value={value}>
    {children}
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View pointerEvents="box-none" style={styles.toastStack}>
        {toasts.map(t => <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} styles={styles} tc={tc} />)}
      </View>
    </View>
    <Modal transparent visible={!!confirmState} animationType="fade" onRequestClose={() => finishConfirm(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{confirmState?.options.title}</Text>
          {!!confirmState?.options.message && <Text style={styles.modalMessage}>{confirmState.options.message}</Text>}
          <View style={styles.modalActions}>
            <Pressable style={[styles.modalButton, styles.cancelButton]} onPress={() => finishConfirm(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.modalButton, confirmState?.options.destructive ? styles.dangerButton : styles.primaryButton]} onPress={() => finishConfirm(true)}>
              <Text style={styles.actionText}>{confirmState?.options.confirmText || 'Confirm'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </NotificationContext.Provider>;
}

function ToastCard({ toast, onDismiss, styles, tc }: { toast: Toast; onDismiss: () => void; styles: ReturnType<typeof makeStyles>; tc: ThemeColors }) {
  const meta = {
    success: { icon: '✓', color: tc.success },
    error: { icon: '×', color: tc.danger },
    warning: { icon: '!', color: '#D78A13' },
    info: { icon: 'i', color: tc.primary },
    undo: { icon: '🗑', color: tc.primary },
  }[toast.kind];
  return <View style={[styles.toast, { borderLeftColor: meta.color }]}>
    {toast.kind === 'undo'
      ? <Buddy scene="health" size={48} label="" who="kakashi" talk={false} />
      : toast.kind === 'success' || toast.kind === 'error' || toast.kind === 'warning'
      ? <Buddy scene={sceneForText(`${toast.title} ${toast.message || ''}`, toast.kind)} size={48} label="" />
      : <View style={[styles.toastIcon, { backgroundColor: meta.color }]}><Text style={styles.toastIconText}>{meta.icon}</Text></View>}
    <View style={{ flex: 1 }}><Text style={styles.toastTitle}>{toast.title}</Text>{!!toast.message && <Text style={styles.toastMessage}>{toast.message}</Text>}</View>
    {toast.onAction && (
      <Pressable onPress={() => { tapHaptic(); toast.onAction!(); }} hitSlop={10} style={styles.undoButton}>
        <Text style={styles.undoText}>{toast.actionLabel}</Text>
      </Pressable>
    )}
    {!toast.onAction && (
      <Pressable onPress={onDismiss} hitSlop={10} style={{ paddingLeft: 8 }} accessibilityRole="button" accessibilityLabel="Dismiss notification">
        <Text style={{ color: tc.muted, fontSize: 16, fontWeight: '700' }}>×</Text>
      </Pressable>
    )}
  </View>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider');
  return ctx;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  toastStack: { position: 'absolute', top: 52, left: 16, right: 16, zIndex: 1000, gap: 9 },
  toast: { minHeight: 64, backgroundColor: c.raised, borderWidth: c.cardBorderWidth, borderColor: c.cardBorder, borderRadius: 16, borderLeftWidth: 4, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 7 },
  toastIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  toastIconText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  toastTitle: { fontSize: 14, fontWeight: '800', color: c.ink },
  toastMessage: { fontSize: 12, color: c.muted, marginTop: 2 },
  undoButton: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: c.primarySoft, marginLeft: 8 },
  undoText: { color: c.primary, fontWeight: '800', fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 420, backgroundColor: c.raised, borderWidth: c.cardBorderWidth, borderColor: c.border, borderRadius: 24, padding: 22, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  modalTitle: { fontSize: 21, fontWeight: '800', color: c.ink },
  modalMessage: { fontSize: 14, lineHeight: 20, color: c.muted, marginTop: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 22 },
  modalButton: { minWidth: 100, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 13, alignItems: 'center' },
  cancelButton: { backgroundColor: c.chipBg },
  primaryButton: { backgroundColor: c.primarySolid },
  dangerButton: { backgroundColor: c.dangerSolid },
  cancelText: { color: c.ink, fontWeight: '800' },
  actionText: { color: '#fff', fontWeight: '800' },
});
