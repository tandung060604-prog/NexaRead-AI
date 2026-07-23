"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import {
  getRoomById,
  ReadingRoom,
  READING_ROOMS,
} from "@/config/reading-rooms";
import {
  ImmersivePreferences,
  getDefaultImmersivePreferences,
  hasPersistedImmersivePreferences,
  loadImmersivePreferences,
  ReadingMode,
  saveImmersivePreferences,
} from "@/lib/reading-preferences";

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

type ReadingRoomContextValue = {
  /** Current room configuration. */
  room: ReadingRoom;
  /** All available rooms. */
  rooms: ReadingRoom[];
  /** Select a room by ID. */
  selectRoom: (id: string) => void;
  /** Current immersive preferences. */
  preferences: ImmersivePreferences;
  /** Update one or more preferences. */
  updatePreferences: (patch: Partial<ImmersivePreferences>) => void;
  /** Current reading mode. */
  readingMode: ReadingMode;
  /** Toggle reading mode. */
  setReadingMode: (mode: ReadingMode) => void;
  /** Whether the user prefers reduced motion. */
  reducedMotion: boolean;
  /** Whether the room selector overlay is open. */
  roomSelectorOpen: boolean;
  /** Open or close the room selector. */
  setRoomSelectorOpen: (open: boolean) => void;
};

const ReadingRoomContext = createContext<ReadingRoomContextValue | null>(null);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useReadingRoom(): ReadingRoomContextValue {
  const ctx = useContext(ReadingRoomContext);
  if (!ctx) {
    throw new Error("useReadingRoom must be used within ReadingRoomProvider");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

type ReadingRoomProviderProps = {
  children: ReactNode;
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const subscribeToHydration = () => () => {};
const getHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;

function subscribeToReducedMotion(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getReducedMotionSnapshot() {
  return (
    typeof window !== "undefined"
    && window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

export function ReadingRoomProvider({ children }: ReadingRoomProviderProps) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydratedSnapshot,
  );
  const storedPreferences = useMemo(
    () =>
      hydrated
        ? loadImmersivePreferences()
        : getDefaultImmersivePreferences(),
    [hydrated],
  );
  const [preferenceOverride, setPreferenceOverride] =
    useState<ImmersivePreferences | null>(null);
  const preferences = preferenceOverride ?? storedPreferences;
  const selectorInitiallyOpen = useMemo(
    () => hydrated && !hasPersistedImmersivePreferences(),
    [hydrated],
  );
  const [roomSelectorOverride, setRoomSelectorOverride] =
    useState<boolean | null>(null);
  const roomSelectorOpen =
    roomSelectorOverride ?? selectorInitiallyOpen;
  const setRoomSelectorOpen = useCallback((open: boolean) => {
    setRoomSelectorOverride(open);
  }, []);

  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    () => false,
  );

  // Force minimal-focus when reduced motion is on and current room has motion
  const effectiveRoomId = useMemo(() => {
    if (reducedMotion) {
      const room = getRoomById(preferences.selectedRoom);
      if (room.motionIntensity !== "none") return room.accessibilityFallback;
    }
    return preferences.selectedRoom;
  }, [preferences.selectedRoom, reducedMotion]);

  const room = useMemo(() => getRoomById(effectiveRoomId), [effectiveRoomId]);

  const selectRoom = useCallback(
    (id: string) => {
      const next = saveImmersivePreferences({ selectedRoom: id });
      setPreferenceOverride(next);
      setRoomSelectorOpen(false);
    },
    [setRoomSelectorOpen],
  );

  const updatePreferences = useCallback(
    (patch: Partial<ImmersivePreferences>) => {
      const next = saveImmersivePreferences(patch);
      setPreferenceOverride(next);
    },
    [],
  );

  const setReadingMode = useCallback(
    (mode: ReadingMode) => {
      const next = saveImmersivePreferences({ readingMode: mode });
      setPreferenceOverride(next);
    },
    [],
  );

  const value = useMemo<ReadingRoomContextValue>(
    () => ({
      room,
      rooms: READING_ROOMS,
      selectRoom,
      preferences,
      updatePreferences,
      readingMode: preferences.readingMode,
      setReadingMode,
      reducedMotion,
      roomSelectorOpen,
      setRoomSelectorOpen,
    }),
    [
      room,
      selectRoom,
      preferences,
      updatePreferences,
      setReadingMode,
      reducedMotion,
      roomSelectorOpen,
      setRoomSelectorOpen,
    ],
  );

  // Apply room CSS variables to the reading-room container
  const roomStyle = useMemo(
    () => ({
      "--room-page-color": room.pageColor,
      "--room-page-texture-opacity": String(room.pageTextureOpacity),
      "--room-shadow-color": "rgba(0,0,0,0.12)",
      "--room-overlay-opacity": String(room.overlayOpacity),
      "--room-accent": room.accent,
      "--room-accent-foreground": room.accentForeground,
    } as React.CSSProperties),
    [room],
  );

  return (
    <ReadingRoomContext.Provider value={value}>
      <div className="reading-room" style={roomStyle} suppressHydrationWarning>
        {children}
      </div>
    </ReadingRoomContext.Provider>
  );
}
