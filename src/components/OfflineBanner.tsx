import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { useOffline } from '../utils/offline';
import { useTheme } from '../utils/theme';

/**
 * Thin banner shown only when relevant: offline, or writes waiting to sync. Silent otherwise.
 * Tap it to try syncing right now.
 */
export function OfflineBanner() {
  const { online, pending, syncing, flushNow } = useOffline();
  const { colors: c } = useTheme();
  if (online && pending === 0) return null;

  const plural = `${pending} change${pending === 1 ? '' : 's'}`;
  const label = !online
    ? pending > 0 ? `Offline — ${plural} saved on this phone, will sync automatically` : 'Offline — changes will be saved on this phone'
    : syncing ? 'Syncing…' : `${plural} waiting to sync — tap to sync now`;
  const bg = online ? c.primarySoft : c.warnSoft;
  const fg = online ? c.primary : c.warnInk;

  return (
    <TouchableOpacity activeOpacity={0.8} disabled={syncing || !pending} onPress={() => flushNow()} accessibilityRole="button" accessibilityLabel={label}
      style={{ backgroundColor: bg, paddingVertical: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
      {syncing ? <ActivityIndicator size="small" color={fg} /> : null}
      <Text style={{ fontSize: 12, fontWeight: '700', color: fg, textAlign: 'center' }}>{label}</Text>
    </TouchableOpacity>
  );
}
