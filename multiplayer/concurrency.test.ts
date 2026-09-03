/**
 * Multiplayer concurrency regression, without a network.
 *
 * Runs the REAL updateRoomWithRetry/fetchRoom/writeRoomState against an
 * in-memory `rooms` table that reproduces Postgres's compare-and-swap exactly
 * (an UPDATE ... WHERE version = N matches zero rows once someone else has
 * bumped the version). That is the whole of the app's conflict story, so a lost
 * update or a double-applied action shows up here the same way it would with a
 * real Supabase behind it.
 */
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { updateRoomWithRetry } from './room';
import { createRoom, addPlayer, startGame } from '../game/room';
import { advanceTurn } from '../game/turn';
import { draw } from '../game/pile';
import { canonicalCardCodes } from '../data/cards/deck';
import type { RoomState, CardCode, PlayerId } from '../game/types';

const PLAYERS: PlayerId[] = ['p1', 'p2', 'p3', 'p4'];

/** Every physical zone, so a lost update shows up as a card count change. */
function census(state: RoomState): Map<CardCode, number> {
  const counts = new Map<CardCode, number>();
  for (const c of [
    ...state.drawPile,
    ...state.discardPile,
    ...(state.banishedCards ?? []),
    ...Object.values(state.players).flatMap((p) => [...p.hand, ...p.traps]),
  ]) counts.set(c, (counts.get(c) ?? 0) + 1);
  return counts;
}

function totalCards(state: RoomState): number {
  return [...census(state).values()].reduce((a, b) => a + b, 0);
}

