import { Track } from '../core/types';
import { streamResolver } from '../providers/stream/StreamResolver';

/**
 * Warms stream URLs for upcoming tracks so skip / next feels instant.
 */
class PreloadManager {
  private controller: AbortController | null = null;
  private targetId: string | null = null;
  private secondary: AbortController | null = null;
  private secondaryId: string | null = null;

  schedule(track: Track | null): void {
    if (!track) {
      this.cancel();
      return;
    }

    if (this.targetId === track.id) return;

    this.cancelPrimary();

    if (!streamResolver.canResolve(track)) return;
    if (streamResolver.peek(track)) return;

    const controller = new AbortController();
    this.targetId = track.id;
    this.controller = controller;

    if (__DEV__) console.log('[preload] warming', track.title);

    void streamResolver
      .resolve(track, controller.signal)
      .catch(() => {})
      .finally(() => {
        if (this.controller === controller) {
          this.controller = null;
          this.targetId = null;
        }
      });
  }

  /** Prefetch next 1–2 tracks in a list (queue / search results). */
  scheduleMany(tracks: Array<Track | null | undefined>): void {
    const list = tracks.filter((t): t is Track => !!t && !!t.id);
    if (!list.length) {
      this.cancel();
      return;
    }

    this.schedule(list[0]);

    const second = list[1];
    if (!second || second.id === list[0].id) return;
    if (streamResolver.peek(second)) return;
    if (!streamResolver.canResolve(second)) return;
    if (this.secondaryId === second.id) return;

    this.cancelSecondary();
    const controller = new AbortController();
    this.secondary = controller;
    this.secondaryId = second.id;

    if (__DEV__) console.log('[preload] warming+1', second.title);

    void streamResolver
      .resolve(second, controller.signal)
      .catch(() => {})
      .finally(() => {
        if (this.secondary === controller) {
          this.secondary = null;
          this.secondaryId = null;
        }
      });
  }

  adopt(trackId: string | null): void {
    if (trackId && this.targetId === trackId) {
      this.controller = null;
      this.targetId = null;
      return;
    }
    if (trackId && this.secondaryId === trackId) {
      this.secondary = null;
      this.secondaryId = null;
      return;
    }
    this.cancel();
  }

  cancelPrimary(): void {
    if (__DEV__ && this.targetId) console.log('[preload] cancelled', this.targetId);
    this.controller?.abort();
    this.controller = null;
    this.targetId = null;
  }

  cancelSecondary(): void {
    this.secondary?.abort();
    this.secondary = null;
    this.secondaryId = null;
  }

  cancel(): void {
    this.cancelPrimary();
    this.cancelSecondary();
  }

  get pending(): string | null {
    return this.targetId;
  }
}

export const preloader = new PreloadManager();
