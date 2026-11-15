import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api';
import { addPending, isRetriable, type PendingItem } from '../lib/outbox';

const readings = (id: string, values: Record<string, number | null>, day = 20, member = 'engineer'): PendingItem => ({
  id,
  kind: 'readings',
  member,
  day,
  values,
});

describe('outbox helpers', () => {
  it('retries when the server was not reached or is briefly down, never when it refused', () => {
    expect(isRetriable(new TypeError('Failed to fetch'))).toBe(true);
    expect(isRetriable(new ApiError('x', 503, null))).toBe(true);
    expect(isRetriable(new ApiError('x', 422, 'Blood oxygen: that value cannot be right'))).toBe(false);
    expect(isRetriable(new ApiError('x', 403, null))).toBe(false);
  });

  it('merges a second waiting check-in for the same person and day, newest value wins', () => {
    const first = addPending([], readings('a', { hr: 60, temp: 36.5 }));
    const second = addPending(first, readings('b', { hr: 64 }));
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ id: 'a', values: { hr: 64, temp: 36.5 } });
  });

  it('keeps check-ins for another day or person apart, and keeps log order', () => {
    let items = addPending([], readings('a', { hr: 60 }));
    items = addPending(items, readings('b', { hr: 61 }, 21));
    items = addPending(items, readings('c', { hr: 62 }, 20, 'pilot'));
    items = addPending(items, { id: 'd', kind: 'log', member: 'engineer', body: { kind: 'ok', day: 20 } });
    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('saving when the server cannot be reached', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  const ok = () => new Response(JSON.stringify({}), { status: 200 });

  it('shows no confirmation until the server answers, keeps the entry, then sends it later', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    const { useApp } = await import('../lib/store');

    useApp.getState().log('ok');
    await vi.waitFor(() => expect(useApp.getState().pending).toBe(1));
    const texts = useApp.getState().toasts.map((t) => t.text);
    expect(texts.some((t) => t.startsWith('Saved'))).toBe(false);
    expect(texts.some((t) => t.startsWith('Not sent yet'))).toBe(true);
    expect(JSON.parse(localStorage.getItem('vital-outbox') ?? '[]')).toHaveLength(1);

    fetchMock.mockImplementation(async () => ok());
    await useApp.getState().flushOutbox({ manual: true });
    expect(useApp.getState().pending).toBe(0);
    expect(JSON.parse(localStorage.getItem('vital-outbox') ?? '[]')).toHaveLength(0);
  });

  it('confirms after the server accepts, and says so plainly when it refuses', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ok());
    vi.stubGlobal('fetch', fetchMock);
    const { useApp } = await import('../lib/store');
    useApp.getState().log('mood', { value: 4 });
    await vi.waitFor(() => expect(useApp.getState().toasts.some((t) => t.text === 'Saved')).toBe(true));
    expect(useApp.getState().pending).toBe(0);

    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ detail: 'no' }), { status: 422 }));
    useApp.getState().log('mood', { value: 9 });
    await vi.waitFor(() => expect(useApp.getState().toasts.some((t) => t.tone === 'error')).toBe(true));
    expect(useApp.getState().pending).toBe(0);
  });

  it('puts a new entry behind older waiting ones so order is kept', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    const { useApp } = await import('../lib/store');
    useApp.getState().log('mood', { value: 2 });
    await vi.waitFor(() => expect(useApp.getState().pending).toBe(1));
    useApp.getState().log('ok');
    await vi.waitFor(() => expect(useApp.getState().pending).toBe(2));
    const order = (JSON.parse(localStorage.getItem('vital-outbox') ?? '[]') as { body: { kind: string } }[]).map((i) => i.body.kind);
    expect(order).toEqual(['mood', 'ok']);
  });
});
