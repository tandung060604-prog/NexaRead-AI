/**
 * Reading room configuration system.
 *
 * Each room is a self-contained preset that defines the visual and auditory
 * atmosphere of the reading experience.  The rendering layer consumes these
 * configs without any room-specific branching — adding a new room only
 * requires a new entry in `READING_ROOMS`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RoomTheme = "light" | "dark" | "sepia";
export type MotionIntensity = "none" | "low" | "medium";
export type BackgroundType = "solid" | "image" | "css-animation" | "canvas";

export type AudioLayer = {
  /** Unique key used for the volume slider and preference persistence. */
  id: string;
  /** Human-readable label for the mixer UI. */
  label: string;
  /**
   * Path relative to `/public/audio/` or an absolute URL.
   * Empty string means the layer is declared but has no source yet
   * (placeholder for future asset).
   */
  src: string;
  /** Default volume 0–1.  Stored per-room so each room sounds balanced. */
  defaultVolume: number;
  /** When true the layer loops seamlessly. */
  loop: boolean;
};

export type ReadingRoom = {
  id: string;
  name: string;
  description: string;

  // Visual
  backgroundType: BackgroundType;
  /** CSS gradient, image URL, or canvas-animation identifier. */
  backgroundSource: string;
  /** Static fallback shown while the primary background loads or on error. */
  posterFallback: string;
  theme: RoomTheme;
  /** CSS accent color used for buttons and highlights inside this room. */
  accent: string;
  /** Text color that reaches WCAG AA on top of the room accent. */
  accentForeground: string;
  /** Opacity 0–1 of the dark overlay between background and content. */
  overlayOpacity: number;
  motionIntensity: MotionIntensity;

  // Page surface
  /** CSS color for the page background. */
  pageColor: string;
  /** Opacity 0–1 of the subtle paper texture on the page. */
  pageTextureOpacity: number;

  // Audio
  audioLayers: AudioLayer[];
  /** Path to page-turn sound override, or empty to use the global default. */
  pageTurnAudio: string;

  // Typography
  /** ID of the default typography preset for this room. */
  typographyPreset: string;

  // Metadata
  /** Preview image for the room-selector card. */
  previewImage: string;
  /** List of asset paths that must be preloaded before entering the room. */
  requiredAssets: string[];
  /** Fallback room ID to use when this room's assets fail to load. */
  accessibilityFallback: string;
};

// ---------------------------------------------------------------------------
// Room Definitions
// ---------------------------------------------------------------------------

