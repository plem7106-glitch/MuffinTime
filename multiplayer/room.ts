import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoomState } from '../game/types';

export interface RoomRow {
  state: RoomState;
  version: number;
}

export async function fetchRoom(client: SupabaseClient, code: string): Promise<RoomRow> {
  const { data, error } = await client.from('rooms').select('state, version').eq('code', code).single();
  if (error) throw new Error(`fetchRoom failed: ${error.message}`);
  return data as RoomRow;
}

export async function writeRoomState(
  client: SupabaseClient,
  code: string,
  nextState: RoomState,
  expectedVersion: number
): Promise<boolean> {
  const { data, error } = await client
    .from('rooms')
    .update({ state: nextState, version: expectedVersion + 1 })
    .eq('code', code)
    .eq('version', expectedVersion)
    .select('version');
  if (error) throw new Error(`writeRoomState failed: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function updateRoomWithRetry(
  client: SupabaseClient,
  code: string,
  updater: (state: RoomState) => RoomState,
  maxAttempts = 5
): Promise<RoomState> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const row = await fetchRoom(client, code);
    const nextState = updater(row.state);
    const wrote = await writeRoomState(client, code, nextState, row.version);
    if (wrote) return nextState;
  }
  throw new Error(`updateRoomWithRetry: failed to write after ${maxAttempts} attempts (code=${code})`);
}
