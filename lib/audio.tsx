'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

export type AudioPhase = 'pre-game' | 'gameplay';

export interface AudioContextValue {
  isMusicEnabled: boolean;
  isSfxEnabled: boolean;
  audioPhase: AudioPhase;
  setAudioPhase: (phase: AudioPhase) => void;
  toggleMusic: () => void;
  toggleSfx: () => void;
  playLobbyMusic: () => void;
  stopLobbyMusic: () => void;
  playGameStart: () => void;
}

const AudioContext = createContext<AudioContextValue | null>(null);

const LOBBY_MUSIC_SRC = '/sounds/muffin-song.mp3';
const GAME_START_SRC = '/sounds/Game-Start.mp3';

// Reduce volume by about 25 dB from full scale: 10^(-25/20) ≈ 0.056
const LOBBY_VOLUME = 0.056;
const SFX_VOLUME = 0.85;

const FADE_IN_DURATION_MS = 1800;
const FADE_OUT_DURATION_MS = 500;

const INTERACTION_EVENTS = ['click', 'pointerdown', 'touchstart', 'keydown'] as const;

export function AudioProvider({ children }: { children: ReactNode }) {
  const [isMusicEnabled, setIsMusicEnabled] = useState<boolean>(true);
  const [isSfxEnabled, setIsSfxEnabled] = useState<boolean>(true);
  const [audioPhase, setAudioPhaseState] = useState<AudioPhase>('pre-game');

  const lobbyAudioRef = useRef<HTMLAudioElement | null>(null);
  const gameStartAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioPhaseRef = useRef<AudioPhase>('pre-game');
  const isMusicEnabledRef = useRef<boolean>(true);
  const isSfxEnabledRef = useRef<boolean>(true);
  const isPlayingMusicRef = useRef<boolean>(false);
  const fadeAnimRef = useRef<number | null>(null);
  const hasInteractionListenersRef = useRef<boolean>(false);

  // Cancel any active RAF fade animation
  const cancelFade = useCallback(() => {
    if (fadeAnimRef.current !== null) {
      cancelAnimationFrame(fadeAnimRef.current);
      fadeAnimRef.current = null;
    }
  }, []);

  // Smooth fade-in helper
  const fadeIn = useCallback(
    (audio: HTMLAudioElement, durationMs: number = FADE_IN_DURATION_MS, targetVol: number = LOBBY_VOLUME) => {
      cancelFade();
      const startVol = audio.volume;
      const startTime = performance.now();

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        const currentVol = startVol + (targetVol - startVol) * progress;
        audio.volume = Math.max(0, Math.min(1, currentVol));

        if (progress < 1) {
          fadeAnimRef.current = requestAnimationFrame(step);
        } else {
          audio.volume = targetVol;
          fadeAnimRef.current = null;
        }
      };

      fadeAnimRef.current = requestAnimationFrame(step);
    },
    [cancelFade]
  );

  // Smooth fade-out helper
  const fadeOut = useCallback(
    (
      audio: HTMLAudioElement,
      durationMs: number = FADE_OUT_DURATION_MS,
      onComplete?: () => void
    ) => {
      cancelFade();
      const startVol = audio.volume;
      if (startVol <= 0 || audio.paused) {
        audio.volume = 0;
        audio.pause();
        audio.currentTime = 0;
        isPlayingMusicRef.current = false;
        onComplete?.();
        return;
      }

      const startTime = performance.now();

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        const currentVol = Math.max(0, startVol * (1 - progress));
        audio.volume = Math.max(0, Math.min(1, currentVol));

        if (progress < 1) {
          fadeAnimRef.current = requestAnimationFrame(step);
        } else {
          audio.volume = 0;
          audio.pause();
          audio.currentTime = 0;
          isPlayingMusicRef.current = false;
          fadeAnimRef.current = null;
          onComplete?.();
        }
      };

      fadeAnimRef.current = requestAnimationFrame(step);
    },
    [cancelFade]
  );

  // Remove temporary interaction listeners
  const removeInteractionListeners = useCallback(() => {
    if (!hasInteractionListenersRef.current || typeof window === 'undefined') return;
    INTERACTION_EVENTS.forEach((evt) => {
      window.removeEventListener(evt, handleInteraction, true);
    });
    hasInteractionListenersRef.current = false;
  }, []);

  // Attach temporary interaction listeners for browser autoplay unlock
  const attachInteractionListeners = useCallback(() => {
    if (hasInteractionListenersRef.current || typeof window === 'undefined') return;
    if (!isMusicEnabledRef.current || audioPhaseRef.current !== 'pre-game') return;

    INTERACTION_EVENTS.forEach((evt) => {
      window.addEventListener(evt, handleInteraction, { passive: true, capture: true });
    });
    hasInteractionListenersRef.current = true;
  }, []);

  // Interaction handler for unlocking autoplay
  const handleInteraction = useCallback(() => {
    removeInteractionListeners();

    if (audioPhaseRef.current === 'pre-game' && isMusicEnabledRef.current) {
      const audio = lobbyAudioRef.current;
      if (audio) {
        if (!audio.paused && isPlayingMusicRef.current) return;

        cancelFade();
        audio.volume = 0;
        audio
          .play()
          .then(() => {
            isPlayingMusicRef.current = true;
            fadeIn(audio, FADE_IN_DURATION_MS, LOBBY_VOLUME);
          })
          .catch(() => {
            attachInteractionListeners();
          });
      }
    }
  }, [removeInteractionListeners, cancelFade, fadeIn, attachInteractionListeners]);

  // Primary function to start lobby music with smooth fade-in
  const startLobbyMusicWithFadeIn = useCallback(() => {
    if (audioPhaseRef.current !== 'pre-game' || !isMusicEnabledRef.current) return;
    const audio = lobbyAudioRef.current;
    if (!audio) return;

    // Continue uninterrupted if already playing at target volume
    if (!audio.paused && isPlayingMusicRef.current && Math.abs(audio.volume - LOBBY_VOLUME) < 0.005) {
      return;
    }

    cancelFade();
    audio.volume = 0;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          isPlayingMusicRef.current = true;
          removeInteractionListeners();
          fadeIn(audio, FADE_IN_DURATION_MS, LOBBY_VOLUME);
        })
        .catch(() => {
          // Autoplay blocked by browser policy; wait for first interaction
          isPlayingMusicRef.current = false;
          if (audioPhaseRef.current === 'pre-game' && isMusicEnabledRef.current) {
            attachInteractionListeners();
          }
        });
    }
  }, [cancelFade, fadeIn, removeInteractionListeners, attachInteractionListeners]);

  // Initialize audio elements & load saved settings on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedMusic = localStorage.getItem('muffin_music_enabled');
    const savedSfx = localStorage.getItem('muffin_sfx_enabled');

    const initialMusicEnabled = savedMusic !== 'false';
    const initialSfxEnabled = savedSfx !== 'false';

    setIsMusicEnabled(initialMusicEnabled);
    isMusicEnabledRef.current = initialMusicEnabled;

    setIsSfxEnabled(initialSfxEnabled);
    isSfxEnabledRef.current = initialSfxEnabled;

    const lobbyAudio = new Audio(LOBBY_MUSIC_SRC);
    lobbyAudio.loop = true;
    lobbyAudio.volume = 0;
    lobbyAudio.preload = 'auto';
    lobbyAudioRef.current = lobbyAudio;

    const gameStartAudio = new Audio(GAME_START_SRC);
    gameStartAudio.volume = SFX_VOLUME;
    gameStartAudio.preload = 'auto';
    gameStartAudioRef.current = gameStartAudio;

    // 1. Immediately attempt autoplay on first mount if music is enabled & in pre-game
    if (initialMusicEnabled && audioPhaseRef.current === 'pre-game') {
      startLobbyMusicWithFadeIn();
    }

    return () => {
      removeInteractionListeners();
      cancelFade();
      if (lobbyAudioRef.current) {
        lobbyAudioRef.current.pause();
        lobbyAudioRef.current = null;
      }
      if (gameStartAudioRef.current) {
        gameStartAudioRef.current.pause();
        gameStartAudioRef.current = null;
      }
    };
  }, [startLobbyMusicWithFadeIn, removeInteractionListeners, cancelFade]);

  const playLobbyMusic = useCallback(() => {
    if (audioPhaseRef.current !== 'pre-game' || !isMusicEnabledRef.current) {
      return;
    }
    startLobbyMusicWithFadeIn();
  }, [startLobbyMusicWithFadeIn]);

  const stopLobbyMusic = useCallback(() => {
    removeInteractionListeners();
    cancelFade();
    if (lobbyAudioRef.current) {
      lobbyAudioRef.current.pause();
      lobbyAudioRef.current.currentTime = 0;
    }
    isPlayingMusicRef.current = false;
  }, [removeInteractionListeners, cancelFade]);

  const setAudioPhase = useCallback(
    (newPhase: AudioPhase) => {
      audioPhaseRef.current = newPhase;
      setAudioPhaseState(newPhase);

      if (newPhase === 'gameplay') {
        removeInteractionListeners();
        if (lobbyAudioRef.current) {
          fadeOut(lobbyAudioRef.current, FADE_OUT_DURATION_MS);
        }
      } else if (newPhase === 'pre-game') {
        if (isMusicEnabledRef.current) {
          startLobbyMusicWithFadeIn();
        }
      }
    },
    [removeInteractionListeners, fadeOut, startLobbyMusicWithFadeIn]
  );

  const toggleMusic = useCallback(() => {
    setIsMusicEnabled((prev) => {
      const next = !prev;
      isMusicEnabledRef.current = next;
      localStorage.setItem('muffin_music_enabled', String(next));

      if (!next) {
        removeInteractionListeners();
        cancelFade();
        if (lobbyAudioRef.current) {
          lobbyAudioRef.current.pause();
          isPlayingMusicRef.current = false;
        }
      } else {
        if (audioPhaseRef.current === 'pre-game') {
          startLobbyMusicWithFadeIn();
        }
      }

      return next;
    });
  }, [removeInteractionListeners, cancelFade, startLobbyMusicWithFadeIn]);

  const toggleSfx = useCallback(() => {
    setIsSfxEnabled((prev) => {
      const next = !prev;
      isSfxEnabledRef.current = next;
      localStorage.setItem('muffin_sfx_enabled', String(next));
      return next;
    });
  }, []);

  const playGameStart = useCallback(() => {
    // 1. Mark phase as gameplay
    audioPhaseRef.current = 'gameplay';
    setAudioPhaseState('gameplay');

    // 2. Remove interaction listeners so clicks during gameplay don't trigger lobby music
    removeInteractionListeners();

    // 3. Smoothly fade out lobby music to 0 over 400-600ms (500ms), then pause and reset currentTime to 0
    if (lobbyAudioRef.current) {
      fadeOut(lobbyAudioRef.current, FADE_OUT_DURATION_MS);
    }

    // 4. Play Game-Start.mp3 exactly once if SFX is enabled
    if (isSfxEnabledRef.current && gameStartAudioRef.current) {
      gameStartAudioRef.current.currentTime = 0;
      gameStartAudioRef.current.volume = SFX_VOLUME;
      gameStartAudioRef.current.play().catch(() => {});
    }
  }, [removeInteractionListeners, fadeOut]);

  return (
    <AudioContext.Provider
      value={{
        isMusicEnabled,
        isSfxEnabled,
        audioPhase,
        setAudioPhase,
        toggleMusic,
        toggleSfx,
        playLobbyMusic,
        stopLobbyMusic,
        playGameStart,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio(): AudioContextValue {
  const ctx = useContext(AudioContext);
  if (!ctx) {
    throw new Error('useAudio must be used within AudioProvider');
  }
  return ctx;
}