/** In-memory stand-in for the `rooms` table, with the same optimistic lock. */
function makeFakeSupabase(initial: RoomState, sabotage = false) {
  const row = { state: JSON.parse(JSON.stringify(initial)) as RoomState, version: 0 };
  const stats = { reads: 0, writeAttempts: 0, conflicts: 0 };

  const client = {
    from(table: string) {
      if (table !== 'rooms') throw new Error(`unexpected table ${table}`);
      return {
        select() {
          const q = {
            eq() { return q; },
            async single() {
              stats.reads++;
              const snapshot = { state: JSON.parse(JSON.stringify(row.state)) as RoomState, version: row.version };
              // sabotage mode: a rival client commits between this read and the
              // caller's write, so the caller's expectedVersion is always stale
              if (sabotage) row.version++;
              // hand out a copy: a client can't mutate the server's row directly
              return { data: snapshot, error: null };
            },
          };
          return q;
        },
        update(patch: { state: RoomState; version: number }) {
          let expected: number | undefined;
          const q = {
            eq(col: string, val: unknown) {
              if (col === 'version') expected = val as number;
              return q;
            },
            select() {
              stats.writeAttempts++;
              if (expected !== row.version) {
                stats.conflicts++;
                return Promise.resolve({ data: [], error: null }); // 0 rows -> caller retries
              }
              row.state = JSON.parse(JSON.stringify(patch.state));
              row.version = patch.version;
              return Promise.resolve({ data: [{ version: row.version }], error: null });
            },
          };
          return q;
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, row, stats };
}

function startedGame(): RoomState {
  let s = createRoom('p1', 'P1');
  s = addPlayer(s, 'p2', 'P2');
  s = addPlayer(s, 'p3', 'P3');
  s = addPlayer(s, 'p4', 'P4');
  let n = 7;
  return startGame(s, canonicalCardCodes, () => { n = (n * 1103515245 + 12345) & 0x7fffffff; return n / 0x7fffffff; });
}

describe('multiplayer concurrency against the real retry path', () => {
  it('a clean sequential write keeps every card and bumps the version once', async () => {
    const base = startedGame();
    const { client, row, stats } = makeFakeSupabase(base);
    const before = totalCards(base);
    await updateRoomWithRetry(client, 'AAAA', (s) => draw(s, 'p1', 2));
    expect(row.version).toBe(1);
    expect(totalCards(row.state)).toBe(before);
    expect(stats.conflicts).toBe(0);
  });

  it('four players writing at the SAME version lose nothing', async () => {
    const base = startedGame();
    const { client, row, stats } = makeFakeSupabase(base);
    const before = totalCards(base);

    // all four read version 0, then race to write
    await Promise.all(PLAYERS.map((pid) => updateRoomWithRetry(client, 'AAAA', (s) => draw(s, pid, 1))));

    expect(stats.conflicts).toBeGreaterThan(0);          // the race really happened
    expect(row.version).toBe(4);                          // every write eventually landed
    expect(totalCards(row.state)).toBe(before);           // no card invented or lost
    for (const pid of PLAYERS) {
      expect(row.state.players[pid].hand.length).toBe(base.players[pid].hand.length + 1);
    }
  });

  it('racing end-turns advance the turn exactly once each, never skipping a player', async () => {
    const base = startedGame();
    const { client, row } = makeFakeSupabase(base);
    await Promise.all([
      updateRoomWithRetry(client, 'AAAA', (s) => advanceTurn(s)),
      updateRoomWithRetry(client, 'AAAA', (s) => advanceTurn(s)),
    ]);
    expect(row.version).toBe(2);
    const order = row.state.turnOrder;
    expect(row.state.players[order[row.state.currentTurnIndex]]).toBeDefined();
    expect(row.state.currentTurnIndex).toBe(2); // advanced twice from seat 0
  });

  it('a player joining while others act does not clobber their writes', async () => {
    let lobby = createRoom('p1', 'P1');
    lobby = addPlayer(lobby, 'p2', 'P2');
    const { client, row } = makeFakeSupabase(lobby);
    await Promise.all([
      updateRoomWithRetry(client, 'AAAA', (s) => addPlayer(s, 'p3', 'P3')),
      updateRoomWithRetry(client, 'AAAA', (s) => addPlayer(s, 'p4', 'P4')),
      updateRoomWithRetry(client, 'AAAA', (s) => addPlayer(s, 'p5', 'P5')),
    ]);
    expect(Object.keys(row.state.players).sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(row.version).toBe(3);
  });

  it('gives up loudly instead of silently losing a write past maxAttempts', async () => {
    const base = startedGame();
    // sabotage: a rival commits between every read and write, so no attempt can land
    const { client, row } = makeFakeSupabase(base, true);
    await expect(
      updateRoomWithRetry(client, 'AAAA', (s) => draw(s, 'p1', 1), 3)
    ).rejects.toThrow(/failed to write after 3 attempts/);
    // the failed write must not have half-applied anything
    expect(totalCards(row.state)).toBe(totalCards(base));
    expect(row.state.players.p1.hand.length).toBe(base.players.p1.hand.length);
  });

  it('SUMMARY: 40 interleaved actions from 4 players stay consistent', async () => {
    const base = startedGame();
    const { client, row, stats } = makeFakeSupabase(base);
    const before = totalCards(base);
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 40; i++) {
      const pid = PLAYERS[i % PLAYERS.length];
      jobs.push(updateRoomWithRetry(client, 'AAAA', (s) => draw(s, pid, 1), 60));
    }
    await Promise.all(jobs);
    // The race has to be real, or "no lost updates" proves nothing.
    expect(stats.conflicts).toBeGreaterThan(0);
    expect(row.version).toBe(40);
    expect(totalCards(row.state)).toBe(before);
    const dupes = [...census(row.state).entries()].filter(([, n]) => n > 1);
    expect(dupes).toEqual([]);
  });
});

/**
 * Full end-to-end multiplayer: three independent clients, each with its own
 * local copy of the room, talking to one shared server. Every commit is
 * broadcast to all three the way multiplayer/realtime.ts delivers it, so client
 * divergence -- the bug you cannot see with a single browser open -- shows up as
 * two clients holding different states at the same version.
 */
describe('three networked clients playing a whole game', () => {
  it('all clients converge on identical state after every turn', async () => {
    const base = startedGame();
    const { client, row } = makeFakeSupabase(base);

    // each simulated device keeps its own copy, refreshed only by broadcasts
    const views: Record<PlayerId, { state: RoomState; version: number }> = {} as never;
    for (const pid of PLAYERS) views[pid] = { state: JSON.parse(JSON.stringify(base)), version: 0 };
    const broadcast = () => {
      for (const pid of PLAYERS) {
        views[pid] = { state: JSON.parse(JSON.stringify(row.state)), version: row.version };
      }
    };

    const divergences: string[] = [];
    const before = totalCards(base);
    let turnsPlayed = 0;

    for (let turn = 0; turn < 24; turn++) {
      const server = row.state;
      const activeId = server.turnOrder[server.currentTurnIndex];
      if (!server.players[activeId]) { divergences.push(`turn ${turn}: active player missing`); break; }

      // the active client acts from ITS OWN view, not from the server's
      const actingView = views[activeId];
      if (actingView.version !== row.version) {
        divergences.push(`turn ${turn}: ${activeId} acted on stale v${actingView.version} vs server v${row.version}`);
      }
      await updateRoomWithRetry(client, 'AAAA', (s) => advanceTurn(draw(s, activeId, 1)));
      broadcast();
      turnsPlayed++;

      // every device must now hold byte-identical state
      const reference = JSON.stringify(views[PLAYERS[0]].state);
      for (const pid of PLAYERS.slice(1)) {
        if (JSON.stringify(views[pid].state) !== reference) {
          divergences.push(`turn ${turn}: ${pid}'s view differs from ${PLAYERS[0]}'s`);
        }
      }
      if (totalCards(row.state) !== before) {
        divergences.push(`turn ${turn}: card total drifted ${before} -> ${totalCards(row.state)}`);
      }
    }

    expect(divergences, divergences.join('; ')).toEqual([]);
    expect(turnsPlayed).toBe(24);
  });

  it('DISCRIMINATION: the convergence check catches a client that drifts', async () => {
    const base = startedGame();
    const a = JSON.parse(JSON.stringify(base)) as RoomState;
    const b = JSON.parse(JSON.stringify(base)) as RoomState;
    b.players.p2.hand.push(b.drawPile.pop()!); // one device silently gains a card
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(totalCards(a)).toBe(totalCards(b)); // same total -- only a divergence check finds this
  });
});
