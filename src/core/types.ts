/**
 * Canonical domain model for GMAX.
 */

export type ProviderId = 'youtube' | 'saavn' | 'audius' | 'itunes';

export type Artist = {
  id: string;
  name: string;
  imageUrl?: string;
};

export type Track = {
  id: string;
  title: string;
  artist: Artist;
  albumImageUrl: string;
  duration: number;
  /** Direct playable HTTPS audio — enables real background playback */
  audioUrl?: string;
  provider: ProviderId;
  sourceId: string;
  album?: string;
  explicit?: boolean;
  isVideo?: boolean;
};

export type Album = {
  id: string;
  provider: ProviderId;
  browseId: string;
  title: string;
  artist: string;
  coverImageUrl: string;
  year?: string;
  trackCount?: number;
};

export type ArtistResult = {
  id: string;
  provider: ProviderId;
  browseId: string;
  name: string;
  imageUrl: string;
  subtitle?: string;
};

export type RemotePlaylist = {
  id: string;
  provider: ProviderId;
  browseId: string;
  name: string;
  description: string;
  creator: string;
  coverImageUrl: string;
  trackCount?: number;
};

export type Playlist = {
  id: string;
  name: string;
  description: string;
  creator: string;
  coverImageUrl: string;
  tracks: Track[];
  source?: { provider: ProviderId; browseId: string };
  createdAt: number;
  updatedAt: number;
};

export type SearchFilter = 'All' | 'Songs' | 'Artists' | 'Albums' | 'Playlists';

export type SearchResults = {
  query: string;
  tracks: Track[];
  artists: ArtistResult[];
  albums: Album[];
  playlists: RemotePlaylist[];
};

export const emptySearchResults = (query = ''): SearchResults => ({
  query,
  tracks: [],
  artists: [],
  albums: [],
  playlists: [],
});

export const EMPTY_SEARCH_RESULTS: SearchResults = Object.freeze({
  query: '',
  tracks: Object.freeze([]) as unknown as Track[],
  artists: Object.freeze([]) as unknown as ArtistResult[],
  albums: Object.freeze([]) as unknown as Album[],
  playlists: Object.freeze([]) as unknown as RemotePlaylist[],
});

export type ResolvedStream = {
  url: string;
  mimeType?: string;
  bitrate?: number;
  expiresAt: number;
  headers?: Record<string, string>;
  resolvedBy?: string;
};

export type RepeatMode = 'off' | 'all' | 'one';

export type Category = {
  id: string;
  name: string;
  color: string;
  query: string;
};

export const trackKey = (provider: ProviderId, sourceId: string) =>
  `${provider}:${sourceId}`;
