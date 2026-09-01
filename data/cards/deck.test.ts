import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startGame, addPlayer, createRoom } from '../../game/room';
import { buildCanonicalDeck } from './deck';

function rangeCodes(prefix: string, count: number, width: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${String(index + 1).padStart(width, '0')}`);
}

const EXPECTED_ACTION_CODES = rangeCodes('A', 173, 3);
const EXPECTED_TRAP_CODES = rangeCodes('T', 66, 2);
const EXPECTED_COUNTER_CODES = rangeCodes('C', 50, 2);
const EXPECTED_CANONICAL_CODES = [...EXPECTED_ACTION_CODES, ...EXPECTED_TRAP_CODES, ...EXPECTED_COUNTER_CODES];

describe('canonical deck composition', () => {
  it('builds the complete 289-card canonical deck with no missing or duplicate codes', () => {
    const deck = buildCanonicalDeck();

    expect(deck).toHaveLength(289);
    expect(deck).toEqual(EXPECTED_CANONICAL_CODES);
    expect(new Set(deck).size).toBe(289);
  });

  it('starts a game by shuffling the full canonical deck, then dealing from the draw pile', () => {
    let room = createRoom('host', 'Host');
    room = addPlayer(room, 'p2', 'P2');
    room = addPlayer(room, 'p3', 'P3');

    const next = startGame(room, buildCanonicalDeck(), () => 0.999999);
    const hands = Object.values(next.players).flatMap((player) => player.hand);
    const allLiveCards = [...next.drawPile, ...hands];

    expect(next.drawPile).toHaveLength(289 - 9);
    expect(hands).toHaveLength(9);
    expect(allLiveCards).toHaveLength(289);
    expect(new Set(allLiveCards).size).toBe(289);
    expect([...allLiveCards].sort()).toEqual([...EXPECTED_CANONICAL_CODES].sort());
  });

  it('uses the shared canonical deck builder for session game starts instead of the demo deck', () => {
    const sessionSource = readFileSync(join(process.cwd(), 'lib', 'session.tsx'), 'utf8');

    expect(sessionSource).toContain("../data/cards/deck");
    expect(sessionSource).toContain('buildCanonicalDeck');
    expect(sessionSource).not.toContain('buildDemoDeck');
  });
});
