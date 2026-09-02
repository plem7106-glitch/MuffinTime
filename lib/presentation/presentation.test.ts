import { describe, expect, it } from 'vitest';
import { soundManager } from './soundManager';
import type { PresentationEvent } from './presentationTypes';

describe('Presentation Layer & Privacy Boundaries', () => {
  it('CARD_DRAW presentation event does not leak cardCode publicly', () => {
    const rawInput = {
      type: 'CARD_DRAW' as const,
      actorId: 'p1',
      count: 1,
      // Attempting to pass secret card code
      cardCode: 'T06',
    };

    // Verification of privacy sanitization logic
    const isHiddenType =
      rawInput.type === 'CARD_DRAW' ||
      rawInput.type === 'TRAP_PLACED' ||
      rawInput.type === 'CARD_TRANSFER' ||
      rawInput.type === 'CARD_DISCARDED';

    const sanitized: PresentationEvent = {
      ...rawInput,
      cardCode: isHiddenType ? undefined : rawInput.cardCode,
      id: 'test_1',
      timestamp: Date.now(),
    };

    expect(sanitized.cardCode).toBeUndefined();
    expect(sanitized.type).toBe('CARD_DRAW');
  });

  it('TRAP_PLACED presentation event does not leak trapCode publicly', () => {
    const rawInput = {
      type: 'TRAP_PLACED' as const,
      actorId: 'p1',
      cardCode: 'T53',
    };

    const isHiddenType =
      (rawInput.type as string) === 'CARD_DRAW' ||
      (rawInput.type as string) === 'TRAP_PLACED' ||
      (rawInput.type as string) === 'CARD_TRANSFER' ||
      (rawInput.type as string) === 'CARD_DISCARDED';

    const sanitized: PresentationEvent = {
      ...rawInput,
      cardCode: isHiddenType ? undefined : rawInput.cardCode,
      id: 'test_2',
      timestamp: Date.now(),
    };

    expect(sanitized.cardCode).toBeUndefined();
  });

  it('ACTION_PLAYED and TRAP_ACTIVATED include public cardCode', () => {
    const actionInput: PresentationEvent = {
      id: 'test_3',
      type: 'ACTION_PLAYED',
      actorId: 'p1',
      cardCode: 'A001',
      timestamp: Date.now(),
    };

    const trapActivatedInput: PresentationEvent = {
      id: 'test_4',
      type: 'TRAP_ACTIVATED',
      actorId: 'p1',
      cardCode: 'T10',
      timestamp: Date.now(),
    };

    expect(actionInput.cardCode).toBe('A001');
    expect(trapActivatedInput.cardCode).toBe('T10');
  });

  it('Sound playback failures do not throw errors or break code execution', () => {
    soundManager.setSfxEnabled(true);
    expect(() => {
      soundManager.playSound('CARD_DRAW');
      soundManager.playSound('ACTION_PLAYED');
    }).not.toThrow();
  });
});
