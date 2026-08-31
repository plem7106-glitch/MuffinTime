import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { RoomState } from '../game/types';

export function subscribeToRoom(
  client: SupabaseClient,
  code: string,
  onStateChange: (state: RoomState) => void
): RealtimeChannel {
  return client
    .channel(`room:${code}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `code=eq.${code}` },
      (payload: { new: { state: RoomState } }) => {
        onStateChange(payload.new.state);
      }
    )
    .subscribe();
}

export function unsubscribeFromRoom(channel: RealtimeChannel): Promise<'ok' | 'timed out' | 'error'> {
  return channel.unsubscribe() as Promise<'ok' | 'timed out' | 'error'>;
}
