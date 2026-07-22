"use client";

import { useCallback, useEffect } from "react";
import { MusicPlayer } from "./music-player";
import { ReadingRoomProvider } from "./reading-room-provider";

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
  return (
    <div className={`relative min-h-screen bg-[var(--background)]`}>
      {/* Layer 2: Content (children = DocumentReader) */}
      <div className="relative z-10 pb-20">
        {children}
      </div>

      {/* Bottom Music Player */}
      <MusicPlayer />
    </div>
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
