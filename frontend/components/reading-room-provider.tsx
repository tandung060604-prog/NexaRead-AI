"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  DEFAULT_ROOM_ID,
  getRoomById,
  ReadingRoom,
  READING_ROOMS,
} from "@/config/reading-rooms";
import {
  ImmersivePreferences,
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

export function ReadingRoomProvider({ children }: ReadingRoomProviderProps) {
  const [preferences, setPreferences] = useState<ImmersivePreferences>(() =>
    loadImmersivePreferences(),
  );
  const [roomSelectorOpen, setRoomSelectorOpen] = useState(
    () => loadImmersivePreferences().selectedRoom === DEFAULT_ROOM_ID,
  );

  // Detect reduced motion preference
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

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
      setPreferences(next);
      setRoomSelectorOpen(false);
    },
    [],
  );

  const updatePreferences = useCallback(
    (patch: Partial<ImmersivePreferences>) => {
      const next = saveImmersivePreferences(patch);
      setPreferences(next);
    },
    [],
  );

  const setReadingMode = useCallback(
    (mode: ReadingMode) => {
      const next = saveImmersivePreferences({ readingMode: mode });
      setPreferences(next);
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
    [room, selectRoom, preferences, updatePreferences, setReadingMode, reducedMotion, roomSelectorOpen],
  );

  // Apply room CSS variables to the reading-room container
  const roomStyle = useMemo(
    () => ({
      "--room-page-color": room.pageColor,
      "--room-page-texture-opacity": String(room.pageTextureOpacity),
      "--room-shadow-color": "rgba(0,0,0,0.12)",
      "--room-overlay-opacity": String(room.overlayOpacity),
      "--room-accent": room.accent,
    } as React.CSSProperties),
    [room],
  );

  return (
    <ReadingRoomContext.Provider value={value}>
      <div className="reading-room" style={roomStyle}>
        {children}
      </div>
    </ReadingRoomContext.Provider>
  );
}
