import React, { useState } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../utils/theme';
import { formatDateLocal, parseDate, pad } from '../utils/dates';

type Props = {
  label: string;
  mode: 'date' | 'time';
  /** "YYYY-MM-DD" for date, "HH:mm" (24h) for time. Empty string = not set (time only). */
  value: string;
  onChange: (v: string) => void;
  /** Show a "Clear" link (used for the optional due time). */
  clearable?: boolean;
  placeholder?: string;
};

function toDate(mode: 'date' | 'time', value: string): Date {
  if (mode === 'date') return parseDate(value) || new Date();
  const [h, m] = (value || '09:00').split(':').map(Number);
  const d = new Date(); d.setHours(h || 0, m || 0, 0, 0); return d;
}
function display(mode: 'date' | 'time', value: string, placeholder?: string) {
  if (!value) return placeholder || 'Not set';
  if (mode === 'time') return toDate('time', value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const d = parseDate(value); if (!d) return value;
  const today = formatDateLocal(new Date());
  const t = new Date(); t.setDate(t.getDate() + 1);
  const label = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  return value === today ? `Today · ${label}` : value === formatDateLocal(t) ? `Tomorrow · ${label}` : label;
}

/** A tappable field that opens the OS date or time picker (same picker as a calendar event). */
export function DateTimeField({ label, mode, value, onChange, clearable, placeholder }: Props) {
  const { colors: c, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flex: 1, marginBottom: 13 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: c.muted, marginBottom: 6 }}>{label}</Text>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        accessibilityRole="button" accessibilityLabel={`${label}: ${display(mode, value, placeholder)}`}
        style={{ borderWidth: 1, borderColor: c.border, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 13, backgroundColor: c.card, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <Text style={{ fontSize: 15, fontWeight: '700', color: value ? c.ink : c.muted }}>{mode === 'date' ? '📅 ' : '⏰ '}{display(mode, value, placeholder)}</Text>
        {clearable && !!value && (
          <TouchableOpacity onPress={() => onChange('')} hitSlop={10} accessibilityLabel={`Clear ${label}`}>
            <Text style={{ color: c.danger, fontWeight: '800', fontSize: 12 }}>Clear</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
      {open && (
        <DateTimePicker
          value={toDate(mode, value)}
          mode={mode}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          themeVariant={isDark ? 'dark' : 'light'}
          onChange={(_e, selected) => {
            if (Platform.OS === 'android') setOpen(false); // Android's dialog dismisses itself
            if (!selected) return;
            onChange(mode === 'date' ? formatDateLocal(selected) : `${pad(selected.getHours())}:${pad(selected.getMinutes())}`);
          }}
        />
      )}
      {Platform.OS === 'ios' && open && (
        <TouchableOpacity onPress={() => setOpen(false)} style={{ alignSelf: 'flex-end', padding: 8 }}>
          <Text style={{ color: c.primary, fontWeight: '700' }}>Done</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
