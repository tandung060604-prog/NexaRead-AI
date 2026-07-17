"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";

import type { AudioLayer, ReadingRoom } from "@/config/reading-rooms";
import { AudioEngine } from "@/lib/audio-engine";
import { PageTurnSound } from "@/lib/page-turn-sound";

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

type AmbientAudioContextValue = {
  /** Mark user interaction for autoplay compliance. */
  markInteraction: () => void;
  /** Set master volume (0–1). */
  setMasterVolume: (volume: number) => void;
  /** Get master volume. */
  masterVolume: number;
  /** Mute all audio. */
  setMuted: (muted: boolean) => void;
  /** Whether all audio is muted. */
  isMuted: boolean;
  /** Set a specific layer's volume (0–1). */
  setLayerVolume: (layerId: string, volume: number) => void;
  /** Get a specific layer's volume. */
  getLayerVolume: (layerId: string) => number;
  /** Play page turn sound. */
  playPageTurn: () => void;
  /** Set page-turn sound volume (0–1). */
  setPageTurnVolume: (volume: number) => void;
  /** Enable/disable page-turn sound. */
  setPageTurnEnabled: (enabled: boolean) => void;
  /** Available audio layers for the current room. */
  availableLayers: AudioLayer[];
};

const AmbientAudioContext = createContext<AmbientAudioContextValue | null>(null);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAmbientAudio(): AmbientAudioContextValue {
  const ctx = useContext(AmbientAudioContext);
  if (!ctx) {
    throw new Error("useAmbientAudio must be used within AmbientAudioProvider");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

type AmbientAudioProviderProps = {
  room: ReadingRoom;
  masterVolume: number;
  muted: boolean;
  ambientEnabled: boolean;
  pageTurnEnabled: boolean;
  pageTurnVolume: number;
  onVolumeChange: (masterVolume: number) => void;
  onMuteChange: (muted: boolean) => void;
  children: ReactNode;
};

export function AmbientAudioProvider({
  room,
  masterVolume,
  muted,
  ambientEnabled,
  pageTurnEnabled,
  pageTurnVolume,
  onVolumeChange,
  onMuteChange,
  children,
}: AmbientAudioProviderProps) {
  const engineRef = useRef<AudioEngine | null>(null);
  const pageTurnRef = useRef<PageTurnSound | null>(null);
  const previousRoomRef = useRef<string>("");

  // Initialize on mount
  useEffect(() => {
    engineRef.current = new AudioEngine();
    pageTurnRef.current = new PageTurnSound();

    return () => {
      engineRef.current?.destroy();
      pageTurnRef.current?.destroy();
    };
  }, []);

  // Sync master volume
  useEffect(() => {
    engineRef.current?.setMasterVolume(masterVolume);
  }, [masterVolume]);

  // Sync mute state
  useEffect(() => {
    engineRef.current?.setMuted(muted);
    pageTurnRef.current?.setMuted(muted);
  }, [muted]);

  // Sync page-turn settings
  useEffect(() => {
    pageTurnRef.current?.setEnabled(pageTurnEnabled);
    pageTurnRef.current?.setVolume(pageTurnVolume);
  }, [pageTurnEnabled, pageTurnVolume]);

  // Handle room changes — crossfade audio layers
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !ambientEnabled) return;

    if (previousRoomRef.current !== room.id) {
      // Crossfade out old layers, then set new ones
      void engine.crossfadeOut().then(() => {
        for (const layer of room.audioLayers) {
          void engine.setLayer(layer.id, layer.src, layer.defaultVolume, layer.loop);
        }
      });
      previousRoomRef.current = room.id;
    }
  }, [room, ambientEnabled]);

  // Handle visibility change
  useEffect(() => {
    function handleVisibility() {
      engineRef.current?.handleVisibilityChange(document.hidden);
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const markInteraction = useCallback(() => {
    engineRef.current?.markInteraction();
    pageTurnRef.current?.markInteraction();
    void engineRef.current?.resumeAfterInteraction();
  }, []);

  const setMasterVolume = useCallback(
    (volume: number) => {
      engineRef.current?.setMasterVolume(volume);
      onVolumeChange(volume);
    },
    [onVolumeChange],
  );

  const setMuted = useCallback(
    (muteState: boolean) => {
      engineRef.current?.setMuted(muteState);
      pageTurnRef.current?.setMuted(muteState);
      onMuteChange(muteState);
    },
    [onMuteChange],
  );

  const setLayerVolume = useCallback((layerId: string, volume: number) => {
    engineRef.current?.setLayerVolume(layerId, volume);
  }, []);

  const getLayerVolume = useCallback((layerId: string) => {
    return engineRef.current?.getLayerVolume(layerId) ?? 0;
  }, []);

  const playPageTurn = useCallback(() => {
    pageTurnRef.current?.play();
  }, []);

  const setPageTurnVolume = useCallback((volume: number) => {
    pageTurnRef.current?.setVolume(volume);
  }, []);

  const setPageTurnEnabled = useCallback((enabled: boolean) => {
    pageTurnRef.current?.setEnabled(enabled);
  }, []);

  const value = useMemo<AmbientAudioContextValue>(
    () => ({
      markInteraction,
      setMasterVolume,
      masterVolume,
      setMuted,
      isMuted: muted,
      setLayerVolume,
      getLayerVolume,
      playPageTurn,
      setPageTurnVolume,
      setPageTurnEnabled,
      availableLayers: room.audioLayers,
    }),
    [
      markInteraction,
      setMasterVolume,
      masterVolume,
      setMuted,
      muted,
      setLayerVolume,
      getLayerVolume,
      playPageTurn,
      setPageTurnVolume,
      setPageTurnEnabled,
      room.audioLayers,
    ],
  );

  return (
    <AmbientAudioContext.Provider value={value}>
      {children}
    </AmbientAudioContext.Provider>
  );
}
