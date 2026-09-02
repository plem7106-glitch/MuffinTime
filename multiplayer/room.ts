import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoomState } from '../game/types';
import { createRoom as engineCreateRoom } from '../game/room';
import type { PlayerId } from '../game/types';

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

const ROOM_CODE_CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O, 1/I — avoids visual mixups
const ROOM_CODE_LENGTH = 4;

export function makeRoomCode(rng: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += ROOM_CODE_CHARSET[Math.floor(rng() * ROOM_CODE_CHARSET.length)];
  }
  return out;
}

export async function insertRoom(client: SupabaseClient, code: string, state: RoomState): Promise<boolean> {
  const { error } = await client.from('rooms').insert({ code, state, version: 0 });
  if (error) {
    if (error.code === '23505') return false;
    throw new Error(`insertRoom failed: ${error.message}`);
  }
  return true;
}

export async function createRoomWithRetry(
  client: SupabaseClient,
  hostId: PlayerId,
  hostName: string,
  maxPlayers: number,
  maxAttempts = 5,
  rng: () => number = Math.random,
  hostBirthdayMMDD?: string
): Promise<{ code: string; state: RoomState }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = makeRoomCode(rng);
    const state = engineCreateRoom(hostId, hostName, maxPlayers, hostBirthdayMMDD);
    const inserted = await insertRoom(client, code, state);
    if (inserted) return { code, state };
  }
  throw new Error(`createRoomWithRetry: failed to find an unused room code after ${maxAttempts} attempts`);
}
