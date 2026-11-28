// Data export (CSV/JSON): downloads the export from the API, writes it to a temp file, and
// opens the OS share sheet so the person can save it to Files/Drive or send it elsewhere.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { API_URL, authHeaders, getText } from '../config/api';

export async function exportAndShare(format: 'csv' | 'json'): Promise<void> {
  const text = await getText(`/api/account/export?format=${format}`);
  const dir = FileSystem.cacheDirectory;
  if (!dir) throw new Error('No writable directory is available on this device.');
  const stamp = new Date().toISOString().slice(0, 10);
  const uri = `${dir}flexfit-export-${stamp}.${format}`;
  await FileSystem.writeAsStringAsync(uri, text, { encoding: 'utf8' });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing isn\u2019t available on this device. The file was saved to the app\u2019s cache folder.');
  await Sharing.shareAsync(uri, {
    mimeType: format === 'csv' ? 'text/csv' : 'application/json',
    dialogTitle: 'Save or share your FlexFit data',
    UTI: format === 'csv' ? 'public.comma-separated-values-text' : 'public.json',
  });
}

/** Dietitian report: the server builds a PDF for the last `days` days; we save it to the cache and open the share sheet. */
export async function exportReportPdf(days: 7 | 30 | 90 = 30, diary = true): Promise<void> {
  const dir = FileSystem.cacheDirectory;
  if (!dir) throw new Error('No writable directory is available on this device.');
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const to = new Date(); const from = new Date(); from.setDate(from.getDate() - (days - 1));
  const uri = `${dir}flexfit-report-${fmt(from)}_${fmt(to)}.pdf`;
  const res = await FileSystem.downloadAsync(`${API_URL}/api/account/report.pdf?from=${fmt(from)}&to=${fmt(to)}&diary=${diary}`, uri, { headers: await authHeaders() });
  if (res.status !== 200) throw new Error(res.status === 0 ? 'You appear to be offline.' : `Could not create the report (${res.status}).`);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn\u2019t available on this device. The report was saved to the app\u2019s cache folder.');
  await Sharing.shareAsync(res.uri, { mimeType: 'application/pdf', dialogTitle: 'Share your FlexFit report', UTI: 'com.adobe.pdf' });
}
