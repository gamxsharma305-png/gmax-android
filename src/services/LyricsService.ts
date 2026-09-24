import { metadataCache } from '../core/cache';
import { Track } from '../core/types';

export type LyricLine = {
  time?: number;
  text: string;
};

export type Lyrics = {
  trackId: string;
  lines: LyricLine[];
  synced: boolean;
  source: string;
};

export interface LyricsProvider {
  readonly id: string;
  fetch(track: Track, signal?: AbortSignal): Promise<Lyrics | null>;
}

const TTL = 24 * 60 * 60 * 1000;

class LyricsServiceImpl {
  private provider: LyricsProvider | null = null;

  use(provider: LyricsProvider | null): void {
    this.provider = provider;
  }

  get isConfigured(): boolean {
    return this.provider !== null;
  }

  get providerName(): string | null {
    return this.provider?.id ?? null;
  }

  async get(track: Track, signal?: AbortSignal): Promise<Lyrics | null> {
    if (!this.provider) return null;

    const key = `lyrics:${this.provider.id}:${track.id}`;
    const cached = metadataCache.get<Lyrics | null>(key);
    if (cached !== undefined) return cached;

    try {
      const lyrics = await this.provider.fetch(track, signal);
      metadataCache.set(key, lyrics, TTL);
      return lyrics;
    } catch {
      return null;
    }
  }

  activeLineIndex(lyrics: Lyrics | null, position: number): number {
    if (!lyrics?.synced || !lyrics.lines.length) return -1;

    let index = -1;
    for (let i = 0; i < lyrics.lines.length; i++) {
      const t = lyrics.lines[i].time;
      if (t === undefined || t > position) break;
      index = i;
    }
    return index;
  }
}

export const LyricsService = new LyricsServiceImpl();
