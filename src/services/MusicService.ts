import { metadataCache } from '../core/cache';
import { appError, toAppError } from '../core/errors';
import {
  Album,
  ArtistResult,
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

    const limit = options.limit ?? 150;
    const filter = options.filter ?? 'All';
    const ytLimit = Math.min(200, Math.max(40, limit));
    const signal = options.signal;

    const ytMainPromise = providers.default
      .search(q, { filter, limit: ytLimit, signal })
      .catch(() => emptySearchResults(q));

    const needArtists = filter === 'All' || filter === 'Artists';
    const needAlbums = filter === 'All' || filter === 'Albums';

    const ytArtistsPromise = needArtists
      ? providers.default
          .search(q, { filter: 'Artists', limit: 20, signal })
          .catch(() => emptySearchResults(q))
      : Promise.resolve(emptySearchResults(q));

    const ytAlbumsPromise = needAlbums
      ? providers.default
          .search(q, { filter: 'Albums', limit: 20, signal })
          .catch(() => emptySearchResults(q))
      : Promise.resolve(emptySearchResults(q));

    const otherPromise = (async () => {
      try {
        return await Promise.race([
          multiSourceSearch(q, { limit, signal, youtubeTracks: [] }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
        ]);
      } catch {
        return null;
      }
    })();

    const [ytMain, ytArtists, ytAlbums, other] = await Promise.all([
      ytMainPromise,
      ytArtistsPromise,
      ytAlbumsPromise,
      otherPromise,
    ]);

    const seenTrack = new Set<string>();
    const tracks: Track[] = [];
    for (const t of [...(ytMain.tracks || []), ...(other?.tracks ?? [])]) {
      const key = `${(t.title || '').toLowerCase()}|${(t.artist?.name || '').toLowerCase()}`;
      if (seenTrack.has(key)) continue;
      seenTrack.add(key);
      tracks.push(t);
      if (tracks.length >= limit) break;
    }

    const seenArtist = new Set<string>();
    const artists: ArtistResult[] = [];
    for (const a of [...(ytArtists.artists || []), ...(ytMain.artists || [])]) {
      const key = (a.browseId || a.id || a.name || '').toLowerCase();
      if (!key || seenArtist.has(key)) continue;
      seenArtist.add(key);
      artists.push(a);
      if (artists.length >= 24) break;
    }

    const seenAlbum = new Set<string>();
    const albums: Album[] = [];
    for (const a of [...(ytAlbums.albums || []), ...(ytMain.albums || [])]) {
      const key = (a.browseId || a.id || a.title || '').toLowerCase();
      if (!key || seenAlbum.has(key)) continue;
      seenAlbum.add(key);
      albums.push(a);
      if (albums.length >= 24) break;
    }

    const playlists = (ytMain.playlists || []).slice(0, 8);

    if (!tracks.length && !artists.length && !albums.length && !playlists.length) {
      throw toAppError(new Error('No results'), 'search_failed');
    }

    return { query: q, tracks, artists, albums, playlists };
  }

  async loadArtistCatalog(
    artist: { name: string; browseId?: string },
    options: { signal?: AbortSignal; maxTracks?: number } = {}
  ): Promise<Track[]> {
    const max = options.maxTracks ?? 200;
    const signal = options.signal;
    const seen = new Set<string>();
    const out: Track[] = [];

    const push = (list: Track[]) => {
      for (const t of list) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        out.push(t);
        if (out.length >= max) return true;
      }
      return false;
    };

    if (artist.browseId) {
      try {
        const page = await this.getArtistTracks(artist.browseId, signal);
        if (push(page)) return out;
      } catch {
        /* fall through */
      }
    }

    const name = (artist.name || '').trim();
    if (name) {
      for (const q of [`${name} songs`, name, `${name} hits`, `${name} best`]) {
        try {
          const res = await providers.default.search(q, {
            filter: 'Songs',
            limit: 80,
            signal,
          });
          if (push(res.tracks || [])) return out;
        } catch {
          /* next */
        }
      }
    }

    return out;
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

  async resolveYouTubeTrackForOffline(
    track: Track,
    signal?: AbortSignal
  ): Promise<Track> {
    if (track.provider === 'youtube' && track.sourceId) return track;

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

  async resolveStreamForOffline(track: Track, signal?: AbortSignal): Promise<ResolvedStream> {
    if (track.localUri) {
      return { url: track.localUri, expiresAt: Date.now() + OFFLINE_TTL, resolvedBy: 'local' };
    }

    ensureYtEndpoints();
    const ytTrack = await this.resolveYouTubeTrackForOffline(track, signal);
    if (signal?.aborted) throw appError('timeout');

    if (nativeYt.canHandle(ytTrack)) {
      try {
        const native = await nativeYt.resolve(ytTrack, signal);
        if (native?.url) return native;
      } catch {
        /* fall through */
      }
    }

    if (endpointSource.canHandle(ytTrack)) {
      try {
        return await endpointSource.resolve(ytTrack, signal);
      } catch {
        /* fall through */
      }
    }

    throw appError('source_unavailable', 'YouTube audio stream not available for offline download');
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
