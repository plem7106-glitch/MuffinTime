import { everyoneDraws, everyoneDiscards } from '../game/group';
import { draw, discard } from '../game/pile';
import { stealRandom } from '../game/transfer';
import type { RoomState, PlayerId, CardCode } from '../game/types';

export type DemoCardType = 'action' | 'counter' | 'trap';

export interface DemoCard {
  code: CardCode;
  type: DemoCardType;
  th: string;
  effect: string;
  needsTarget: boolean;
}

export const DEMO_CARDS: DemoCard[] = [
  { code: 'A001', type: 'action', th: 'ผิดบ้านแล้ว!', effect: 'ผู้เล่นทุกคนที่ไม่ได้อาศัยอยู่ที่นี่ จั่วไพ่คนละ 2 ใบ', needsTarget: false },
  { code: 'A004', type: 'action', th: 'จักรวาลคู่ขนาน', effect: 'จั่วไพ่เพิ่มเท่ากับจำนวนไพ่ที่คุณมีอยู่ในมือตอนนี้', needsTarget: false },
  { code: 'A008', type: 'action', th: 'ปาชีส!', effect: 'ผู้เล่นคนอื่นทั้งหมดทิ้งไพ่คนละ 1 ใบ', needsTarget: false },
  { code: 'A014', type: 'action', th: 'ดึงนิ้วฉันสิ', effect: 'เลือกผู้เล่น 1 คนให้ขโมยไพ่จากมือคุณ 1 ใบ', needsTarget: true },
  { code: 'A016', type: 'action', th: "จัดการมัน!", effect: 'เลือกผู้เล่นอีก 1 คนให้ทิ้งไพ่ทั้งหมดในมือ', needsTarget: true },
  { code: 'C09', type: 'counter', th: 'หมาถือมีด', effect: 'หยุดไพ่ Trap ที่กำลังทำงานอยู่', needsTarget: false },
  { code: 'C16', type: 'counter', th: 'หน่วยกู้ระเบิด', effect: 'หยุดไพ่การ์ดที่กำลังทำงานอยู่ และจั่วไพ่ให้ตัวเอง 3 ใบ', needsTarget: false },
  { code: 'C17', type: 'counter', th: 'สั่งฉันไม่ได้หรอก', effect: 'หยุดไพ่ Action ที่กำลังทำงานอยู่ และจั่วไพ่ใหม่ให้ตัวเอง 1 ใบ', needsTarget: false },
  { code: 'T13', type: 'trap', th: 'จับได้แล้ว!', effect: 'หากผู้เล่นคนอื่นยอมรับว่าคุณโกหก ขโมยไพ่เขา 3 ใบ', needsTarget: true },
  { code: 'T14', type: 'trap', th: 'กี่โมงแล้ว?', effect: 'หากผู้เล่นคนอื่นถามเวลา ขโมยไพ่เขา 4 ใบ', needsTarget: true },
  { code: 'T16', type: 'trap', th: 'เปิดตำราหน่อย', effect: 'หากผู้เล่นคนอื่นเปิดกฎมาเช็ค ให้เขาทิ้งไพ่ 3 ใบ', needsTarget: true },
  { code: 'T27', type: 'trap', th: 'อย่าคิดถึงแมว', effect: 'หากผู้เล่นคนอื่นพูดถึงแมว ให้เขาทิ้งไพ่ 3 ใบ', needsTarget: true },
  { code: 'T45', type: 'trap', th: 'หักมุมซะงั้น!', effect: 'หากคุณมีไพ่ในมือ 0 ใบ จั่วไพ่ 10 ใบ (เปิดได้เฉพาะตอนมือว่าง)', needsTarget: false },
];

export function getDemoCard(code: CardCode): DemoCard {
  const card = DEMO_CARDS.find((c) => c.code === code);
  if (!card) throw new Error(`getDemoCard: unknown demo card code ${code}`);
  return card;
}

export function demoCardsOfType(type: DemoCardType): DemoCard[] {
  return DEMO_CARDS.filter((c) => c.type === type);
}

export function buildDemoDeck(copiesPerCard = 10): CardCode[] {
  const deck: CardCode[] = [];
  for (const card of DEMO_CARDS) {
    for (let i = 0; i < copiesPerCard; i++) deck.push(card.code);
  }
  return deck;
}

export function resolveActionCard(
  state: RoomState,
  code: CardCode,
  actorId: PlayerId,
  targetId?: PlayerId
): RoomState {
  switch (code) {
    case 'A001':
      return everyoneDraws(state, 2, [actorId]);
    case 'A004':
      return draw(state, actorId, state.players[actorId].hand.length);
    case 'A008':
      return everyoneDiscards(state, 1, [actorId]);
    case 'A014':
      if (!targetId) throw new Error('A014 requires a target');
      return stealRandom(state, targetId, actorId, 1);
    case 'A016':
      if (!targetId) throw new Error('A016 requires a target');
      return discard(state, targetId, state.players[targetId].hand.length);
    default:
      throw new Error(`resolveActionCard: ${code} is not a playable demo action`);
  }
}

export function resolveTrapCard(
  state: RoomState,
  code: CardCode,
  ownerId: PlayerId,
  targetId?: PlayerId
): RoomState {
  switch (code) {
    case 'T13':
      if (!targetId) throw new Error('T13 requires a target');
      return stealRandom(state, targetId, ownerId, 3);
    case 'T14':
      if (!targetId) throw new Error('T14 requires a target');
      return stealRandom(state, targetId, ownerId, 4);
    case 'T16':
      if (!targetId) throw new Error('T16 requires a target');
      return discard(state, targetId, 3);
    case 'T27':
      if (!targetId) throw new Error('T27 requires a target');
      return discard(state, targetId, 3);
    case 'T45':
      return draw(state, ownerId, 10);
    default:
      throw new Error(`resolveTrapCard: ${code} is not a playable demo trap`);
  }
}

export function resolveCounterCard(state: RoomState, code: CardCode, actorId: PlayerId): RoomState {
  switch (code) {
    case 'C16':
      return draw(state, actorId, 3);
    case 'C17':
      return draw(state, actorId, 1);
    case 'C09':
      return state;
    default:
      throw new Error(`resolveCounterCard: ${code} is not a playable demo counter`);
  }
}
