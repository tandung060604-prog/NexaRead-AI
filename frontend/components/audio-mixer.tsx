"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useState } from "react";

import { useI18n } from "@/components/i18n-provider";

import { useAmbientAudio } from "./ambient-audio-provider";
import { useReadingRoom } from "./reading-room-provider";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AudioMixer() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { room, preferences, updatePreferences } = useReadingRoom();
  const audio = useAmbientAudio();

  return (
    <div className="relative">
      {/* Toggle button */}
      <button
        aria-label={
          audio.isMuted ? t("reader", "audio.unmuteAll") : t("reader", "audio.mixer")
        }
        className="grid size-10 place-items-center rounded-lg border border-[var(--reader-border)] bg-[var(--reader-surface)] text-[var(--reader-foreground)] transition-colors hover:bg-[var(--reader-surface-muted)]"
        onClick={() => {
          audio.markInteraction();
          setOpen(!open);
        }}
        title={t("reader", "audio.mixer")}
        type="button"
      >
        {audio.isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>

      {/* Popover */}
      {open && (
        <div
          className="absolute right-0 top-12 z-50 w-72 rounded-xl border border-[var(--reader-border)] bg-[var(--reader-surface)] p-5 shadow-xl"
          role="group"
          aria-label={t("reader", "audio.mixer")}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">🔊 {t("reader", "audio.mixer")}</h3>
            <button
              aria-label={t("reader", "audio.closeMixer")}
              className="text-xs font-semibold text-[var(--reader-muted)]"
              onClick={() => setOpen(false)}
              type="button"
            >
              {t("common", "actions.close")}
            </button>
          </div>

          <button
            aria-pressed={preferences.ambientEnabled}
            className="mb-4 min-h-11 w-full rounded-lg border border-[var(--reader-border)] px-3 text-sm font-semibold aria-pressed:bg-[var(--reader-accent)] aria-pressed:text-[var(--reader-accent-foreground)]"
            onClick={() => {
              audio.markInteraction();
              updatePreferences({
                ambientEnabled: !preferences.ambientEnabled,
              });
            }}
            type="button"
          >
            {preferences.ambientEnabled
              ? t("reader", "audio.disableAmbient")
              : t("reader", "audio.enableAmbient")}
          </button>

          {/* Ambient layers */}
          {room.audioLayers.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase text-[var(--reader-muted)]">
                {t("reader", "audio.ambient")}
              </p>
              {room.audioLayers.map((layer) => (
                <div className="mb-3 flex items-center gap-3" key={layer.id}>
                  <span className="w-16 text-xs">
                    {t("reader", `room.audioLayers.${layer.id}`)}
                  </span>
                  <input
                    aria-label={t("reader", "audio.layerVolume", {
                      name: t("reader", `room.audioLayers.${layer.id}`),
                    })}
                    className="h-1.5 flex-1 appearance-none rounded-full bg-[var(--reader-surface-muted)] accent-[var(--room-accent,var(--reader-accent))]"
                    max="1"
                    min="0"
                    onChange={(event) => {
                      const vol = Number(event.target.value);
                      audio.setLayerVolume(layer.id, vol);
                      updatePreferences({
                        layerVolumes: { ...preferences.layerVolumes, [layer.id]: vol },
                      });
                    }}
                    step="0.05"
                    type="range"
                    value={audio.getLayerVolume(layer.id) || layer.defaultVolume}
                  />
                  <span className="w-8 text-right text-xs text-[var(--reader-muted)]">
                    {Math.round((audio.getLayerVolume(layer.id) || layer.defaultVolume) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {room.audioLayers.length === 0 && (
            <p className="mb-4 text-xs text-[var(--reader-muted)]">
              {t("reader", "audio.noAmbient")}
            </p>
          )}

          {/* Page-turn sound */}
          <div className="mb-4 border-t border-[var(--reader-border)] pt-4">
            <p className="mb-2 text-xs font-semibold uppercase text-[var(--reader-muted)]">
              {t("reader", "audio.effects")}
            </p>
            <div className="flex items-center gap-3">
              <span className="w-16 text-xs">{t("reader", "audio.pageTurn")}</span>
              <input
                aria-label={t("reader", "audio.pageTurnVolume")}
                className="h-1.5 flex-1 appearance-none rounded-full bg-[var(--reader-surface-muted)] accent-[var(--room-accent,var(--reader-accent))]"
                max="1"
                min="0"
                onChange={(event) => {
                  const vol = Number(event.target.value);
                  audio.setPageTurnVolume(vol);
                  updatePreferences({ pageTurnVolume: vol });
                }}
                step="0.05"
                type="range"
                value={preferences.pageTurnVolume}
              />
              <span className="w-8 text-right text-xs text-[var(--reader-muted)]">
                {Math.round(preferences.pageTurnVolume * 100)}%
              </span>
            </div>
          </div>

          {/* Master volume */}
          <div className="border-t border-[var(--reader-border)] pt-4">
            <div className="mb-3 flex items-center gap-3">
              <span className="w-16 text-xs font-semibold">
                {t("reader", "audio.master")}
              </span>
              <input
                aria-label={t("reader", "audio.masterVolume")}
                className="h-1.5 flex-1 appearance-none rounded-full bg-[var(--reader-surface-muted)] accent-[var(--room-accent,var(--reader-accent))]"
                max="1"
                min="0"
                onChange={(event) => {
                  const vol = Number(event.target.value);
                  audio.setMasterVolume(vol);
                  updatePreferences({ masterVolume: vol });
                }}
                step="0.05"
                type="range"
                value={preferences.masterVolume}
              />
              <span className="w-8 text-right text-xs text-[var(--reader-muted)]">
                {Math.round(preferences.masterVolume * 100)}%
              </span>
            </div>

            <button
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--reader-border)] py-2 text-sm font-semibold transition-colors hover:bg-[var(--reader-surface-muted)]"
              onClick={() => {
                audio.setMuted(!audio.isMuted);
                updatePreferences({ muteAll: !audio.isMuted });
              }}
              type="button"
            >
              {audio.isMuted ? <Volume2 size={16} /> : <VolumeX size={16} />}
              {audio.isMuted
                ? t("reader", "audio.unmuteAll")
                : t("reader", "audio.muteAll")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
