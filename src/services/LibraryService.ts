import {
  readJson,
  writeJson,
  writeJsonDebounced,
  STORAGE_KEYS,
} from '../core/storage';
import { Playlist, Track } from '../core/types';

export type Gender = 'male' | 'female' | 'unspecified';

export type UserProfile = {
  name: string;
  gender: Gender;
  completed: boolean;
};

export const DEFAULT_PROFILE: UserProfile = {
  name: '',
  gender: 'unspecified',
  completed: false,
};

export type ResolverEndpoint = {
  url: string;
  kind: 'invidious' | 'piped' | 'custom';
};

export type AppSettings = {
  profile: UserProfile;
  resolverEndpoints: ResolverEndpoint[];
  volume: number;
  preferAudioOnly: boolean;
  autoplayRelated: boolean;
};

/** Public mirrors used when user has not added any. Required for YouTube audio. */
export const DEFAULT_RESOLVER_ENDPOINTS: ResolverEndpoint[] = [
  { url: 'https://invidious.fdn.fr', kind: 'invidious' },
  { url: 'https://inv.nadeko.net', kind: 'invidious' },
  { url: 'https://invidious.privacyredirect.com', kind: 'invidious' },
  { url: 'https://pipedapi.kavin.rocks', kind: 'piped' },
  { url: 'https://pipedapi.adminforge.de', kind: 'piped' },
  { url: 'https://pipedapi.me', kind: 'piped' },
];

export const DEFAULT_SETTINGS: AppSettings = {
  profile: DEFAULT_PROFILE,
  resolverEndpoints: DEFAULT_RESOLVER_ENDPOINTS,
  volume: 1,
  preferAudioOnly: true,
  autoplayRelated: true,
};

export type HistoryEntry = {
  id: string;
  track: Track;
  playedAt: number;
};

export type SavedPlaybackState = {
  trackId: string | null;
  position: number;
};

const MAX_RECENTS = 50;
const MAX_HISTORY = 300;

class LibraryServiceImpl {
  private liked: Track[] = [];
  private likedIds = new Set<string>();
  private playlists: Playlist[] = [];
  private recents: Track[] = [];
  private history: HistoryEntry[] = [];
  private changeListeners = new Set<() => void>();
  private settings: AppSettings = { ...DEFAULT_SETTINGS };
  private searchHistory: string[] = [];
  private loadPromise: Promise<void> | null = null;

  load(): Promise<void> {
    if (!this.loadPromise) this.loadPromise = this.performLoad();
    return this.loadPromise;
  }

  private async performLoad(): Promise<void> {
    const [liked, playlists, recents, settings, listenHistory, history] = await Promise.all([
      readJson<Track[]>(STORAGE_KEYS.likedTracks, []),
      readJson<Playlist[]>(STORAGE_KEYS.playlists, []),
      readJson<Track[]>(STORAGE_KEYS.recentlyPlayed, []),
      readJson<Partial<AppSettings>>(STORAGE_KEYS.settings, {}),
      readJson<HistoryEntry[]>(STORAGE_KEYS.history, []),
      readJson<string[]>(STORAGE_KEYS.searchHistory, []),
    ]);

    this.liked = Array.isArray(liked) ? liked : [];
    this.likedIds = new Set(this.liked.map((t) => t.id));
    this.playlists = Array.isArray(playlists) ? playlists : [];
    this.recents = Array.isArray(recents) ? recents : [];
    const stored = settings ?? {};

    // Merge stored settings; if endpoints missing/empty, seed working defaults
    const storedEndpoints = Array.isArray(stored.resolverEndpoints)
      ? stored.resolverEndpoints.filter((e) => e && typeof e.url === 'string' && e.url.startsWith('http'))
      : [];

    this.settings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      profile: { ...DEFAULT_PROFILE, ...(stored.profile ?? {}) },
      resolverEndpoints:
        storedEndpoints.length > 0 ? storedEndpoints : DEFAULT_RESOLVER_ENDPOINTS,
    };

