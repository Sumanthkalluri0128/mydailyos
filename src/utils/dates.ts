export function pad(n: number) { return String(n).padStart(2, '0'); }

export function formatDateLocal(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

export function addDays(value: string, amount: number) {
  const date = parseDate(value) || new Date();
  date.setDate(date.getDate() + amount);
  return formatDateLocal(date);
}

export function daysBetween(from: string, to: string) {
  const a = parseDate(from);
  const b = parseDate(to);
  if (!a || !b || b < a) return [] as string[];
  const out: string[] = [];
  const cursor = new Date(a);
  while (cursor <= b) {
    out.push(formatDateLocal(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function rangeFromPreset(preset: '7d' | '14d' | '30d' | '90d' | 'all') {
  const end = formatDateLocal(new Date());
  if (preset === 'all') return { from: addDays(end, -365), to: end };
  const days = Number(preset.replace('d', ''));
  return { from: addDays(end, -(days - 1)), to: end };
}

export function prettyDate(value: string) {
  const d = parseDate(value);
  if (!d) return value;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function shortDate(value: string) {
  const d = parseDate(value);
  if (!d) return value;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
