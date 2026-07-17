"use client";

import { Shuffle, Star, X } from "lucide-react";

import type { ReadingRoom } from "@/config/reading-rooms";

import { useReadingRoom } from "./reading-room-provider";

// ---------------------------------------------------------------------------
// Room Card
// ---------------------------------------------------------------------------

function RoomCard({
  room,
  isSelected,
  isFavorite,
  onSelect,
  onToggleFavorite,
}: {
  room: ReadingRoom;
  isSelected: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  // Background class for preview
  const bgClasses: Record<string, string> = {
    "cozy-library": "room-bg-cozy-library",
    "rainy-window": "room-bg-rainy-window",
    "lofi-study": "room-bg-lofi-study",
    "lotus-zen": "room-bg-lotus-zen",
    "modern-office": "room-bg-modern-office",
    "night-city": "room-bg-night-city",
  };

  const bgClass = bgClasses[room.backgroundSource] ?? "";
  const isMinimal = room.id === "minimal-focus";

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border-2 transition-all ${
        isSelected
          ? "border-[var(--room-accent,var(--reader-accent))] shadow-lg"
          : "border-[var(--reader-border)] hover:border-[var(--reader-muted)] hover:shadow-md"
      }`}
    >
      {/* Preview background */}
      <div className="relative h-28 overflow-hidden">
        {isMinimal ? (
          <div className="flex h-full items-center justify-center bg-[var(--reader-surface)]">
            <span className="text-2xl">⚡</span>
          </div>
        ) : (
          <div className={`absolute inset-0 ${bgClass}`} style={!bgClass ? { background: room.posterFallback } : undefined} />
        )}

        {/* Overlay for text readability */}
        {!isMinimal && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        )}

        {/* Selected indicator */}
        {isSelected && (
          <div className="absolute right-2 top-2 rounded-full bg-[var(--room-accent,var(--reader-accent))] px-2 py-0.5 text-[10px] font-bold text-white">
            Active
          </div>
        )}

        {/* Favorite star */}
        <button
          aria-label={isFavorite ? `Unpin ${room.name}` : `Pin ${room.name}`}
          className="absolute left-2 top-2 grid size-7 place-items-center rounded-full bg-black/30 text-white opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite();
          }}
          type="button"
        >
          <Star fill={isFavorite ? "currentColor" : "none"} size={14} />
        </button>

        {/* Sound indicator */}
        {room.audioLayers.length > 0 && (
          <div className="absolute bottom-2 right-2 text-xs text-white/80">
            🔊 {room.audioLayers.map((l) => l.label).join(", ")}
          </div>
        )}

        {/* Motion indicator */}
        {room.motionIntensity !== "none" && (
          <div className="absolute bottom-2 left-2 text-xs text-white/70">
            ◐ {room.motionIntensity}
          </div>
        )}
      </div>

      {/* Card info */}
      <div className="p-3">
        <h3 className="font-semibold text-sm">{room.name}</h3>
        <p className="mt-1 text-xs text-[var(--reader-muted)] line-clamp-2">
          {room.description}
        </p>

        <button
          className={`mt-3 w-full rounded-lg py-2 text-xs font-semibold transition-colors ${
            isSelected
              ? "bg-[var(--reader-surface-muted)] text-[var(--reader-muted)]"
              : "bg-[var(--room-accent,var(--reader-accent))] text-white hover:opacity-90"
          }`}
          onClick={onSelect}
          type="button"
        >
          {isSelected ? "Current Room" : "Enter Room"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Room Selector
// ---------------------------------------------------------------------------

export function RoomSelector() {
  const {
    room: currentRoom,
    rooms,
    selectRoom,
    preferences,
    updatePreferences,
    roomSelectorOpen,
    setRoomSelectorOpen,
  } = useReadingRoom();

  if (!roomSelectorOpen) return null;

  const favoriteRooms = new Set(preferences.favoriteRooms);

  function toggleFavorite(roomId: string) {
    const favorites = new Set(preferences.favoriteRooms);
    if (favorites.has(roomId)) {
      favorites.delete(roomId);
    } else {
      favorites.add(roomId);
    }
    updatePreferences({ favoriteRooms: [...favorites] });
  }

  function selectRandom() {
    const candidates = rooms.filter((r) => r.id !== currentRoom.id);
    if (candidates.length === 0) return;
    const random = candidates[Math.floor(Math.random() * candidates.length)];
    selectRoom(random.id);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-label="Choose your reading space"
      aria-modal="true"
    >
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-[var(--reader-surface)] p-6 shadow-2xl sm:p-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold sm:text-2xl">
              Choose Your Reading Space
            </h2>
            <p className="mt-1 text-sm text-[var(--reader-muted)]">
              Select an atmosphere that matches your mood
            </p>
          </div>
          <button
            aria-label="Close room selector"
            className="grid size-10 place-items-center rounded-lg border border-[var(--reader-border)] transition-colors hover:bg-[var(--reader-surface-muted)]"
            onClick={() => setRoomSelectorOpen(false)}
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        {/* Room grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {rooms.map((room) => (
            <RoomCard
              isFavorite={favoriteRooms.has(room.id)}
              isSelected={currentRoom.id === room.id}
              key={room.id}
              onSelect={() => selectRoom(room.id)}
              onToggleFavorite={() => toggleFavorite(room.id)}
              room={room}
            />
          ))}
        </div>

        {/* Footer actions */}
        <div className="mt-6 flex items-center justify-center gap-4">
          <button
            className="flex items-center gap-2 rounded-lg border border-[var(--reader-border)] px-4 py-2 text-sm font-semibold transition-colors hover:bg-[var(--reader-surface-muted)]"
            onClick={selectRandom}
            type="button"
          >
            <Shuffle size={16} />
            Random Room
          </button>
          <button
            className="rounded-lg px-4 py-2 text-sm font-semibold text-[var(--reader-muted)] transition-colors hover:text-[var(--reader-foreground)]"
            onClick={() => setRoomSelectorOpen(false)}
            type="button"
          >
            Skip →
          </button>
        </div>
      </div>
    </div>
  );
}
