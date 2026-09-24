import { Track } from '../core/types';
import { streamResolver } from '../providers/stream/StreamResolver';

class PreloadManager {
  private controller: AbortController | null = null;
  private targetId: string | null = null;

  schedule(track: Track | null): void {
    if (!track) {
      this.cancel();
      return;
    }

    if (this.targetId === track.id) return;

    this.cancel();

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

  adopt(trackId: string | null): void {
    if (trackId && this.targetId === trackId) {
      this.controller = null;
      this.targetId = null;
      return;
    }
    this.cancel();
  }

  cancel(): void {
    if (__DEV__ && this.targetId) console.log('[preload] cancelled', this.targetId);
    this.controller?.abort();
    this.controller = null;
    this.targetId = null;
  }

  get pending(): string | null {
    return this.targetId;
  }
}

export const preloader = new PreloadManager();
