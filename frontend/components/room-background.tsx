"use client";

import type { ReadingRoom } from "@/config/reading-rooms";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RoomBackgroundProps = {
  room: ReadingRoom;
};

// ---------------------------------------------------------------------------
// Background class mapping
// ---------------------------------------------------------------------------

const BACKGROUND_CLASSES: Record<string, string> = {
  "cozy-library": "room-bg-cozy-library",
  "rainy-window": "room-bg-rainy-window",
  "lofi-study": "room-bg-lofi-study",
  "lotus-zen": "room-bg-lotus-zen",
  "modern-office": "room-bg-modern-office",
  "night-city": "room-bg-night-city",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders the room background layer behind the reading content.
 * For `solid` backgrounds (Minimal Focus) it renders nothing.
 * For `css-animation` backgrounds it uses the CSS classes defined in globals.css.
 * For `image` backgrounds it renders an img with poster fallback.
 */
export function RoomBackground({ room }: RoomBackgroundProps) {
  if (room.backgroundType === "solid") {
    return null;
  }

  if (room.backgroundType === "css-animation") {
    const bgClass = BACKGROUND_CLASSES[room.backgroundSource] ?? "";
    return (
      <>
        <div
          aria-hidden="true"
          className={`absolute inset-0 ${bgClass}`}
        />
        <div className="room-overlay" />
      </>
    );
  }

  if (room.backgroundType === "image") {
    return (
      <>
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background: room.posterFallback,
            backgroundImage: room.backgroundSource ? `url(${room.backgroundSource})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="room-overlay" />
      </>
    );
  }

  // Canvas or unknown — fallback to poster gradient
  return (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: room.posterFallback }}
      />
      <div className="room-overlay" />
    </>
  );
}
