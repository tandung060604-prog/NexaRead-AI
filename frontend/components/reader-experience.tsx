"use client";

import { useCallback, useEffect } from "react";

import { useAmbientAudio } from "./ambient-audio-provider";
import { useReadingRoom } from "./reading-room-provider";
import { AmbientAudioProvider } from "./ambient-audio-provider";
import { ReadingRoomProvider } from "./reading-room-provider";
import { RoomBackground } from "./room-background";
import { RoomSelector } from "./room-selector";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReaderExperienceProps = {
  children: React.ReactNode;
};

// ---------------------------------------------------------------------------
// Inner wrapper (needs context access)
// ---------------------------------------------------------------------------

function ReaderExperienceInner({ children }: ReaderExperienceProps) {
  const { room, preferences } = useReadingRoom();
  const audio = useAmbientAudio();

  // Mark user interaction on first click/keypress for autoplay compliance
  useEffect(() => {
    function handleInteraction() {
      audio.markInteraction();
    }

    window.addEventListener("click", handleInteraction, { once: true });
    window.addEventListener("keydown", handleInteraction, { once: true });
    window.addEventListener("touchstart", handleInteraction, { once: true });

    return () => {
      window.removeEventListener("click", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
    };
  }, [audio]);

  const focusModeClass = preferences.focusMode ? "immersive-focus-mode" : "";

  return (
    <div className={`relative min-h-screen ${focusModeClass}`}>
      {/* Layer 1: Room Background */}
      <div className="fixed inset-0 -z-10">
        <RoomBackground room={room} />
      </div>

      {/* Layer 2: Content (children = DocumentReader) */}
      <div className="relative z-10">
        {children}
      </div>

      {/* Room Selector Overlay */}
      <RoomSelector />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component (provides contexts)
// ---------------------------------------------------------------------------

/**
 * Top-level immersive reading shell.
 *
 * Wraps the existing DocumentReader with:
 * - ReadingRoomProvider (room selection, preferences)
 * - AmbientAudioProvider (audio engine, page-turn sound)
 * - RoomBackground (animated/static per room)
 * - RoomSelector (overlay for room picking)
 *
 * The children (DocumentReader) are rendered inside this environment
 * without any changes to their internal logic.
 */
export function ReaderExperience({ children }: ReaderExperienceProps) {
  return (
    <ReadingRoomProvider>
      <ReaderExperienceAudioBridge>
        {children}
      </ReaderExperienceAudioBridge>
    </ReadingRoomProvider>
  );
}

/**
 * Bridge component that connects ReadingRoomProvider to AmbientAudioProvider.
 * Needs to be a separate component because it uses the room context.
 */
function ReaderExperienceAudioBridge({ children }: ReaderExperienceProps) {
  const { room, preferences, updatePreferences } = useReadingRoom();

  const handleVolumeChange = useCallback(
    (masterVolume: number) => {
      updatePreferences({ masterVolume });
    },
    [updatePreferences],
  );

  const handleMuteChange = useCallback(
    (muteAll: boolean) => {
      updatePreferences({ muteAll });
    },
    [updatePreferences],
  );

  return (
    <AmbientAudioProvider
      ambientEnabled={preferences.ambientEnabled}
      masterVolume={preferences.masterVolume}
      muted={preferences.muteAll}
      onMuteChange={handleMuteChange}
      onVolumeChange={handleVolumeChange}
      pageTurnEnabled={preferences.pageTurnSoundEnabled}
      pageTurnVolume={preferences.pageTurnVolume}
      room={room}
    >
      <ReaderExperienceInner>{children}</ReaderExperienceInner>
    </AmbientAudioProvider>
  );
}
