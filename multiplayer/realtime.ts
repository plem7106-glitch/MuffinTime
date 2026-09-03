import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { RoomState } from '../game/types';

export function subscribeToRoom(
  client: SupabaseClient,
  code: string,
  onStateChange: (state: RoomState) => void,
  onStatusChange?: (status: string, err?: Error) => void,
  onPresenceChange?: (onlinePlayerIds: Set<string>) => void,
  myPlayerId?: string
): RealtimeChannel {
  const channel = client.channel(`room:${code}`).on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `code=eq.${code}` },
    (payload: { new: { state: RoomState } }) => {
      onStateChange(payload.new.state);
    }
  );

  if (onPresenceChange) {
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState() as Record<string, { playerId?: string }[]>;
      const onlineIds = new Set<string>();
      for (const presences of Object.values(state)) {
        for (const p of presences) {
          if (p.playerId) onlineIds.add(p.playerId);
        }
      }
      onPresenceChange(onlineIds);
    });
  }

  return channel.subscribe((status, err) => {
    if (status === 'SUBSCRIBED' && onPresenceChange && myPlayerId) {
      channel.track({ playerId: myPlayerId });
    }
    onStatusChange?.(status, err);
  });
}

export function unsubscribeFromRoom(channel: RealtimeChannel): Promise<'ok' | 'timed out' | 'error'> {
  return channel.unsubscribe() as Promise<'ok' | 'timed out' | 'error'>;
}
