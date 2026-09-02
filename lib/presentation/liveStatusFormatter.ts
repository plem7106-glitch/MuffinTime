import type { LiveGameStatusData } from './liveStatusTypes';
import { getCardDisplay } from '../../data/cards/display';

export interface FormattedLiveStatus {
  text: string;
  subtext?: string;
  iconType: 'turn' | 'draw' | 'action' | 'trap' | 'counter' | 'transfer' | 'discard' | 'alert';
  isViewerTargeted: boolean;
  isViewerActionRequired: boolean;
}

export function formatLiveStatus(
  status: LiveGameStatusData | null,
  viewerId: string,
  players: Record<string, { name: string }>
): FormattedLiveStatus | null {
  if (!status) return null;

  const getPlayerName = (id?: string): string => {
    if (!id) return 'ผู้เล่น';
    if (id === viewerId) return 'คุณ';
    return players[id]?.name || id;
  };

  const actorName = getPlayerName(status.actorId);
  const targetName = status.targetId ? getPlayerName(status.targetId) : '';
  const isActorViewer = status.actorId === viewerId;
  const isTargetViewer = status.targetId === viewerId;
  const count = status.count || 1;

  let text = '';
  let subtext: string | undefined;
  let iconType: FormattedLiveStatus['iconType'] = 'turn';
  let isViewerTargeted = isTargetViewer && !isActorViewer;
  let isViewerActionRequired = status.emphasis === 'viewer-action-required';

  switch (status.kind) {
    case 'idle-turn': {
      iconType = 'turn';
      if (isActorViewer) {
        text = 'ตาของคุณ (เลือกจั่วไพ่ หรือ เล่น Action)';
      } else {
        text = `รอ ${actorName} เล่น...`;
      }
      break;
    }
    case 'draw': {
      iconType = 'draw';
      text = isActorViewer ? `คุณจั่วไพ่ ${count} ใบ` : `${actorName} จั่วไพ่ ${count} ใบ`;
      break;
    }
    case 'action': {
      iconType = 'action';
      const cardName = status.cardCode ? getCardDisplay(status.cardCode).th : '';
      const actionTitle = cardName ? `Action: ${cardName}` : 'Action';

      if (status.targetId) {
        if (isActorViewer) {
          text = `คุณเล่น ${actionTitle} ใส่ ${targetName}`;
        } else if (isTargetViewer) {
          text = `⚠ ${actorName} เล่น ${actionTitle} ใส่คุณ!`;
          isViewerTargeted = true;
        } else {
          text = `${actorName} เล่น ${actionTitle} ใส่ ${targetName}`;
        }
      } else {
        text = isActorViewer ? `คุณเล่น ${actionTitle}` : `${actorName} เล่น ${actionTitle}`;
      }
      break;
    }
    case 'trap-placement': {
      iconType = 'trap';
      text = isActorViewer ? 'คุณวางกับดัก' : `${actorName} วางกับดัก`;
      break;
    }
    case 'trap-activation': {
      iconType = 'trap';
      const cardName = status.cardCode ? getCardDisplay(status.cardCode).th : '';
      const trapTitle = cardName ? `กับดัก: ${cardName}` : 'กับดัก';

      if (status.targetId) {
        if (isActorViewer) {
          text = `คุณเปิด${trapTitle} ใส่ ${targetName}`;
        } else if (isTargetViewer) {
          text = `⚠ กับดักของ ${actorName} ทำงานใส่คุณ! (${trapTitle})`;
          isViewerTargeted = true;
        } else {
          text = `กับดักของ ${actorName} ทำงานใส่ ${targetName} (${trapTitle})`;
        }
      } else {
        text = isActorViewer ? `คุณเปิด${trapTitle}` : `กับดักของ ${actorName} ทำงาน! (${trapTitle})`;
      }
      break;
    }
    case 'counter': {
      iconType = 'counter';
      const cardName = status.cardCode ? getCardDisplay(status.cardCode).th : '';
      const counterTitle = cardName ? `Counter: ${cardName}` : 'Counter';
      text = isActorViewer ? `คุณใช้ ${counterTitle}!` : `${actorName} ใช้ ${counterTitle}!`;
      break;
    }
    case 'transfer': {
      iconType = 'transfer';
      if (status.targetId) {
        if (isActorViewer) {
          text = `คุณขโมยไพ่ ${count} ใบ จาก ${targetName}`;
        } else if (isTargetViewer) {
          text = `⚠ ${actorName} ขโมยไพ่ ${count} ใบ จากคุณ!`;
          isViewerTargeted = true;
        } else {
          text = `${actorName} ขโมยไพ่ ${count} ใบ จาก ${targetName}`;
        }
      } else {
        text = isActorViewer ? `คุณได้รับไพ่ ${count} ใบ` : `${actorName} ได้รับไพ่ ${count} ใบ`;
      }
      break;
    }
    case 'discard': {
      iconType = 'discard';
      text = isActorViewer ? `คุณทิ้งไพ่ ${count} ใบ` : `${actorName} ทิ้งไพ่ ${count} ใบ`;
      break;
    }
    case 'waiting-response': {
      iconType = 'alert';
      if (isTargetViewer || isViewerActionRequired) {
        text = `⚠ ${actorName} เล่นการ์ดใส่คุณ`;
        subtext = 'รอการตอบโต้ของคุณ...';
        isViewerActionRequired = true;
        isViewerTargeted = true;
      } else {
        text = `รอ ${targetName || 'ผู้เล่น'} ตอบโต้...`;
      }
      break;
    }
    case 'waiting-discard': {
      iconType = 'alert';
      if (isActorViewer || isViewerActionRequired) {
        text = `เลือกไพ่ที่ต้องทิ้งอีก ${count} ใบ`;
        subtext = 'เลือกไพ่จากมือเพื่อทิ้ง';
        isViewerActionRequired = true;
      } else {
        text = `รอ ${actorName} เลือกไพ่ที่จะทิ้ง...`;
      }
      break;
    }
    case 'waiting-target': {
      iconType = 'alert';
      if (isActorViewer || isViewerActionRequired) {
        text = 'เลือกผู้เล่นเป้าหมาย';
        subtext = 'แตะเลือกเป้าหมายที่ต้องการ';
        isViewerActionRequired = true;
      } else {
        text = `รอ ${actorName} เลือกเป้าหมาย...`;
      }
      break;
    }
    case 'waiting-choice': {
      iconType = 'alert';
      if (isActorViewer || isViewerActionRequired) {
        text = 'เลือกการตัดสินใจ';
        isViewerActionRequired = true;
      } else {
        text = `รอ ${actorName} ตัดสินใจ...`;
      }
      break;
    }
    case 'muffin-time': {
      iconType = 'alert';
      text = isActorViewer ? '🧁 MUFFIN TIME! คุณมีไพ่ 10 ใบ!' : `🧁 MUFFIN TIME! ${actorName} มีไพ่ 10 ใบ!`;
      subtext = 'ประกาศ MUFFIN TIME!';
      break;
    }
    case 'your-turn': {
      iconType = 'turn';
      text = '⚡ ตาของคุณแล้ว!';
      subtext = 'เลือกจั่วไพ่ 1 ใบ หรือเล่น Action';
      isViewerActionRequired = true;
      break;
    }
    default: {
      text = `ตาของ ${actorName}`;
      break;
    }
  }

  return {
    text,
    subtext,
    iconType,
    isViewerTargeted: isViewerTargeted || status.emphasis === 'viewer-targeted',
    isViewerActionRequired: isViewerActionRequired || status.emphasis === 'viewer-action-required',
  };
}
