import {
  Album,
  ArtistResult,
  ProviderId,
  RemotePlaylist,
  ResolvedStream,
  SearchFilter,
  SearchResults,
  Track,
} from '../core/types';

export type SearchOptions = {
  filter?: SearchFilter;
  limit?: number;
  signal?: AbortSignal;
};

export type PlaylistPage = {
  playlist: RemotePlaylist;
  tracks: Track[];
  continuation?: string;
};

export interface TrackResolver {
  readonly id: ProviderId;
  readonly name: string;

  search(query: string, options?: SearchOptions): Promise<SearchResults>;
  resolve(track: Track, signal?: AbortSignal): Promise<ResolvedStream>;
  getMetadata(sourceId: string, signal?: AbortSignal): Promise<Track>;
  getPlaylist(
    browseId: string,
    options?: { continuation?: string; signal?: AbortSignal }
  ): Promise<PlaylistPage>;
  getAlbum?(browseId: string, signal?: AbortSignal): Promise<PlaylistPage>;
  getArtistTracks?(browseId: string, signal?: AbortSignal): Promise<Track[]>;
  getRelated?(track: Track, signal?: AbortSignal): Promise<Track[]>;
  getSuggestions?(input: string, signal?: AbortSignal): Promise<string[]>;
  parseShareUrl?(input: string): { kind: 'playlist' | 'album' | 'track'; id: string } | null;
}

class ProviderRegistry {
  private providers = new Map<ProviderId, TrackResolver>();
  private defaultId?: ProviderId;

  register(provider: TrackResolver, asDefault = false): void {
    this.providers.set(provider.id, provider);
    if (asDefault || !this.defaultId) this.defaultId = provider.id;
  }

  get(id: ProviderId): TrackResolver {
    const p = this.providers.get(id);
    if (!p) throw new Error(`No provider registered for "${id}"`);
    return p;
  }

  forTrack(track: Track): TrackResolver {
    return this.get(track.provider);
  }

  get default(): TrackResolver {
    if (!this.defaultId) throw new Error('No providers registered');
    return this.get(this.defaultId);
  }

  all(): TrackResolver[] {
    return [...this.providers.values()];
  }
}

export const providers = new ProviderRegistry();

export type { Album, ArtistResult, RemotePlaylist, SearchResults, Track };
