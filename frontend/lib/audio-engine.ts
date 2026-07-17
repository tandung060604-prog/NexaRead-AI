/**
 * Ambient audio engine.
 *
 * Manages audio playback for ambient loops and one-shot effects.
 * Features:
 * - Seamless looping with no gap
 * - Crossfade between room changes
 * - Volume control per layer + master
 * - Mute / unmute without destroying audio objects
 * - Tab-visibility aware (optional volume reduction)
 * - Respects browser autoplay policy (requires user interaction first)
 * - Cleanup on destroy
 */

const CROSSFADE_DURATION = 800; // ms

export type AudioLayerState = {
  id: string;
  src: string;
  volume: number;
  playing: boolean;
  loaded: boolean;
  error: boolean;
};

export class AudioEngine {
  private layers = new Map<string, HTMLAudioElement>();
  private volumes = new Map<string, number>();
  private masterVolume = 0.7;
  private muted = false;
  private destroyed = false;
  private userInteracted = false;

  /** Mark that the user has interacted (click, keypress, touch). */
  markInteraction(): void {
    this.userInteracted = true;
  }

  /** Whether the user has interacted and audio can play. */
  get canPlay(): boolean {
    return this.userInteracted;
  }

  /** Set the master volume (0–1). */
  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    this.applyVolumes();
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  /** Mute or unmute all audio without destroying sources. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolumes();
  }

  isMuted(): boolean {
    return this.muted;
  }

  /**
   * Start or update an audio layer.
   * If the layer already exists with the same src, only volume is updated.
   * If src differs, the old source is crossfaded out and replaced.
   */
  async setLayer(
    id: string,
    src: string,
    volume: number,
    loop = true,
  ): Promise<void> {
    if (this.destroyed || !src) return;

    const existing = this.layers.get(id);
    this.volumes.set(id, volume);

    // Same source — just update volume
    if (existing && existing.src.endsWith(src.replace(/^\//, ""))) {
      this.applyVolumes();
      return;
    }

    // Crossfade out old
    if (existing) {
      await this.fadeOut(existing);
      existing.pause();
      existing.src = "";
    }

    // Create new
    const audio = new Audio();
    audio.loop = loop;
    audio.preload = "auto";
    audio.volume = 0;

    try {
      audio.src = src;
      this.layers.set(id, audio);

      if (this.userInteracted) {
        await audio.play().catch(() => {
          // Autoplay blocked — will retry after next interaction
        });
        await this.fadeIn(audio, this.computeLayerVolume(id));
      }
    } catch {
      // Audio source failed to load — reader continues without it
    }
  }

  /** Set volume for a specific layer (0–1). */
  setLayerVolume(id: string, volume: number): void {
    this.volumes.set(id, Math.max(0, Math.min(1, volume)));
    this.applyVolumes();
  }

  getLayerVolume(id: string): number {
    return this.volumes.get(id) ?? 0;
  }

  /** Stop and remove a specific layer. */
  async removeLayer(id: string): Promise<void> {
    const audio = this.layers.get(id);
    if (!audio) return;
    await this.fadeOut(audio);
    audio.pause();
    audio.src = "";
    this.layers.delete(id);
    this.volumes.delete(id);
  }

  /** Stop all layers with crossfade, preparing for a room switch. */
  async crossfadeOut(): Promise<void> {
    const fades = [...this.layers.values()].map((audio) => this.fadeOut(audio));
    await Promise.all(fades);
    this.layers.forEach((audio) => {
      audio.pause();
      audio.src = "";
    });
    this.layers.clear();
    this.volumes.clear();
  }

  /** Reduce volume when tab is not visible. */
  handleVisibilityChange(hidden: boolean): void {
    if (hidden) {
      this.layers.forEach((audio) => {
        audio.volume = Math.max(0, audio.volume * 0.3);
      });
    } else {
      this.applyVolumes();
    }
  }

  /** Get the current state of all layers for UI rendering. */
  getLayerStates(): AudioLayerState[] {
    return [...this.layers.entries()].map(([id, audio]) => ({
      id,
      src: audio.src,
      volume: this.volumes.get(id) ?? 0,
      playing: !audio.paused,
      loaded: audio.readyState >= 2,
      error: audio.error !== null,
    }));
  }

  /** Try to resume all paused layers after user interaction. */
  async resumeAfterInteraction(): Promise<void> {
    this.userInteracted = true;
    for (const [id, audio] of this.layers) {
      if (audio.paused && audio.src) {
        try {
          await audio.play();
          await this.fadeIn(audio, this.computeLayerVolume(id));
        } catch {
          // Still blocked — ignore
        }
      }
    }
  }

  /** Clean up all audio resources. Call when leaving the reader. */
  destroy(): void {
    this.destroyed = true;
    this.layers.forEach((audio) => {
      audio.pause();
      audio.src = "";
    });
    this.layers.clear();
    this.volumes.clear();
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private computeLayerVolume(id: string): number {
    if (this.muted) return 0;
    return (this.volumes.get(id) ?? 0) * this.masterVolume;
  }

  private applyVolumes(): void {
    this.layers.forEach((audio, id) => {
      const target = this.computeLayerVolume(id);
      audio.volume = target;
    });
  }

  private fadeIn(audio: HTMLAudioElement, targetVolume: number): Promise<void> {
    return new Promise((resolve) => {
      const startVolume = audio.volume;
      const diff = targetVolume - startVolume;
      if (diff <= 0) {
        audio.volume = targetVolume;
        resolve();
        return;
      }
      const steps = 20;
      const stepDuration = CROSSFADE_DURATION / steps;
      let step = 0;
      const timer = setInterval(() => {
        step++;
        audio.volume = Math.min(targetVolume, startVolume + diff * (step / steps));
        if (step >= steps) {
          clearInterval(timer);
          resolve();
        }
      }, stepDuration);
    });
  }

  private fadeOut(audio: HTMLAudioElement): Promise<void> {
    return new Promise((resolve) => {
      const startVolume = audio.volume;
      if (startVolume <= 0) {
        resolve();
        return;
      }
      const steps = 20;
      const stepDuration = CROSSFADE_DURATION / steps;
      let step = 0;
      const timer = setInterval(() => {
        step++;
        audio.volume = Math.max(0, startVolume * (1 - step / steps));
        if (step >= steps) {
          clearInterval(timer);
          resolve();
        }
      }, stepDuration);
    });
  }
}
