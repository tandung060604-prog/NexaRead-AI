/**
 * Page-turn sound manager.
 *
 * Plays short page-turn audio on each page transition, with:
 * - Multiple sound variants to avoid mechanical repetition
 * - Debounce when flipping rapidly
 * - Independent volume from ambient audio
 * - Browser autoplay policy compliance
 * - Preloaded audio buffers
 */

/** Minimum milliseconds between consecutive page-turn sounds. */
const DEBOUNCE_MS = 250;

/**
 * Page-turn sound paths (relative to /public/).
 * In development these are placeholders.  Replace with real foley assets.
 */
const PAGE_TURN_VARIANTS = [
  "https://actions.google.com/sounds/v1/foley/turn_page.ogg",
  "https://actions.google.com/sounds/v1/foley/turn_page.ogg",
  "https://actions.google.com/sounds/v1/foley/turn_page.ogg",
];

export class PageTurnSound {
  private audioPool: HTMLAudioElement[] = [];
  private poolIndex = 0;
  private lastPlayTime = 0;
  private volume = 0.6;
  private enabled = false;
  private muted = false;
  private userInteracted = false;

  constructor() {
    if (typeof window === "undefined") return;

    // Pre-create audio elements for each variant
    this.audioPool = PAGE_TURN_VARIANTS.map((src) => {
      const audio = new Audio();
      audio.preload = "none";
      audio.src = src;
      audio.volume = 0;
      return audio;
    });
  }

  /** Mark that the user has interacted. */
  markInteraction(): void {
    this.userInteracted = true;
  }

  /** Play a page-turn sound, cycling through variants. */
  play(): void {
    if (!this.enabled || this.muted || !this.userInteracted) return;
    if (this.audioPool.length === 0) return;

    const now = Date.now();
    if (now - this.lastPlayTime < DEBOUNCE_MS) return;
    this.lastPlayTime = now;

    const audio = this.audioPool[this.poolIndex % this.audioPool.length];
    this.poolIndex = (this.poolIndex + 1) % this.audioPool.length;

    audio.volume = this.volume;
    audio.currentTime = 0;
    audio.play().catch(() => {
      // Autoplay blocked — silent degradation
    });
  }

  /** Set the page-turn volume (0–1). */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  getVolume(): number {
    return this.volume;
  }

  /** Enable or disable page-turn sounds. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Mute or unmute (follows master mute). */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.audioPool.forEach((audio) => audio.pause());
    }
  }

  /** Release audio resources. */
  destroy(): void {
    this.audioPool.forEach((audio) => {
      audio.pause();
      audio.src = "";
    });
    this.audioPool = [];
  }
}
