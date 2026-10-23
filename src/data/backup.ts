// Export / import the whole AppData as a JSON file — the safety net for device-only storage.
import { today } from '../domain/dates.ts';
import type { AppData } from '../domain/types.ts';
import { parseData } from './storage.ts';
import { getData, updateSettings } from './store.ts';

export function exportBackup(): void {
  updateSettings({ lastBackupAt: Date.now() });
  const blob = new Blob([JSON.stringify(getData(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `capital-tracker-backup-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads and validates a backup file. Throws with a readable message when it isn't one. */
export async function readBackup(file: File): Promise<AppData> {
  if (file.size > 5_000_000) throw new Error('That file is too large to be a Capital Tracker backup.');
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const data = parseData(raw);
  if (!data) throw new Error('That file is not a Capital Tracker backup.');
  return data;
}
