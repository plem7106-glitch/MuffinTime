import { cloneState, shuffle, pickRandomIndices } from './util';
import type { RoomState, PlayerId, CardCode, Rng } from './types';
import { getCardById } from '../data/cards/index';

export function reshuffleDiscardIntoDraw(state: RoomState, rng: Rng = Math.random): RoomState {

  const next = cloneState(state);
  if (next.discardPile.length <= 1) return next;
  const top = next.discardPile[next.discardPile.length - 1];
  const rest = next.discardPile.slice(0, -1);
  next.drawPile = [...next.drawPile, ...shuffle(rest, rng)];
  next.discardPile = [top];
  return next;
}

export function draw(state: RoomState, playerId: PlayerId, n: number, _rng?: Rng): RoomState {
  let next = cloneState(state);
  for (let i = 0; i < n; i++) {
    if (next.drawPile.length === 0) break;
    const card = next.drawPile.pop()!;
    next.players[playerId].hand.push(card);
    if (card === 'A064') {
      next = discardOthersAfterBananaPeel(next, playerId);
    }
  }
  return next;
}

/**
 * A064 "เปลือกกล้วย": whoever draws it keeps it (already true -- the push
 * above puts it in their hand) and discards 3 other cards, chosen at
 * random, excluding A064 itself. Only one physical copy of A064 exists in
 * the whole 231-card deck, so excluding it by card code is exact -- no
 * index-tracking needed. Clamps to however many other cards they actually
 * hold (0-3) rather than throwing if they have fewer than 3 others.
 */
function discardOthersAfterBananaPeel(state: RoomState, playerId: PlayerId): RoomState {
  const hand = state.players[playerId].hand;
  const others = hand.filter((code) => code !== 'A064');
  const count = Math.min(3, others.length);
  const indices = pickRandomIndices(others.length, count, Math.random);
  const toDiscard = indices.map((i) => others[i]);
  return discard(state, playerId, count, toDiscard);
}

export function drawFromBottom(state: RoomState, playerId: PlayerId, n: number): RoomState {
  const next = cloneState(state);
  for (let i = 0; i < n; i++) {
    if (next.drawPile.length === 0) break;
    const card = next.drawPile.shift()!;
    next.players[playerId].hand.push(card);
  }
  return next;
}

export function discard(
  state: RoomState,
  playerId: PlayerId,
  n: number,
  cardCodes: CardCode[] | null = null,
  rng: Rng = Math.random
): RoomState {
  if (n <= 0) return cloneState(state);
  const next = cloneState(state);
  const hand = next.players[playerId].hand;
  let toDiscard: CardCode[];
  if (cardCodes) {
    if (cardCodes.length !== n) {
      throw new Error(`discard: cardCodes length (${cardCodes.length}) does not match n (${n})`);
    }
    toDiscard = cardCodes;
  } else {
    const indices = pickRandomIndices(hand.length, Math.min(n, hand.length), rng);
    toDiscard = indices.map((i) => hand[i]);
  }
  for (const code of toDiscard) {
    const pos = hand.indexOf(code);
    if (pos === -1) {
      throw new Error(`discard: card ${code} not found in hand`);
    }
    hand.splice(pos, 1);
    next.discardPile.push(code);
  }
  return next;
}

/**
 * Reshuffle ONLY the remaining cards in the drawPile with a balanced

 * card-type distribution (Action = blue, Trap = red, Counter = green).
 *
 * Guaranteed properties:
 * - 100% preservation of all card IDs and total card count.
 * - Same count per type before and after.
 * - Prevents 3+ consecutive cards of the same type whenever other types are available.
 * - Penalizes repeating the same type consecutively.
 * - Retains randomness (not deterministic round-robin).
 */
export function balancedShuffleDrawPile(
  state: RoomState,
  rng: Rng = Math.random
): RoomState {
  if (state.drawPile.length <= 1) {
    return cloneState(state);
  }

  const next = cloneState(state);
  const remainingCards = [...next.drawPile];

  // 1. Separate cards into pools by CardType
  const actionPool: CardCode[] = [];
  const trapPool: CardCode[] = [];
  const counterPool: CardCode[] = [];
  const otherPool: CardCode[] = [];

  for (const code of remainingCards) {
    const cardData = getCardById(code);
    if (!cardData) {
      otherPool.push(code);
    } else if (cardData.type === 'action') {
      actionPool.push(code);
    } else if (cardData.type === 'trap') {
      trapPool.push(code);
    } else if (cardData.type === 'counter') {
      counterPool.push(code);
    } else {
      otherPool.push(code);
    }
  }

  // 2. Randomly shuffle each pool internally
  const pools: Record<'action' | 'trap' | 'counter' | 'other', CardCode[]> = {
    action: shuffle(actionPool, rng),
    trap: shuffle(trapPool, rng),
    counter: shuffle(counterPool, rng),
    other: shuffle(otherPool, rng),
  };

  // 3. Interleaved weighted random selection
  const result: CardCode[] = [];
  const totalCards = remainingCards.length;
  const recentTypes: ('action' | 'trap' | 'counter' | 'other')[] = [];

  for (let i = 0; i < totalCards; i++) {
    const availableTypes = (['action', 'trap', 'counter', 'other'] as const).filter(
      (type) => pools[type].length > 0
    );

    if (availableTypes.length === 1) {
      const soleType = availableTypes[0];
      const card = pools[soleType].pop()!;
      result.push(card);
      recentTypes.push(soleType);
      continue;
    }

    const lastType = recentTypes.length > 0 ? recentTypes[recentTypes.length - 1] : null;
    const last2Same =
      recentTypes.length >= 2 &&
      recentTypes[recentTypes.length - 1] === recentTypes[recentTypes.length - 2];

    const candidates: { type: 'action' | 'trap' | 'counter' | 'other'; weight: number }[] = [];

    for (const type of availableTypes) {
      let weight = pools[type].length;

      // Strongly avoid 3+ cards of the same type consecutively
      if (last2Same && lastType === type) {
        weight = 0;
      } else if (lastType === type) {
        // Reduce probability of immediate repeated type
        weight = weight * 0.35;
      }

      candidates.push({ type, weight });
    }

    const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
    let chosenType: 'action' | 'trap' | 'counter' | 'other';

    if (totalWeight <= 0) {
      chosenType = availableTypes[Math.floor(rng() * availableTypes.length)];
    } else {
      let roll = rng() * totalWeight;
      chosenType = candidates[0].type;
      for (const c of candidates) {
        if (roll < c.weight) {
          chosenType = c.type;
          break;
        }
        roll -= c.weight;
      }
    }

    const card = pools[chosenType].pop()!;
    result.push(card);
    recentTypes.push(chosenType);
  }

  next.drawPile = result;
  return next;
}

