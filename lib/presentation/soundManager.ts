import type { PresentationEventType } from './presentationTypes';

const SOUND_MAPPING: Record<PresentationEventType, string> = {
  CARD_DRAW: '/sounds/Card1.mp3',
  ACTION_PLAYED: '/sounds/Game Action.mp3',
  TRAP_PLACED: '/sounds/Card3.mp3',
  TRAP_ACTIVATED: '/sounds/TRAP.mp3',
  COUNTER_PLAYED: '/sounds/Couter.mp3',
  CARD_TRANSFER: '/sounds/Woosh1.mp3',
  CARD_DISCARDED: '/sounds/Card2.mp3',
  MUFFIN_TIME_REACHED: '/sounds/Level.mp3',
  YOUR_TURN: '/sounds/Round.mp3',
  RESPONSE_REQUIRED: '/sounds/TRAP.mp3',
  GAME_WINNER: '/sounds/Succes.mp3',
};

const SOUND_VOLUMES: Partial<Record<PresentationEventType, number>> = {
  CARD_DRAW: 0.5,
  CARD_TRANSFER: 0.6,
  CARD_DISCARDED: 0.6,
  ACTION_PLAYED: 0.75,
  TRAP_PLACED: 0.6,
  TRAP_ACTIVATED: 0.8,
  COUNTER_PLAYED: 0.8,
  RESPONSE_REQUIRED: 0.7,
  YOUR_TURN: 0.85,
  MUFFIN_TIME_REACHED: 0.9,
  GAME_WINNER: 0.9,
};

class SoundManager {
  private isSfxEnabled: boolean = true;
  private audioCache: Map<string, HTMLAudioElement> = new Map();

  public setSfxEnabled(enabled: boolean) {
    this.isSfxEnabled = enabled;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('muffin_sfx_enabled', String(enabled));
    }
  }

  public getSfxEnabled(): boolean {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('muffin_sfx_enabled');
      if (stored !== null) {
        return stored !== 'false';
      }
    }
    return this.isSfxEnabled;
  }

  public playSfx(src: string, volume: number = 0.4) {
    if (!this.getSfxEnabled() || typeof window === 'undefined') return;
    try {
      let audio = this.audioCache.get(src);
      if (!audio) {
        audio = new Audio(src);
        this.audioCache.set(src, audio);
      }
      const clone = audio.cloneNode(true) as HTMLAudioElement;
      clone.volume = volume;
      clone.play().catch(() => {});
    } catch {
      // ignore audio errors
    }
  }

  public playSound(type: PresentationEventType) {
    if (!this.getSfxEnabled() || typeof window === 'undefined') return;

    const src = SOUND_MAPPING[type];
    if (!src) return;

    const targetVolume = SOUND_VOLUMES[type] ?? 0.7;
    this.playSfx(src, targetVolume);
  }
}

export const soundManager = new SoundManager();
