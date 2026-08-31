import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchRoom, writeRoomState, updateRoomWithRetry } from './room';
import type { RoomState } from '../game/types';

function fakeClient({
  selects,
  updates,
}: {
  selects: Array<{ data: { state: RoomState; version: number } | null; error: { message: string } | null }>;
  updates: Array<{ data: Array<{ version: number }> | null; error: { message: string } | null }>;
}): SupabaseClient {
  let selectCall = 0;
  let updateCall = 0;
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => selects[selectCall++],
        }),
      }),
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: async () => updates[updateCall++],
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const baseState = { status: 'lobby' } as unknown as RoomState;

describe('fetchRoom', () => {
  it('returns the row on success', async () => {
    const client = fakeClient({
      selects: [{ data: { state: baseState, version: 3 }, error: null }],
      updates: [],
    });
    const row = await fetchRoom(client, 'ABCD');
    expect(row).toEqual({ state: baseState, version: 3 });
  });

  it('throws when the query errors', async () => {
    const client = fakeClient({
      selects: [{ data: null, error: { message: 'not found' } }],
      updates: [],
    });
    await expect(fetchRoom(client, 'ABCD')).rejects.toThrow(/not found/);
  });
});

describe('writeRoomState', () => {
  it('returns true when the versioned update affected a row', async () => {
    const client = fakeClient({ selects: [], updates: [{ data: [{ version: 4 }], error: null }] });
    const ok = await writeRoomState(client, 'ABCD', baseState, 3);
    expect(ok).toBe(true);
  });

  it('returns false when no row matched the expected version', async () => {
    const client = fakeClient({ selects: [], updates: [{ data: [], error: null }] });
    const ok = await writeRoomState(client, 'ABCD', baseState, 3);
    expect(ok).toBe(false);
  });

  it('throws when the update errors', async () => {
    const client = fakeClient({ selects: [], updates: [{ data: null, error: { message: 'boom' } }] });
    await expect(writeRoomState(client, 'ABCD', baseState, 3)).rejects.toThrow(/boom/);
  });
});

describe('updateRoomWithRetry', () => {
  it('applies the updater and writes on the first attempt when there is no conflict', async () => {
    const client = fakeClient({
      selects: [{ data: { state: { status: 'lobby' } as unknown as RoomState, version: 1 }, error: null }],
      updates: [{ data: [{ version: 2 }], error: null }],
    });
    const result = await updateRoomWithRetry(client, 'ABCD', (s) => ({ ...s, status: 'playing' }) as RoomState);
    expect(result.status).toBe('playing');
  });

  it('retries after a version conflict and succeeds on the second attempt', async () => {
    const client = fakeClient({
      selects: [
        { data: { state: { status: 'lobby' } as unknown as RoomState, version: 1 }, error: null },
        { data: { state: { status: 'lobby' } as unknown as RoomState, version: 2 }, error: null },
      ],
      updates: [
        { data: [], error: null }, // lost the race, 0 rows affected
        { data: [{ version: 3 }], error: null },
      ],
    });
    const result = await updateRoomWithRetry(client, 'ABCD', (s) => ({ ...s, status: 'playing' }) as RoomState);
    expect(result.status).toBe('playing');
  });

  it('throws after exhausting maxAttempts', async () => {
    const client = fakeClient({
      selects: Array(3).fill({ data: { state: { status: 'lobby' } as unknown as RoomState, version: 1 }, error: null }),
      updates: Array(3).fill({ data: [], error: null }),
    });
    await expect(
      updateRoomWithRetry(client, 'ABCD', (s) => s, 3)
    ).rejects.toThrow(/failed to write after 3 attempts/);
  });
});
