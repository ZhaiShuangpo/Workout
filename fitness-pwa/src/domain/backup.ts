import { db, initDB } from '../db';

interface BackupFile {
  format: 'fitness-pwa-backup';
  version: 1;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function downloadBackup() {
  const tables: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    const rows = await table.toArray() as Record<string, unknown>[];
    tables[table.name] = await Promise.all(rows.map(async row => {
      if (row.photo instanceof Blob) {
        const bytes = new Uint8Array(await row.photo.arrayBuffer());
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return { ...row, photo: { data: btoa(binary), type: row.photo.type } };
      }
      return row;
    }));
  }
  const backup: BackupFile = { format: 'fitness-pwa-backup', version: 1, exportedAt: new Date().toISOString(), tables };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `fitness-backup-${new Date().toLocaleDateString('en-CA')}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function restoreBackup(file: File) {
  const backup = JSON.parse(await file.text()) as BackupFile;
  if (backup.format !== 'fitness-pwa-backup' || backup.version !== 1 || !backup.tables) {
    throw new Error('备份文件格式不受支持');
  }

  const reviveDates = (table: string, rows: unknown[]) => rows.map(row => {
    const record = { ...(row as Record<string, unknown>) };
    if (table === 'workoutSessions') {
      record.startTime = new Date(String(record.startTime));
      if (record.endTime) record.endTime = new Date(String(record.endTime));
    }
    if (table === 'bodyMetrics') {
      record.date = new Date(String(record.date));
      const photo = record.photo as { data?: string; type?: string } | undefined;
      if (photo?.data) {
        const binary = atob(photo.data);
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        record.photo = new Blob([bytes], { type: photo.type || 'image/jpeg' });
      }
    }
    return record;
  });

  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
    for (const table of db.tables) {
      const rows = backup.tables[table.name];
      if (Array.isArray(rows) && rows.length > 0) await table.bulkAdd(reviveDates(table.name, rows));
    }
  });
  await initDB();
}
