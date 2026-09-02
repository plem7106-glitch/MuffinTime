import { describe, expect, it, beforeEach, vi } from 'vitest';
import { soundManager } from './soundManager';

const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => {
    storage[key] = value;
  },
  removeItem: (key: string) => {
    delete storage[key];
  },
  clear: () => {
    for (const key of Object.keys(storage)) {
      delete storage[key];
    }
  },
};

describe('SFX Mute System Sync', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', mockLocalStorage);
    vi.stubGlobal('window', {});
    vi.stubGlobal('Audio', class {
      volume = 1;
      play() { return Promise.resolve(); }
      cloneNode() { return this; }
    });
    localStorage.clear();
    soundManager.setSfxEnabled(true);
  });

  it('1. When SFX is ON, getSfxEnabled() returns true', () => {
    soundManager.setSfxEnabled(true);
    expect(soundManager.getSfxEnabled()).toBe(true);
  });

  it('2. When SFX is OFF (muffin_sfx_enabled = "false"), getSfxEnabled() returns false and sound calls abort', () => {
    soundManager.setSfxEnabled(false);
    expect(soundManager.getSfxEnabled()).toBe(false);
    expect(localStorage.getItem('muffin_sfx_enabled')).toBe('false');

    const audioSpy = vi.spyOn(globalThis, 'Audio');

    soundManager.playSfx('/sounds/Select.mp3');
    soundManager.playSound('YOUR_TURN');
    soundManager.playSound('MUFFIN_TIME_REACHED');
    soundManager.playSound('GAME_WINNER');

    // ZERO audio instances should be created when SFX is muted
    expect(audioSpy).not.toHaveBeenCalled();
    audioSpy.mockRestore();
  });
});
