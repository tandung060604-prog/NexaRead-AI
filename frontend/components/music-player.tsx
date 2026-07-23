"use client";

import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/components/i18n-provider";

const PLAYLIST = [
  { id: "midnight-study", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
  { id: "coffee-shop", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
  { id: "rainy-day", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" },
  { id: "quiet-library", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3" },
  { id: "night-drive", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3" },
];

export function MusicPlayer() {
  const { t } = useI18n();
  const [currentTrack, setCurrentTrack] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.src = PLAYLIST[currentTrack].src;
    audio.loop = true;
    audio.volume = 0.5;
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [currentTrack]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.play().catch(() => {
        // Autoplay policy blocked
        setIsPlaying(false);
      });
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, currentTrack]);

  const togglePlay = () => setIsPlaying(!isPlaying);

  const nextTrack = () => {
    setCurrentTrack((prev) => (prev + 1) % PLAYLIST.length);
    setIsPlaying(true);
  };

  const prevTrack = () => {
    setCurrentTrack((prev) => (prev - 1 + PLAYLIST.length) % PLAYLIST.length);
    setIsPlaying(true);
  };

  const toggleMute = () => setIsMuted(!isMuted);

  return (
    <div className="fixed bottom-6 left-6 z-50 group flex items-center gap-3">
      {/* The Spinning Disc */}
      <button
        aria-label={isPlaying ? t("reader", "audio.pause") : t("reader", "audio.play")}
        onClick={togglePlay}
        className={`relative flex size-14 items-center justify-center rounded-full bg-neutral-900 border-[3px] border-neutral-800 shadow-xl transition-transform hover:scale-105 ${isPlaying ? 'animate-spin-slow' : ''}`}
        style={{ animationDuration: '4s' }}
        title={isPlaying ? t("reader", "audio.pause") : t("reader", "audio.play")}
      >
        {/* Vinyl Grooves */}
        <div className="absolute inset-1 rounded-full border border-neutral-700/50" />
        <div className="absolute inset-2 rounded-full border border-neutral-800/80" />
        <div className="absolute inset-3 rounded-full border border-neutral-700/30" />

        {/* Label and Hole */}
        <div className="size-5 rounded-full bg-indigo-500 flex items-center justify-center z-10 border border-neutral-800">
          <div className="size-1.5 rounded-full bg-neutral-900" />
        </div>
      </button>

      {/* Expandable Controls Panel */}
      <div className="flex items-center gap-3 overflow-hidden rounded-full bg-[var(--surface-muted)]/90 backdrop-blur-md border border-[var(--reader-border)] shadow-lg transition-all duration-300 w-0 opacity-0 group-hover:w-auto group-hover:opacity-100 group-hover:px-4 group-hover:py-2">
        <button aria-label={t("reader", "audio.previous")} onClick={prevTrack} className="text-[var(--reader-muted)] hover:text-[var(--reader-foreground)] p-1">
          <SkipBack size={16} fill="currentColor" />
        </button>

        <button aria-label={isPlaying ? t("reader", "audio.pause") : t("reader", "audio.play")} onClick={togglePlay} className="text-[var(--reader-foreground)] p-1">
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>

        <button aria-label={t("reader", "audio.next")} onClick={nextTrack} className="text-[var(--reader-muted)] hover:text-[var(--reader-foreground)] p-1">
          <SkipForward size={16} fill="currentColor" />
        </button>

        <div className="h-4 w-px bg-[var(--reader-border)] mx-1" />

        <div className="flex flex-col min-w-[100px]">
          <span className="text-[10px] font-bold text-[var(--reader-foreground)] truncate uppercase tracking-wider">
            {t("reader", `audio.tracks.${PLAYLIST[currentTrack].id}`)}
          </span>
        </div>

        <div className="h-4 w-px bg-[var(--reader-border)] mx-1" />

        <button aria-label={isMuted ? t("reader", "audio.unmute") : t("reader", "audio.mute")} onClick={toggleMute} className="text-[var(--reader-muted)] hover:text-[var(--reader-foreground)] p-1">
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <input
          aria-label={t("reader", "audio.volume")}
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isMuted ? 0 : volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-24 h-1 bg-[var(--reader-border)] rounded-full appearance-none cursor-pointer accent-[var(--reader-foreground)]"
        />
      </div>
    </div>
  );
}
