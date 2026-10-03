import { metadataCache } from '../core/cache';
import { appError, toAppError } from '../core/errors';
import {
  emptySearchResults,
  ResolvedStream,
  SearchFilter,
  SearchResults,
  Track,
} from '../core/types';
import { PlaylistPage, providers } from '../providers/TrackResolver';
import { youtubeResolver } from '../providers/youtube/YouTubeResolver';
import { streamResolver, endpointSource } from '../providers/stream/StreamResolver';
import { NativeStreamSource } from '../providers/stream/NativeStreamSource';
import { multiSourceSearch } from '../providers/MultiSourceSearch';

providers.register(youtubeResolver, true);

const OFFLINE_TTL = 4 * 60 * 60 * 1000;
const nativeYt = new NativeStreamSource();

/** Public Invidious instances for offline YouTube audio fallback */
const DEFAULT_INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.fdn.fr',
  'https://yewtu.be',
  'https://vid.puffyan.us',
];

function ensureYtEndpoints(): void {
  if (endpointSource.getEndpoints().length === 0) {
    endpointSource.setEndpoints(
      DEFAULT_INVIDIOUS.map((url) => ({ url, kind: 'invidious' as const }))
    );
  }
}

class MusicServiceImpl {
  async init(): Promise<void> {
    await metadataCache.hydrate();
    ensureYtEndpoints();
  }

  async search(
    query: string,
    options: { filter?: SearchFilter; signal?: AbortSignal; limit?: number } = {}
  ): Promise<SearchResults> {
    const q = query.trim();
    if (!q) return emptySearchResults();

    const limit = options.limit ?? 24;

    let youtubeTracks: Track[] = [];
    try {
      const yt = await providers.default.search(q, { ...options, limit: Math.ceil(limit / 2) });
      youtubeTracks = yt.tracks || [];
    } catch {
      youtubeTracks = [];
    }

    try {
      return await multiSourceSearch(q, {
        limit,
        signal: options.signal,
        youtubeTracks,
      });
    } catch (e) {
      if (youtubeTracks.length) {
        return {
          query: q,
          tracks: youtubeTracks.slice(0, limit),
          artists: [],
          albums: [],
          playlists: [],
        };
      }
      throw toAppError(e, 'search_failed');
    }
  }

  async getSuggestions(input: string, signal?: AbortSignal): Promise<string[]> {
    const provider = providers.default;
    if (!provider.getSuggestions) return [];
    return provider.getSuggestions(input, signal);
  }

  async getMetadata(track: Track, signal?: AbortSignal): Promise<Track> {
    if (track.provider !== 'youtube') return track;
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
    if (track.provider !== 'youtube') return [];
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
    return streamResolver.resolve(track, signal);
  }

  /**
   * Ensure YouTube video id for offline.
   * Same track if already YouTube; else search YouTube for title+artist.
   */
  async resolveYouTubeTrackForOffline(
    track: Track,
    signal?: AbortSignal
  ): Promise<Track> {
    if (track.provider === 'youtube' && track.sourceId) {
      return track;
    }

    const q = `${track.title} ${track.artist?.name || ''}`.trim();
    if (!q) throw appError('track_unavailable', 'No title to search on YouTube');

    const yt = await providers.default.search(q, { filter: 'Songs', limit: 8, signal });
    const hit =
      yt.tracks.find((t) => t.provider === 'youtube' && t.sourceId) || yt.tracks[0];
    if (!hit?.sourceId) {
      throw appError('track_unavailable', 'No YouTube match for this song');
    }
    return hit;
  }

  /**
   * Offline = YouTube only (Musify / youtube_explode pattern).
   * NewPipe progressive audio → same video id.
   * Fallback: Invidious endpoints only.
   * NEVER TitleMatch / Saavn / Audius swap.
   */
  async resolveStreamForOffline(track: Track, signal?: AbortSignal): Promise<ResolvedStream> {
    if (track.localUri) {
      return {
        url: track.localUri,
        expiresAt: Date.now() + OFFLINE_TTL,
        resolvedBy: 'local',
      };
    }

    ensureYtEndpoints();

    const ytTrack = await this.resolveYouTubeTrackForOffline(track, signal);
    if (signal?.aborted) throw appError('timeout');

    // 1) NewPipe — progressive HTTP audio of THIS YouTube video (Musify-style)
    if (nativeYt.canHandle(ytTrack)) {
      try {
        const native = await nativeYt.resolve(ytTrack, signal);
        if (native?.url) return native;
      } catch {
        /* fall through */
      }
    }

    // 2) Invidious adaptive audio — same sourceId only
    if (endpointSource.canHandle(ytTrack)) {
      try {
        return await endpointSource.resolve(ytTrack, signal);
      } catch {
        /* fall through */
      }
    }

    throw appError(
      'source_unavailable',
      'YouTube audio stream not available for offline download'
    );
  }

  canPlay(track: Track): boolean {
    if (track.localUri) return true;
    if (track.audioUrl) return true;
    if (track.provider === 'youtube' && track.sourceId) return true;
    return streamResolver.canResolve(track);
  }

  prefetchStream(track: Track | null): void {
    if (!track) return;
    if (track.localUri || track.audioUrl) return;
    if (!streamResolver.canResolve(track)) return;
    if (streamResolver.peek(track)) return;
    void streamResolver.resolve(track).catch(() => undefined);
  }

  invalidateStream(track: Track): void {
    streamResolver.invalidate(track);
  }
}

export const MusicService = new MusicServiceImpl();
