import { createRoom, addPlayer, startGame } from '../game/room';
import { placeTrap } from '../game/trap';
import { getTrapRule, isTrapImplemented } from '../game/trapRules/registry';
import { activateManualTrap } from '../game/trapRules/engine';
import { canonicalCardCodes } from '../data/cards/deck';
import { getCardsByType } from '../data/cards/index';
import type { RoomState } from '../game/types';

function create3PlayerGame(): RoomState {
  let room = createRoom('p1', 'Player 1', 3);
  room = addPlayer(room, 'p2', 'Bank (Bot)');
  room = addPlayer(room, 'p3', 'Tee (Bot)');
  return startGame(room, canonicalCardCodes, () => 0.5);
}

const allTraps = getCardsByType('trap');

console.log('=== T01-T66 COMPREHENSIVE AUDIT ===\n');
console.log(`ID  | Name                     | Mode             | Target | Registry | Place | Activate | Status`);
console.log(`----|--------------------------|------------------|--------|----------|-------|----------|-------`);

for (const trap of allTraps) {
  const code = trap.id;
  const rule = getTrapRule(code);
  const impl = isTrapImplemented(code);
  const mode = rule?.mode ?? 'MISSING';
  const target = rule?.needsTargetSelection ? 'YES' : 'NO';
  
  let placeOk = false;
  try {
    let state = create3PlayerGame();
    state.players.p1.hand.push(code);
    const result = placeTrap(state, 'p1', code);
    placeOk = result.players.p1.traps.includes(code);
  } catch (e) {
    placeOk = false;
  }
  
  let activateOk = '—';
  if (mode === 'manual_honor') {
    try {
      let state = create3PlayerGame();
      state.players.p1.traps = [code];
      state.turnPhase = 'main';
      
      if (code === 'T52' || code === 'T53') {
        state.sequenceNumber = 5;
        state.placedTrapMeta = {
          [`p1_${code}`]: {
            ownerId: 'p1',
            placedSequence: 1,
            placedRound: 1,
            placedByPlayerTurnIndex: 0,
          }
        };
      }
      
      if (rule?.needsTargetSelection) {
        const result = activateManualTrap(state, 'p1', code, ['p2']);
        activateOk = (result.reactionStack?.length ?? 0) > 0 ? 'OK' : 'FAIL';
      } else {
        const result = activateManualTrap(state, 'p1', code, []);
        activateOk = (result.reactionStack?.length ?? 0) > 0 ? 'OK' : 'FAIL';
      }
    } catch (e: any) {
      activateOk = `ERR:${(e.message ?? '').substring(0, 25)}`;
    }
  } else if (mode === 'interactive') {
    activateOk = 'interact';
  } else if (mode === 'automatic_event' || mode === 'automatic_state') {
    activateOk = 'auto';
  }
  
  const status = !impl ? 'BROKEN' :
    !placeOk ? 'BROKEN-PLACE' :
    (activateOk === 'FAIL' || activateOk.startsWith('ERR')) ? 'BROKEN-ACTIVATE' :
    'READY';
  
  const name = (trap.name_en ?? code).padEnd(24);
  console.log(`${code} | ${name} | ${mode.padEnd(16)} | ${target.padEnd(6)} | ${impl ? 'OK  ' : 'MISS'} | ${placeOk ? 'OK   ' : 'FAIL '} | ${activateOk.padEnd(8)} | ${status}`);
}
