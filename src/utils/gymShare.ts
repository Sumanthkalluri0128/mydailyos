// Writes a gym-log export to a temporary file and opens the OS share sheet ("Save to Files", Drive, WhatsApp, e-mail...).
// Same approach as utils/exportData.ts, but nothing is downloaded from a server: the text is built on the phone.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export type GymFileKind = 'workouts-csv' | 'body-csv' | 'backup-json';
const META: Record<GymFileKind, { name: string; mime: string; uti: string; title: string }> = {
  'workouts-csv': { name: 'flexfit-gym-workouts', mime: 'text/csv', uti: 'public.comma-separated-values-text', title: 'Save or share your workout log' },
  'body-csv': { name: 'flexfit-body-measurements', mime: 'text/csv', uti: 'public.comma-separated-values-text', title: 'Save or share your body measurements' },
  'backup-json': { name: 'flexfit-gym-backup', mime: 'application/json', uti: 'public.json', title: 'Save your gym log backup' },
};

export async function shareGymFile(kind: GymFileKind, text: string, stamp = new Date().toISOString().slice(0, 10)): Promise<void> {
  const m = META[kind];
  const dir = FileSystem.cacheDirectory;
  if (!dir) throw new Error('No writable folder is available on this device.');
  const uri = `${dir}${m.name}-${stamp}.${kind.endsWith('csv') ? 'csv' : 'json'}`;
  await FileSystem.writeAsStringAsync(uri, text, { encoding: 'utf8' });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn\u2019t available on this device. The file was saved to the app\u2019s cache folder.');
  await Sharing.shareAsync(uri, { mimeType: m.mime, dialogTitle: m.title, UTI: m.uti });
}