    // Persist seeded endpoints so next launch and settings UI stay in sync
    if (storedEndpoints.length === 0) {
      void writeJson(STORAGE_KEYS.settings, this.settings);
    }

    this.searchHistory = Array.isArray(history) ? history : [];
    this.history = Array.isArray(listenHistory) ? listenHistory : [];
  }

  subscribe(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private notifyChanged(): void {
    for (const listener of this.changeListeners) listener();
  }

  getLiked(): Track[] {
    return [...this.liked];
  }

  isLiked(trackId: string): boolean {
    return this.likedIds.has(trackId);
  }

  toggleLike(track: Track): boolean {
    if (this.likedIds.has(track.id)) {
      this.likedIds.delete(track.id);
      this.liked = this.liked.filter((t) => t.id !== track.id);
      this.persistLiked();
      return false;
    }
    this.likedIds.add(track.id);
    this.liked = [stripStream(track), ...this.liked];
    this.persistLiked();
    return true;
  }

  private persistLiked(): void {
    writeJsonDebounced(STORAGE_KEYS.likedTracks, this.liked, 400);
  }

  getPlaylists(): Playlist[] {
    return [...this.playlists];
  }

  getPlaylist(id: string): Playlist | undefined {
    return this.playlists.find((p) => p.id === id);
  }

  createPlaylist(
    name: string,
    options: {
      description?: string;
      creator?: string;
      coverImageUrl?: string;
      tracks?: Track[];
      source?: Playlist['source'];
    } = {}
  ): Playlist {
    const now = Date.now();
    const tracks = (options.tracks ?? []).map(stripStream);

    const playlist: Playlist = {
      id: `local:${now}:${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim() || 'New Playlist',
      description: options.description ?? '',
      creator: options.creator ?? 'You',
      coverImageUrl: options.coverImageUrl ?? tracks[0]?.albumImageUrl ?? '',
      tracks,
      source: options.source,
      createdAt: now,
      updatedAt: now,
    };

    this.playlists = [playlist, ...this.playlists];
    this.persistPlaylists();
    return playlist;
  }

  importPlaylist(
    name: string,
    tracks: Track[],
    source: NonNullable<Playlist['source']>,
    meta: { description?: string; creator?: string; coverImageUrl?: string } = {}
  ): Playlist {
    const existing = this.playlists.find(
      (p) => p.source?.provider === source.provider && p.source?.browseId === source.browseId
    );

    if (existing) {
      this.updatePlaylist(existing.id, {
        name,
        tracks: tracks.map(stripStream),
        description: meta.description ?? existing.description,
        coverImageUrl: meta.coverImageUrl || existing.coverImageUrl,
      });
      return this.getPlaylist(existing.id)!;
    }

    return this.createPlaylist(name, { ...meta, tracks, source });
  }

  updatePlaylist(id: string, patch: Partial<Omit<Playlist, 'id' | 'createdAt'>>): void {
    this.playlists = this.playlists.map((p) =>
      p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p
    );
    this.persistPlaylists();
  }

  deletePlaylist(id: string): void {
    this.playlists = this.playlists.filter((p) => p.id !== id);
    this.persistPlaylists();
  }

  addToPlaylist(playlistId: string, tracks: Track | Track[]): void {
    const incoming = (Array.isArray(tracks) ? tracks : [tracks]).map(stripStream);
    const playlist = this.getPlaylist(playlistId);
    if (!playlist) return;

    const existing = new Set(playlist.tracks.map((t) => t.id));
    const fresh = incoming.filter((t) => !existing.has(t.id));
    if (!fresh.length) return;

    this.updatePlaylist(playlistId, { tracks: [...playlist.tracks, ...fresh] });
  }

  removeFromPlaylist(playlistId: string, trackId: string): void {
    const playlist = this.getPlaylist(playlistId);
    if (!playlist) return;

    this.updatePlaylist(playlistId, {
      tracks: playlist.tracks.filter((t) => t.id !== trackId),
    });
  }

  /** Reorder tracks in a playlist (drag up/down). */
  reorderPlaylistTracks(playlistId: string, fromIndex: number, toIndex: number): void {
    const playlist = this.getPlaylist(playlistId);
    if (!playlist) return;
    const tracks = [...playlist.tracks];
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= tracks.length ||
      toIndex >= tracks.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const [item] = tracks.splice(fromIndex, 1);
    tracks.splice(toIndex, 0, item);
    this.updatePlaylist(playlistId, { tracks });
  }

  private persistPlaylists(): void {
    writeJsonDebounced(STORAGE_KEYS.playlists, this.playlists, 400);
  }

  getRecentlyPlayed(): Track[] {
    return [...this.recents];
  }

  recordPlay(track: Track): void {
    this.recents = [stripStream(track), ...this.recents.filter((t) => t.id !== track.id)].slice(
      0,
      MAX_RECENTS
    );
    writeJsonDebounced(STORAGE_KEYS.recentlyPlayed, this.recents, 1000);
    this.notifyChanged();
  }

  async getSavedPlayback(): Promise<SavedPlaybackState> {
    return readJson<SavedPlaybackState>(STORAGE_KEYS.playbackState, {
      trackId: null,
      position: 0,
    });
  }

  savePlayback(trackId: string | null, position: number): void {
    writeJsonDebounced(
      STORAGE_KEYS.playbackState,
      { trackId, position: Math.floor(position) },
      2000
    );
  }

  getSearchHistory(): string[] {
    return [...this.searchHistory];
  }

  recordSearch(query: string): void {
    const q = query.trim();
    if (q.length < 2) return;
    this.searchHistory = [q, ...this.searchHistory.filter((s) => s !== q)].slice(0, 12);
    writeJsonDebounced(STORAGE_KEYS.searchHistory, this.searchHistory, 1000);
  }

  clearSearchHistory(): void {
    this.searchHistory = [];
    void writeJson(STORAGE_KEYS.searchHistory, []);
  }

  touchPlaylist(playlistId: string): void {
    const index = this.playlists.findIndex((p) => p.id === playlistId);
    if (index < 0) return;
    this.playlists[index] = { ...this.playlists[index], updatedAt: Date.now() };
    writeJsonDebounced(STORAGE_KEYS.playlists, this.playlists, 800);
    this.notifyChanged();
  }

  getHistory(): HistoryEntry[] {
    return [...this.history];
  }

  recordListen(track: Track): HistoryEntry {
    const entry: HistoryEntry = {
      id: `${track.id}:${Date.now()}`,
      track: stripStream(track),
      playedAt: Date.now(),
    };
    this.history = [entry, ...this.history].slice(0, MAX_HISTORY);
    writeJsonDebounced(STORAGE_KEYS.history, this.history, 1000);
    this.notifyChanged();
    return entry;
  }

  clearHistory(): void {
    this.history = [];
    writeJsonDebounced(STORAGE_KEYS.history, this.history, 200);
  }

  getSettings(): AppSettings {
    return { ...this.settings };
  }

  getProfile(): UserProfile {
    return { ...this.settings.profile };
  }

  hasProfile(): boolean {
    return this.settings.profile.completed;
  }

  saveProfile(patch: Partial<UserProfile>): UserProfile {
    this.settings = {
      ...this.settings,
      profile: { ...this.settings.profile, ...patch },
    };
    void writeJson(STORAGE_KEYS.settings, this.settings);
    return this.getProfile();
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    // Never allow clearing all endpoints — fall back to defaults
    if (patch.resolverEndpoints !== undefined) {
      const next = patch.resolverEndpoints.filter(
        (e) => e && typeof e.url === 'string' && e.url.startsWith('http')
      );
      patch = {
        ...patch,
        resolverEndpoints: next.length > 0 ? next : DEFAULT_RESOLVER_ENDPOINTS,
      };
    }
    this.settings = { ...this.settings, ...patch };
    void writeJson(STORAGE_KEYS.settings, this.settings);
    return this.getSettings();
  }
}

function stripStream(track: Track): Track {
  if (!track.audioUrl) return track;
  const { audioUrl, ...rest } = track;
  return rest;
}

export const LibraryService = new LibraryServiceImpl();
