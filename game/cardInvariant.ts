import { canonicalCardCodes } from '../data/cards/deck';
import type { CardCode, RoomState } from './types';

export interface CardConservationReport {
  total: number;
  expectedTotal: number;
  duplicateCodes: CardCode[];
  missingCodes: CardCode[];
  unknownCodes: CardCode[];
  isValid: boolean;
}

/** Counts only physical card zones; reaction metadata is deliberately excluded. */
export function inspectCardConservation(
  state: RoomState,
  expectedCodes: readonly CardCode[] = canonicalCardCodes
): CardConservationReport {
  const expected = new Set(expectedCodes);
  const counts = new Map<CardCode, number>();
  const physicalCards: CardCode[] = [
    ...state.drawPile,
    ...state.discardPile,
    ...Object.values(state.players).flatMap((player) => [...player.hand, ...player.traps]),
  ];

  for (const code of physicalCards) {
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  const duplicateCodes = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([code]) => code)
    .sort();
  const missingCodes = [...expected].filter((code) => !counts.has(code)).sort();
  const unknownCodes = [...counts.keys()].filter((code) => !expected.has(code)).sort();

  return {
    total: physicalCards.length,
    expectedTotal: expectedCodes.length,
    duplicateCodes,
    missingCodes,
    unknownCodes,
    isValid:
      physicalCards.length === expectedCodes.length &&
      duplicateCodes.length === 0 &&
      missingCodes.length === 0 &&
      unknownCodes.length === 0,
  };
}

export function assertCardConservation(
  state: RoomState,
  expectedCodes: readonly CardCode[] = canonicalCardCodes
): void {
  const report = inspectCardConservation(state, expectedCodes);
  if (!report.isValid) {
    throw new Error(
      `card conservation violated: total=${report.total}/${report.expectedTotal}, ` +
      `duplicates=${report.duplicateCodes.join(',') || 'none'}, ` +
      `missing=${report.missingCodes.join(',') || 'none'}, ` +
      `unknown=${report.unknownCodes.join(',') || 'none'}`
    );
  }
}
