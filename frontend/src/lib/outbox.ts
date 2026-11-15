/**
 * Entries that could not reach the server yet. They are kept in the browser and sent again,
 * in order, when the server answers. Nothing a crew member typed is dropped silently.
 */
import { api, ApiError } from './api';
import type { LogEntry } from './types';

export type PendingItem =
  | { id: string; kind: 'log'; member: string; body: { kind: LogEntry['kind']; day: number; value?: number; text?: string } }
  | { id: string; kind: 'readings'; member: string; day: number; values: Record<string, number | null> };

export type Delivery = 'sent' | 'retry' | 'refused';

const KEY = 'vital-outbox';
const LIMIT = 200;

export function loadOutbox(): PendingItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as PendingItem[]).slice(-LIMIT) : [];
  } catch {
    return [];
  }
}

export function saveOutbox(items: PendingItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-LIMIT)));
  } catch {
    // Storage can be unavailable (private mode); entries then wait in memory only.
  }
}

/** Worth trying again: the server was not reached, or it is briefly unavailable. */
export function isRetriable(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === 502 || err.status === 503 || err.status === 504;
  return true; // fetch() itself failed: no network, or the server is down
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** A check-in for the same person and day replaces the one still waiting; the newer values win. */
export function addPending(items: PendingItem[], item: PendingItem): PendingItem[] {
  if (item.kind === 'readings') {
    const same = items.findIndex((p) => p.kind === 'readings' && p.member === item.member && p.day === item.day);
    if (same >= 0) {
      const old = items[same] as Extract<PendingItem, { kind: 'readings' }>;
      const merged: PendingItem = { ...item, id: old.id, values: { ...old.values, ...item.values } };
      return items.map((p, i) => (i === same ? merged : p));
    }
  }
  return [...items, item].slice(-LIMIT);
}

export async function deliver(item: PendingItem): Promise<Delivery> {
  try {
    if (item.kind === 'log') await api.log(item.member, item.body);
    else await api.saveReadings(item.member, item.day, item.values);
    return 'sent';
  } catch (err) {
    return isRetriable(err) ? 'retry' : 'refused';
  }
}
