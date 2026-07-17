/**
 * Reading preferences persistence layer.
 *
 * Provides a unified API that stores preferences in localStorage today and
 * can be swapped to a backend API later without changing any consumer code.
 *
 * All keys are namespaced under `nexaread:` to avoid collisions.
 */

const NAMESPACE = "nexaread:immersive";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReadingMode = "scroll" | "book";

export type ImmersivePreferences = {
  /** Currently selected reading room ID. */
  selectedRoom: string;
  /** Room IDs the user has starred. */
  favoriteRooms: string[];
  /** Active reading mode. */
  readingMode: ReadingMode;
  /** Whether page-turn animation is enabled. */
  pageTurnEnabled: boolean;
  /** Whether page-turn sound plays on turn. */
  pageTurnSoundEnabled: boolean;
  /** Whether ambient audio is enabled. */
  ambientEnabled: boolean;
  /** Master volume 0–1. */
  masterVolume: number;
  /** Ambient layer volume 0–1. */
  ambientVolume: number;
  /** Page-turn sound volume 0–1. */
  pageTurnVolume: number;
  /** Whether all audio is muted. */
  muteAll: boolean;
  /** Override motion level: "auto" respects the room default. */
  motionLevel: "auto" | "none" | "low" | "medium";
  /** Whether focus mode is active. */
  focusMode: boolean;
  /** Typography preset ID override, or null for room default. */
  typographyPreset: string | null;
  /** Per-layer volume overrides (layerId → 0–1). */
  layerVolumes: Record<string, number>;
  /** Auto-select room based on time of day. */
  autoRoomByTime: boolean;
};

const DEFAULT_PREFERENCES: ImmersivePreferences = {
  selectedRoom: "minimal-focus",
  favoriteRooms: [],
  readingMode: "scroll",
  pageTurnEnabled: true,
  pageTurnSoundEnabled: true,
  ambientEnabled: true,
  masterVolume: 0.7,
  ambientVolume: 0.5,
  pageTurnVolume: 0.6,
  muteAll: false,
  motionLevel: "auto",
  focusMode: false,
  typographyPreset: null,
  layerVolumes: {},
  autoRoomByTime: false,
};

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(`${NAMESPACE}:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${NAMESPACE}:${key}`, JSON.stringify(value));
  } catch {
    // Storage full or unavailable — silently degrade.
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load the full immersive preferences object, merging defaults for any
 * keys that have never been persisted.
 */
export function loadImmersivePreferences(): ImmersivePreferences {
  const saved = readJSON<Partial<ImmersivePreferences>>("preferences", {});
  return { ...DEFAULT_PREFERENCES, ...saved };
}

/** Persist a partial update, merging with existing preferences. */
export function saveImmersivePreferences(
  patch: Partial<ImmersivePreferences>,
): ImmersivePreferences {
  const current = loadImmersivePreferences();
  const next = { ...current, ...patch };
  writeJSON("preferences", next);
  return next;
}

/** Reset all immersive preferences to defaults. */
export function resetImmersivePreferences(): ImmersivePreferences {
  writeJSON("preferences", DEFAULT_PREFERENCES);
  return { ...DEFAULT_PREFERENCES };
}

/** Get a single preference value. */
export function getPreference<K extends keyof ImmersivePreferences>(
  key: K,
): ImmersivePreferences[K] {
  return loadImmersivePreferences()[key];
}

/** Set a single preference value. */
export function setPreference<K extends keyof ImmersivePreferences>(
  key: K,
  value: ImmersivePreferences[K],
): void {
  saveImmersivePreferences({ [key]: value });
}
