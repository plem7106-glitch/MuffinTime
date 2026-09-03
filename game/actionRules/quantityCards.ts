import type { CardCode } from '../types';

/**
 * Action cards eligible to pair with A028 "ทาเยอะไปหน่อย" (doubles another
 * Action's effect) -- cards whose effect is fundamentally drawing,
 * discarding, or stealing a card count. Enumerated by a one-time audit of
 * game/actionRules/definitions.ts during planning (see
 * docs/superpowers/plans/2026-09-03-group1-cluster-d.md, Task 7) rather
 * than derived automatically at runtime, since "is this fundamentally a
 * quantity effect" needs a human read of the card text in the ambiguous
 * cases -- see docs/superpowers/specs/2026-09-03-group1-cluster-d-design.md.
 */
export const QUANTITY_EFFECT_CARDS: ReadonlySet<CardCode> = new Set([
  'A001', 'A002', 'A004', 'A005', 'A006', 'A007', 'A008', 'A011', 'A012', 'A013',
  'A014', 'A016', 'A020', 'A022', 'A026', 'A029', 'A031', 'A033', 'A036', 'A038',
  'A039', 'A041', 'A042', 'A044', 'A045', 'A051', 'A052', 'A054', 'A055', 'A056',
  'A057', 'A058', 'A061', 'A062', 'A063', 'A065', 'A067', 'A068', 'A069', 'A070',
  'A073', 'A075', 'A077', 'A079', 'A081', 'A082', 'A083', 'A088', 'A090', 'A095',
  'A096', 'A097', 'A098', 'A099', 'A101', 'A102', 'A103', 'A104', 'A107', 'A111',
  'A112', 'A114', 'A115', 'A118', 'A120', 'A121', 'A125', 'A127', 'A129', 'A131',
  'A132', 'A133', 'A134', 'A136', 'A138', 'A139', 'A140', 'A141', 'A142', 'A143',
  'A144', 'A145', 'A146', 'A147', 'A148', 'A149', 'A150', 'A151', 'A152', 'A153',
  'A155', 'A157', 'A158', 'A159', 'A160', 'A162', 'A163', 'A165', 'A166', 'A167',
  'A168', 'A170', 'A171', 'A173',
  // A084 (hand swap) deliberately excluded -- see this file's implementation
  // plan (Task 7, Step 1) for why: doubling a swap via double-invoke cancels
  // itself out instead of compounding.
]);

export function isQuantityEffectCard(code: CardCode): boolean {
  return QUANTITY_EFFECT_CARDS.has(code);
}
