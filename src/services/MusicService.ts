import { metadataCache } from '../core/cache';
import { appError, toAppError } from '../core/errors';
import {
  emptySearchResults,
  SearchFilter,
  SearchResults,
  Track,
} from '../core/types';
import { PlaylistPage, providers } from '../providers/TrackResolver';
import { youtubeResolver } from '../providers/youtube/YouTubeResolver';
import { streamResolver } from '../providers/stream/StreamResolver';

providers.register(youtubeResolver, true);

class MusicServiceImpl {
  async init(): Promise<void> {
    await metadataCache.hydrate();
  }

  async search(
    query: string,
    options: { filter?: SearchFilter; signal?: AbortSignal; limit?: number } = {}
  ): Promise<SearchResults> {
    const q = query.trim();
    if (!q) return emptySearchResults();

    try {
      return await providers.default.search(q, options);
    } catch (e) {
      throw toAppError(e, 'search_failed');
    }
  }

  async getSuggestions(input: string, signal?: AbortSignal): Promise<string[]> {
    const provider = providers.default;
    if (!provider.getSuggestions) return [];
    return provider.getSuggestions(input, signal);
  }

  async getMetadata(track: Track, signal?: AbortSignal): Promise<Track> {
    return providers.forTrack(track).getMetadata(track.sourceId, signal);
  }

  async getPlaylist(
    browseId: string,
    options: { signal?: AbortSignal; maxTracks?: number } = {}
  ): Promise<PlaylistPage> {
    const { signal, maxTracks = 200 } = options;
    const provider = providers.default;

    let page = await provider.getPlaylist(browseId, { signal });
    const tracks = [...page.tracks];

    let guard = 0;
    while (page.continuation && tracks.length < maxTracks && guard < 5) {
      guard++;
      try {
        page = await provider.getPlaylist(browseId, {
          continuation: page.continuation,
          signal,
        });
        if (!page.tracks.length) break;
        tracks.push(...page.tracks);
      } catch {
        break;
      }
    }

    return {
      playlist: { ...page.playlist, trackCount: tracks.length },
      tracks: tracks.slice(0, maxTracks),
    };
  }

  async getAlbum(browseId: string, signal?: AbortSignal): Promise<PlaylistPage> {
    const provider = providers.default;
    if (!provider.getAlbum) throw appError('invalid_playlist', 'Albums not supported');
    return provider.getAlbum(browseId, signal);
  }

  async getArtistTracks(browseId: string, signal?: AbortSignal): Promise<Track[]> {
    const provider = providers.default;
    if (!provider.getArtistTracks) return [];
    return provider.getArtistTracks(browseId, signal);
  }

  async getRelated(track: Track, signal?: AbortSignal): Promise<Track[]> {
    const provider = providers.forTrack(track);
    if (!provider.getRelated) return [];
    return provider.getRelated(track, signal);
  }

  async importFromUrl(
    input: string,
    signal?: AbortSignal
  ): Promise<{ page: PlaylistPage } | { track: Track }> {
    const provider = providers.default;
    const parsed = provider.parseShareUrl?.(input);

    if (!parsed) throw appError('invalid_playlist', `Unrecognized link: ${input}`);

    if (parsed.kind === 'playlist') {
      return { page: await this.getPlaylist(parsed.id, { signal }) };
    }
    if (parsed.kind === 'album') {
      return { page: await this.getAlbum(parsed.id, signal) };
    }
    return { track: await provider.getMetadata(parsed.id, signal) };
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
