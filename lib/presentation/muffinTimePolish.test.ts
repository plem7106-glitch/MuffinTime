import { describe, expect, it } from 'vitest';
import { formatLiveStatus } from './liveStatusFormatter';
import type { LiveGameStatusData } from './liveStatusTypes';

describe('Presentation Polish Phase 2 Rules', () => {
  const players = {
    p1: { name: 'Tee' },
    p2: { name: 'Ploy' },
    p3: { name: 'Bank' },
  };

  it('1. MUFFIN TIME status formatting: viewer vs observer', () => {
    const muffinData: LiveGameStatusData = {
      kind: 'muffin-time',
      actorId: 'p3', // Bank
    };

    // Bank's view (Owner)
    const ownerView = formatLiveStatus(muffinData, 'p3', players);
    expect(ownerView?.text).toBe('🧁 MUFFIN TIME! คุณมีไพ่ 10 ใบ!');

    // Tee's view (Observer)
    const observerView = formatLiveStatus(muffinData, 'p1', players);
    expect(observerView?.text).toBe('🧁 MUFFIN TIME! Bank มีไพ่ 10 ใบ!');
  });

  it('2. YOUR TURN status formatting', () => {
    const yourTurnData: LiveGameStatusData = {
      kind: 'your-turn',
      actorId: 'p1', // Tee (Viewer)
    };

    const formatted = formatLiveStatus(yourTurnData, 'p1', players);
    expect(formatted?.text).toBe('⚡ ตาของคุณแล้ว!');
    expect(formatted?.subtext).toBe('เลือกจั่วไพ่ 1 ใบ หรือเล่น Action');
    expect(formatted?.isViewerActionRequired).toBe(true);
  });
});
