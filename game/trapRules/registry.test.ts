import { describe, expect, it } from 'vitest';
import { getTrapStatus, isTrapImplemented } from './registry';

describe('production trap capabilities', () => {
  it('uses the trap rule registry as the implementation source of truth', () => {
    for (let i = 1; i <= 10; i++) {
      const code = `T${String(i).padStart(2, '0')}`;
      expect(isTrapImplemented(code)).toBe(true);
      expect(getTrapStatus(code)).toBe('implemented');
    }
    expect(isTrapImplemented('T66')).toBe(false);
    expect(getTrapStatus('T66')).toBe('not_implemented');
  });
});
