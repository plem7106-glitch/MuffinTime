import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { subscribeToRoom, unsubscribeFromRoom } from './realtime';
import type { RoomState } from '../game/types';

function fakeClient() {
  const calls: { channelName?: string; event?: string; config?: unknown; handler?: (payload: unknown) => void } = {};
  const presence: { event?: string; handler?: () => void } = {};
  const trackPayloads: unknown[] = [];
  let presenceStateValue: Record<string, unknown[]> = {};
  let subscribeCb: ((status: string, err?: Error) => void) | undefined;
  const channelObj = {
    on: (event: string, config: unknown, handler: (payload: unknown) => void) => {
      if (event === 'presence') {
        presence.event = (config as { event?: string }).event;
        presence.handler = handler as unknown as () => void;
      } else if (!calls.event) {
        // First non-presence registration only, to keep existing assertions
        // (which check a single postgres_changes call) working unchanged.
        calls.event = event;
        calls.config = config;
        calls.handler = handler;
      }
      return channelObj;
    },
    subscribe: (cb?: (status: string, err?: Error) => void) => {
      subscribeCb = cb;
      return channelObj;
    },
    unsubscribe: async () => 'ok' as const,
    track: async (payload: unknown) => {
      trackPayloads.push(payload);
      return 'ok';
    },
    presenceState: () => presenceStateValue,
  };
  const client = {
    channel: (name: string) => {
      calls.channelName = name;
      return channelObj;
    },
  } as unknown as SupabaseClient;
  return {
    client,
    calls,
    channelObj,
    presence,
    trackPayloads,
    setPresenceState: (s: Record<string, unknown[]>) => {
      presenceStateValue = s;
    },
    triggerSubscribed: () => subscribeCb?.('SUBSCRIBED'),
  };
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

describe('subscribeToRoom presence tracking', () => {
  it('does not register a presence listener or track anything when onPresenceChange is omitted', () => {
    const { client, presence, trackPayloads, triggerSubscribed } = fakeClient();
    subscribeToRoom(client, 'ABCD', () => {});
    triggerSubscribed();
    expect(presence.handler).toBeUndefined();
    expect(trackPayloads).toEqual([]);
  });

  it('tracks myPlayerId once the channel reaches SUBSCRIBED, when onPresenceChange is provided', () => {
    const { client, trackPayloads, triggerSubscribed } = fakeClient();
    subscribeToRoom(client, 'ABCD', () => {}, undefined, () => {}, 'p1');
    triggerSubscribed();
    expect(trackPayloads).toEqual([{ playerId: 'p1' }]);
  });

  it('reports the set of playerIds present across all presence keys on sync', () => {
    const { client, presence, setPresenceState } = fakeClient();
    const onPresenceChange = vi.fn();
    subscribeToRoom(client, 'ABCD', () => {}, undefined, onPresenceChange, 'p1');
    setPresenceState({
      key1: [{ playerId: 'p1' }],
      key2: [{ playerId: 'p2' }, { playerId: 'p2' }], // duplicate presences from the same tab
    });
    presence.handler!();
    expect(onPresenceChange).toHaveBeenCalledWith(new Set(['p1', 'p2']));
  });
});

describe('unsubscribeFromRoom', () => {
  it('calls unsubscribe on the channel', async () => {
    const { client } = fakeClient();
    const channel = subscribeToRoom(client, 'ABCD', () => {});
    await expect(unsubscribeFromRoom(channel)).resolves.toBe('ok');
  });
});
