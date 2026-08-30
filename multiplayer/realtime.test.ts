import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { subscribeToRoom, unsubscribeFromRoom } from './realtime';
import type { RoomState } from '../game/types';

function fakeClient() {
  const calls: { channelName?: string; event?: string; config?: unknown; handler?: (payload: unknown) => void } = {};
  const channelObj = {
    on: (event: string, config: unknown, handler: (payload: unknown) => void) => {
      calls.event = event;
      calls.config = config;
      calls.handler = handler;
      return channelObj;
    },
    subscribe: () => channelObj,
    unsubscribe: async () => 'ok' as const,
  };
  const client = {
    channel: (name: string) => {
      calls.channelName = name;
      return channelObj;
    },
  } as unknown as SupabaseClient;
  return { client, calls, channelObj };
}

describe('subscribeToRoom', () => {
  it('subscribes to a channel named after the room code with the right filter', () => {
    const { client, calls } = fakeClient();
    subscribeToRoom(client, 'ABCD', () => {});
    expect(calls.channelName).toBe('room:ABCD');
    expect(calls.event).toBe('postgres_changes');
    expect(calls.config).toEqual({ event: 'UPDATE', schema: 'public', table: 'rooms', filter: 'code=eq.ABCD' });
  });

  it('forwards the new state to onStateChange when an update event fires', () => {
    const { client, calls } = fakeClient();
    const onStateChange = vi.fn();
    subscribeToRoom(client, 'ABCD', onStateChange);
    const fakeState = { status: 'playing' } as unknown as RoomState;
    calls.handler!({ new: { state: fakeState } });
    expect(onStateChange).toHaveBeenCalledWith(fakeState);
  });
});

describe('unsubscribeFromRoom', () => {
  it('calls unsubscribe on the channel', async () => {
    const { client } = fakeClient();
    const channel = subscribeToRoom(client, 'ABCD', () => {});
    await expect(unsubscribeFromRoom(channel)).resolves.toBe('ok');
  });
});
