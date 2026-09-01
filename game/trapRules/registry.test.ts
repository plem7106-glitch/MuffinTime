import { describe, expect, it } from 'vitest';
import { getTrapStatus, isTrapImplemented } from './registry';

describe('production trap capabilities', () => {
  it('uses the trap rule registry as the implementation source of truth for all T01-T66 traps', () => {
    for (let i = 1; i <= 66; i++) {
      const code = `T${String(i).padStart(2, '0')}`;
      expect(isTrapImplemented(code)).toBe(true);
      expect(getTrapStatus(code)).toBe('implemented');
    }
  });
});
