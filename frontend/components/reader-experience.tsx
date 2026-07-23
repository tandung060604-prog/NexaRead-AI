"use client";

import { Armchair } from "lucide-react";

import { useI18n } from "@/components/i18n-provider";

import { AmbientAudioProvider } from "./ambient-audio-provider";
import { AudioMixer } from "./audio-mixer";
import { ReadingRoomProvider, useReadingRoom } from "./reading-room-provider";
import { RoomSelector } from "./room-selector";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReaderExperienceProps = {
  children: React.ReactNode;
};

// ---------------------------------------------------------------------------
// Inner wrapper
// ---------------------------------------------------------------------------

function ReaderExperienceInner({ children }: ReaderExperienceProps) {
  const { t } = useI18n();
  const {
    preferences,
    room,
    setRoomSelectorOpen,
    updatePreferences,
  } = useReadingRoom();
  return (
    <AmbientAudioProvider
      ambientEnabled={preferences.ambientEnabled}
      masterVolume={preferences.masterVolume}
      muted={preferences.muteAll}
      onMuteChange={(muted) => updatePreferences({ muteAll: muted })}
      onVolumeChange={(masterVolume) => updatePreferences({ masterVolume })}
      pageTurnEnabled={preferences.pageTurnSoundEnabled}
      pageTurnVolume={preferences.pageTurnVolume}
      room={room}
    >
      <div className="relative min-h-screen bg-[var(--background)]">
        <div className="relative z-10 pb-20">
          {children}
        </div>
        <div className="fixed bottom-4 left-4 z-30 flex items-center gap-2">
          <button
            aria-label={t("reader", "room.openSelector")}
            className="grid size-11 place-items-center rounded-lg border border-[var(--reader-border)] bg-[var(--reader-surface)] text-[var(--reader-foreground)] shadow-lg"
            onClick={() => setRoomSelectorOpen(true)}
            title={t("reader", "room.openSelector")}
            type="button"
          >
            <Armchair aria-hidden="true" size={19} />
          </button>
          <AudioMixer />
        </div>
        <RoomSelector />
      </div>
    </AmbientAudioProvider>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function ReaderExperience({ children }: ReaderExperienceProps) {
  return (
    <ReadingRoomProvider>
      <ReaderExperienceInner>{children}</ReaderExperienceInner>
    </ReadingRoomProvider>
  );
}
