import { SearchResults, Track } from '../core/types';
import { emptyResults } from '../core/types';
import { providers } from '../providers/registry';
import { streamResolver } from '../providers/stream/StreamResolver';
import { youtubeResolver } from '../providers/youtube/YouTubeResolver';

providers.register(youtubeResolver, true);

class MusicServiceImpl {
  private ready = false;

  async init(): Promise<void> {
    this.ready = true;
  }

  async search(
    query: string,
    options: { limit?: number; signal?: AbortSignal } = {}
  ): Promise<SearchResults> {
    const q = query.trim();
    if (!q) return emptyResults();

    try {
      return await providers.search(q, options);
    } catch {
      return emptyResults();
    }
  }

  async getSuggestions(query: string, signal?: AbortSignal): Promise<string[]> {
    try {
      return await providers.suggestions(query, signal);
    } catch {
      return [];
    }
  }

  async getMetadata(track: Track, signal?: AbortSignal): Promise<Track> {
    return providers.forTrack(track).getMetadata(track.sourceId, signal);
  }

  async getRelated(track: Track, signal?: AbortSignal): Promise<Track[]> {
    try {
      return await providers.forTrack(track).getRelated(track, signal);
    } catch {
      return [];
    }
  }

  async getHome(signal?: AbortSignal): Promise<{
    sections: { title: string; tracks: Track[] }[];
  }> {
    try {
      return await providers.home(signal);
    } catch {
      return { sections: [] };
    }
  }

  async resolveStream(track: Track, signal?: AbortSignal) {
    return providers.forTrack(track).resolve(track, signal);
  }

  canPlay(track: Track): boolean {
    if (track.provider === 'youtube' && track.sourceId) return true;
    if (track.audioUrl) return true;
    return streamResolver.canResolve(track);
  }

  prefetchStream(track: Track | null): void {
    if (!track) return;
    if (track.provider === 'youtube' && track.sourceId) return;
    if (!streamResolver.canResolve(track)) return;
    if (streamResolver.peek(track)) return;
    void streamResolver.resolve(track).catch(() => undefined);
  }

  invalidateStream(track: Track): void {
    streamResolver.invalidate(track);
  }
}

export const MusicService = new MusicServiceImpl();
