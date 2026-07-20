import { db } from '../db';

export interface SyncSnapshot {
  schemaVersion: 1;
  deviceId: string;
  generatedAt: string;
  tables: Record<string, unknown[]>;
}

export interface SyncProvider {
  push(snapshot: SyncSnapshot): Promise<{ revision: string }>;
  pull(revision?: string): Promise<{ revision: string; snapshot: SyncSnapshot | null }>;
}

export function getDeviceId() {
  const key = 'fitness_device_id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

export async function createSyncSnapshot(): Promise<SyncSnapshot> {
  const tables: Record<string, unknown[]> = {};
  for (const table of db.tables) tables[table.name] = await table.toArray();
  return { schemaVersion: 1, deviceId: getDeviceId(), generatedAt: new Date().toISOString(), tables };
}

export class SyncCoordinator {
  private readonly provider: SyncProvider;

  constructor(provider: SyncProvider) {
    this.provider = provider;
  }

  async push() {
    return this.provider.push(await createSyncSnapshot());
  }

  async pull(revision?: string) {
    return this.provider.pull(revision);
  }
}