export const READING_ROOMS: ReadingRoom[] = [
  // ── Minimal Focus ───────────────────────────────────────────────────────
  {
    id: "minimal-focus",
    name: "Minimal Focus",
    description: "Absolute focus — no distractions, maximum performance.",
    backgroundType: "solid",
    backgroundSource: "var(--reader-background)",
    posterFallback: "var(--reader-background)",
    theme: "light",
    accent: "#116b4b",
    accentForeground: "#ffffff",
    overlayOpacity: 0,
    motionIntensity: "none",
    pageColor: "#ffffff",
    pageTextureOpacity: 0,
    audioLayers: [],
    pageTurnAudio: "",
    typographyPreset: "modern-sans",
    previewImage: "",
    requiredAssets: [],
    accessibilityFallback: "minimal-focus",
  },

  // ── Cozy Library ────────────────────────────────────────────────────────
  {
    id: "cozy-library",
    name: "Cozy Library",
    description: "Warm wooden shelves, candlelight, and a crackling fireplace.",
    backgroundType: "css-animation",
    backgroundSource: "cozy-library",
    posterFallback: "linear-gradient(135deg, #1a1410 0%, #2a2218 50%, #1e1812 100%)",
    theme: "sepia",
    accent: "#d4a574",
    accentForeground: "#111111",
    overlayOpacity: 0.55,
    motionIntensity: "low",
    pageColor: "#faf5ec",
    pageTextureOpacity: 0.04,
    audioLayers: [
      {
        id: "fireplace",
        label: "Fireplace",
        src: "/audio/fireplace-loop.mp3",
        defaultVolume: 0.25,
        loop: true,
      },
    ],
    pageTurnAudio: "",
    typographyPreset: "classic-book",
    previewImage: "",
    requiredAssets: [],
    accessibilityFallback: "minimal-focus",
  },

  // ── Rainy Window ────────────────────────────────────────────────────────
  {
    id: "rainy-window",
    name: "Rainy Window",
    description: "Rain on glass, city lights, deep concentration.",
    backgroundType: "css-animation",
    backgroundSource: "rainy-window",
    posterFallback: "linear-gradient(180deg, #2c3e50 0%, #1a252f 60%, #0d1b2a 100%)",
    theme: "dark",
    accent: "#7eb8da",
    accentForeground: "#111111",
    overlayOpacity: 0.5,
    motionIntensity: "low",
    pageColor: "#f5f5f5",
    pageTextureOpacity: 0.02,
    audioLayers: [
      {
        id: "rain",
        label: "Rain",
        src: "/audio/rain-loop.mp3",
        defaultVolume: 0.35,
        loop: true,
      },
    ],
    pageTurnAudio: "",
    typographyPreset: "modern-sans",
    previewImage: "",
    requiredAssets: [],
    accessibilityFallback: "minimal-focus",
  },

  // ── Lofi Study Room ─────────────────────────────────────────────────────
  {
    id: "lofi-study",
    name: "Lofi Study Room",
    description: "Desk lamp, warm coffee, and chill instrumental beats.",
    backgroundType: "css-animation",
    backgroundSource: "lofi-study",
    posterFallback: "linear-gradient(135deg, #2d1b4e 0%, #1a1230 50%, #0d0a1a 100%)",
    theme: "dark",
    accent: "#e8a87c",
    accentForeground: "#111111",
    overlayOpacity: 0.5,
    motionIntensity: "low",
    pageColor: "#faf8f4",
    pageTextureOpacity: 0.03,
    audioLayers: [
      {
        id: "lofi",
        label: "Lofi Music",
        src: "/audio/lofi-loop.mp3",
        defaultVolume: 0.2,
        loop: true,
      },
      {
        id: "cafe",
        label: "Café",
        src: "/audio/cafe-loop.mp3",
        defaultVolume: 0.1,
        loop: true,
      },
    ],
    pageTurnAudio: "",
    typographyPreset: "modern-sans",
    previewImage: "",
    requiredAssets: [],
    accessibilityFallback: "minimal-focus",
  },

  // ── Lotus Zen ───────────────────────────────────────────────────────────
  {
    id: "lotus-zen",
    name: "Lotus Zen",
    description: "Morning mist, gentle water, and meditative silence.",
    backgroundType: "css-animation",
    backgroundSource: "lotus-zen",
    posterFallback: "linear-gradient(180deg, #e8f5f0 0%, #d0ebe4 50%, #b8e0d8 100%)",
    theme: "light",
    accent: "#5ba68a",
    accentForeground: "#111111",
    overlayOpacity: 0.3,
    motionIntensity: "low",
    pageColor: "#fafefa",
    pageTextureOpacity: 0.02,
    audioLayers: [
      {
        id: "water",
        label: "Water",
        src: "/audio/water-loop.mp3",
        defaultVolume: 0.25,
        loop: true,
      },
    ],
    pageTurnAudio: "",
    typographyPreset: "comfort-reading",
    previewImage: "",
    requiredAssets: [],
    accessibilityFallback: "minimal-focus",
  },

  // ── Modern Office ───────────────────────────────────────────────────────
  {
    id: "modern-office",
    name: "Modern Office",
    description: "Glass walls, city skyline, and productive ambience.",
    backgroundType: "css-animation",
    backgroundSource: "modern-office",
    posterFallback: "linear-gradient(135deg, #1e293b 0%, #334155 50%, #1e293b 100%)",
    theme: "light",
    accent: "#3b82f6",
    accentForeground: "#111111",
    overlayOpacity: 0.45,
    motionIntensity: "low",
    pageColor: "#ffffff",
    pageTextureOpacity: 0,
    audioLayers: [
      {
        id: "office",
        label: "Office",
        src: "/audio/office-loop.mp3",
        defaultVolume: 0.15,
        loop: true,
      },
    ],
    pageTurnAudio: "",
    typographyPreset: "technical",
    previewImage: "",
    requiredAssets: [],
    accessibilityFallback: "minimal-focus",
  },

  // ── Night City ──────────────────────────────────────────────────────────
  {
    id: "night-city",
    name: "Night City",
    description: "Neon lights, high-rise view, and ambient electronics.",
    backgroundType: "css-animation",
    backgroundSource: "night-city",
    posterFallback: "linear-gradient(180deg, #0a0a1a 0%, #141428 50%, #1e1e3c 100%)",
    theme: "dark",
    accent: "#a78bfa",
    accentForeground: "#111111",
    overlayOpacity: 0.5,
    motionIntensity: "low",
    pageColor: "#f0f0f0",
    pageTextureOpacity: 0.02,
    audioLayers: [
      {
        id: "city",
        label: "City",
        src: "/audio/city-night-loop.mp3",
        defaultVolume: 0.2,
        loop: true,
      },
    ],
    pageTurnAudio: "",
    typographyPreset: "modern-sans",
    previewImage: "",
    requiredAssets: [],
    accessibilityFallback: "minimal-focus",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const roomIndex = new Map(READING_ROOMS.map((room) => [room.id, room]));

/** Look up a room by ID. Returns `minimal-focus` when the ID is unknown. */
export function getRoomById(id: string): ReadingRoom {
  return roomIndex.get(id) ?? roomIndex.get("minimal-focus")!;
}

/** The default room for first-time users. */
export const DEFAULT_ROOM_ID = "minimal-focus";

/** The three MVP rooms shipped in Phase 4. */
export const MVP_ROOM_IDS = ["minimal-focus", "cozy-library", "rainy-window"] as const;
