import { describe, expect, it } from 'vitest';
import { formatLiveStatus } from './liveStatusFormatter';
import type { LiveGameStatusData } from './liveStatusTypes';

describe('Live Game Status Viewer-Aware Formatter', () => {
  const players = {
    p1: { name: 'Tee' },
    p2: { name: 'Ploy' },
    p3: { name: 'Bank' },
  };

  it('1. Action formatting: actor viewer vs target viewer vs observer', () => {
    const actionData: LiveGameStatusData = {
      kind: 'action',
      actorId: 'p2', // Ploy
      targetId: 'p3', // Bank
      cardCode: 'A001',
    };

    // P2's view (Actor)
    const actorView = formatLiveStatus(actionData, 'p2', players);
    expect(actorView?.text).toContain('คุณเล่น Action');
    expect(actorView?.text).toContain('ใส่ Bank');

    // P3's view (Target)
    const targetView = formatLiveStatus(actionData, 'p3', players);
    expect(targetView?.text).toContain('Ploy');
    expect(targetView?.text).toContain('ใส่คุณ!');
    expect(targetView?.isViewerTargeted).toBe(true);

    // P1's view (Observer)
    const observerView = formatLiveStatus(actionData, 'p1', players);
    expect(observerView?.text).toContain('Ploy เล่น Action');
    expect(observerView?.text).toContain('ใส่ Bank');
    expect(observerView?.isViewerTargeted).toBe(false);
  });

  it('2. Card Transfer / Steal: thief viewer vs victim viewer vs observer', () => {
    const transferData: LiveGameStatusData = {
      kind: 'transfer',
      actorId: 'p3', // Bank (Thief)
      targetId: 'p1', // Tee (Victim)
      count: 3,
    };

    // P3's view (Bank / Thief)
    const thiefView = formatLiveStatus(transferData, 'p3', players);
    expect(thiefView?.text).toBe('คุณขโมยไพ่ 3 ใบ จาก Tee');

    // P1's view (Tee / Victim)
    const victimView = formatLiveStatus(transferData, 'p1', players);
    expect(victimView?.text).toBe('⚠ Bank ขโมยไพ่ 3 ใบ จากคุณ!');
    expect(victimView?.isViewerTargeted).toBe(true);

    // P2's view (Ploy / Observer)
    const observerView = formatLiveStatus(transferData, 'p2', players);
    expect(observerView?.text).toBe('Bank ขโมยไพ่ 3 ใบ จาก Tee');
    expect(observerView?.isViewerTargeted).toBe(false);
  });

  it('3. Trap placement & Draw: NEVER exposes hidden card code/name', () => {
    const trapPlacementData: LiveGameStatusData = {
      kind: 'trap-placement',
      actorId: 'p3',
      cardCode: 'T53', // Hidden!
    };

    const formattedTrap = formatLiveStatus(trapPlacementData, 'p1', players);
    expect(formattedTrap?.text).toBe('Bank วางกับดัก');
    expect(formattedTrap?.text).not.toContain('T53');

    const drawData: LiveGameStatusData = {
      kind: 'draw',
      actorId: 'p3',
      count: 1,
      cardCode: 'A085', // Hidden!
    };

    const formattedDraw = formatLiveStatus(drawData, 'p1', players);
    expect(formattedDraw?.text).toBe('Bank จั่วไพ่ 1 ใบ');
    expect(formattedDraw?.text).not.toContain('A085');
  });

  it('4. Viewer action required priority flag', () => {
    const waitingRespData: LiveGameStatusData = {
      kind: 'waiting-response',
      actorId: 'p2', // Ploy played card
      targetId: 'p1', // Tee (Viewer) must respond
      emphasis: 'viewer-action-required',
    };

    const formatted = formatLiveStatus(waitingRespData, 'p1', players);
    expect(formatted?.isViewerActionRequired).toBe(true);
    expect(formatted?.subtext).toBe('รอการตอบโต้ของคุณ...');
  });
});
