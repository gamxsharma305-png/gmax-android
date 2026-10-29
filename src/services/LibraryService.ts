import {
  readJson,
  writeJson,
  writeJsonDebounced,
  STORAGE_KEYS,
} from '../core/storage';
import { Playlist, Track } from '../core/types';
import {
  downloadTrackAudio,
  localFileExists,
  removeOfflineFile,
  findOfflineFileOnDisk,
} from './OfflineService';

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

export type ThemeMode = 'dark' | 'light' | 'system';
export type AudioQuality = 'auto' | 'high' | 'medium' | 'low';
export type AppLanguage = 'en' | 'hi';

export type AppSettings = {
  profile: UserProfile;
  resolverEndpoints: ResolverEndpoint[];
  volume: number;
  preferAudioOnly: boolean;
  autoplayRelated: boolean;
  themeMode: ThemeMode;
  accentColor: string;
  language: AppLanguage;
  audioQuality: AudioQuality;
  showQualityBadge: boolean;
  gapless: boolean;
  crossfade: boolean;
  glassTabBar: boolean;
  voiceAssistantEnabled: boolean;
  voiceAutoListen: boolean;
};

export type HistoryEntry = {
  id: string;
  track: Track;
  playedAt: number;
};

const OFFLINE_PLAYLIST_NAME = 'Downloads';

const DEFAULT_SETTINGS: AppSettings = {
  profile: { ...DEFAULT_PROFILE },
  resolverEndpoints: [],
  volume: 1,
  preferAudioOnly: true,
  autoplayRelated: true,
  themeMode: 'dark',
  accentColor: '#1DB954',
  language: 'en',
  audioQuality: 'auto',
  showQualityBadge: false,
  gapless: false,
  crossfade: false,
  glassTabBar: false,
  voiceAssistantEnabled: false,
  voiceAutoListen: false,
};

function stripStream(t: Track): Track {
  const { audioUrl, streamUrl, ...rest } = t as Track & { streamUrl?: string };
  return { ...rest };
}

function uid(prefix = 'pl'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyPlaylist(
  name: string,
  opts?: {
    tracks?: Track[];
    description?: string;
    creator?: string;
    coverImageUrl?: string;
    source?: Playlist['source'];
  }
): Playlist {
  return {
    id: uid(),
    name,
    description: opts?.description ?? '',
    creator: opts?.creator ?? '',
    coverImageUrl: opts?.coverImageUrl ?? '',
    tracks: opts?.tracks ?? [],
    source: opts?.source,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

class LibraryServiceImpl {
  private liked: Track[] = [];
  private playlists: Playlist[] = [];
  private recents: Track[] = [];
  private history: HistoryEntry[] = [];
  private settings: AppSettings = { ...DEFAULT_SETTINGS, profile: { ...DEFAULT_PROFILE } };
  private listeners = new Set<() => void>();
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const [liked, pls, rec, hist, set] = await Promise.all([
        readJson<Track[]>(STORAGE_KEYS.likedTracks, []),
        readJson<Playlist[]>(STORAGE_KEYS.playlists, []),
        readJson<Track[]>(STORAGE_KEYS.recentlyPlayed, []),
        readJson<HistoryEntry[]>(STORAGE_KEYS.history, []),
        readJson<Partial<AppSettings>>(STORAGE_KEYS.settings, {}),
      ]);
      this.liked = Array.isArray(liked) ? liked : [];
      this.playlists = Array.isArray(pls) ? pls : [];
      this.recents = Array.isArray(rec) ? rec : [];
      this.history = Array.isArray(hist) ? hist : [];
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...(set || {}),
        profile: { ...DEFAULT_PROFILE, ...(set?.profile || {}) },
      };
      if (!this.playlists.find((p) => p.name === OFFLINE_PLAYLIST_NAME)) {
        this.playlists.unshift(emptyPlaylist(OFFLINE_PLAYLIST_NAME));
        this.persistPlaylists();
      }
    } catch {
      /* keep defaults */
    }
    this.loaded = true;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notifyChanged(): void {
    for (const cb of this.listeners) {
      try {
        cb();
      } catch {
        /* ok */
      }
    }
  }

  getLiked(): Track[] {
    return [...this.liked];
  }

  toggleLike(track: Track): boolean {
    const idx = this.liked.findIndex((t) => t.id === track.id);
    if (idx >= 0) {
      this.liked.splice(idx, 1);
      writeJsonDebounced(STORAGE_KEYS.likedTracks, this.liked, 300);
      this.notifyChanged();
      return false;
    }
    this.liked.unshift(stripStream(track));
    writeJsonDebounced(STORAGE_KEYS.likedTracks, this.liked, 300);
    this.notifyChanged();
    return true;
  }

  reorderLikedTracks(from: number, to: number): void {
    if (from < 0 || to < 0 || from >= this.liked.length || to >= this.liked.length) return;
    const [item] = this.liked.splice(from, 1);
    this.liked.splice(to, 0, item);
    writeJsonDebounced(STORAGE_KEYS.likedTracks, this.liked, 300);
    this.notifyChanged();
  }

  getPlaylists(): Playlist[] {
    return [...this.playlists];
  }

  getPlaylist(id: string): Playlist | undefined {
    return this.playlists.find((p) => p.id === id);
  }

  createPlaylist(
    name: string,
    meta?: {
      tracks?: Track[];
      description?: string;
      creator?: string;
      coverImageUrl?: string;
      source?: Playlist['source'];
    }
  ): Playlist {
    const pl = emptyPlaylist(name.trim() || 'Playlist', {
      tracks: (meta?.tracks || []).map(stripStream),
      description: meta?.description,
      creator: meta?.creator,
      coverImageUrl: meta?.coverImageUrl,
      source: meta?.source,
    });
    this.playlists.push(pl);
    this.persistPlaylists();
    this.notifyChanged();
    return pl;
  }

  updatePlaylist(id: string, patch: Partial<Omit<Playlist, 'id' | 'createdAt'>>): void {
    const pl = this.playlists.find((p) => p.id === id);
    if (!pl) return;
    if (pl.name === OFFLINE_PLAYLIST_NAME && patch.name && patch.name !== OFFLINE_PLAYLIST_NAME) {
      return;
    }
    Object.assign(pl, patch, { updatedAt: Date.now() });
    this.persistPlaylists();
    this.notifyChanged();
  }

  renamePlaylist(id: string, name: string): void {
    this.updatePlaylist(id, { name: name.trim() || 'Playlist' });
  }

  deletePlaylist(id: string): void {
    const pl = this.playlists.find((p) => p.id === id);
    if (!pl || pl.name === OFFLINE_PLAYLIST_NAME) return;
    this.playlists = this.playlists.filter((p) => p.id !== id);
    this.persistPlaylists();
    this.notifyChanged();
  }

  touchPlaylist(playlistId: string): void {
    this.updatePlaylist(playlistId, {});
  }

  addToPlaylist(playlistId: string, tracks: Track | Track[]): void {
    const pl = this.playlists.find((p) => p.id === playlistId);
    if (!pl) return;
    const list = Array.isArray(tracks) ? tracks : [tracks];
    const fresh = list.map(stripStream).filter((t) => !pl.tracks.some((x) => x.id === t.id));
    if (!fresh.length) return;
    this.updatePlaylist(playlistId, { tracks: [...pl.tracks, ...fresh] });
  }

  removeFromPlaylist(playlistId: string, trackId: string): void {
    const pl = this.playlists.find((p) => p.id === playlistId);
    if (!pl) return;
    this.updatePlaylist(playlistId, {
      tracks: pl.tracks.filter((t) => t.id !== trackId),
    });
  }

  reorderPlaylistTracks(playlistId: string, from: number, to: number): void {
    const pl = this.playlists.find((p) => p.id === playlistId);
    if (!pl) return;
    if (from < 0 || to < 0 || from >= pl.tracks.length || to >= pl.tracks.length) return;
    const tracks = [...pl.tracks];
    const [item] = tracks.splice(from, 1);
    tracks.splice(to, 0, item);
    this.updatePlaylist(playlistId, { tracks });
  }

  registerOffline(track: Track, localUri: string): void {
    if (!localUri) return;
    const offlineTrack: Track = { ...stripStream(track), localUri };
    let pl = this.playlists.find((p) => p.name === OFFLINE_PLAYLIST_NAME);
    if (!pl) {
      pl = this.createPlaylist(OFFLINE_PLAYLIST_NAME, { tracks: [offlineTrack] });
      return;
    }
    const idx = pl.tracks.findIndex((t) => t.id === track.id);
    const updated =
      idx < 0
        ? [...pl.tracks, offlineTrack]
        : pl.tracks.map((t, i) => (i === idx ? { ...t, localUri } : t));
    this.updatePlaylist(pl.id, { tracks: updated });
  }

  async downloadAndRegister(
    track: Track,
    signal?: AbortSignal
  ): Promise<{ playlistId: string; alreadyHad: boolean; localUri: string }> {
    const { localUri, alreadyHad: fileHad } = await downloadTrackAudio(track, signal);
    const offlineTrack: Track = { ...stripStream(track), localUri };
    let pl = this.playlists.find((p) => p.name === OFFLINE_PLAYLIST_NAME);
    if (!pl) {
      pl = this.createPlaylist(OFFLINE_PLAYLIST_NAME, { tracks: [offlineTrack] });
      return { playlistId: pl.id, alreadyHad: false, localUri };
    }
    const idx = pl.tracks.findIndex((t) => t.id === track.id);
    const updated =
      idx < 0
        ? [...pl.tracks, offlineTrack]
        : pl.tracks.map((t, i) => (i === idx ? { ...t, localUri } : t));
    this.updatePlaylist(pl.id, { tracks: updated });
    return { playlistId: pl.id, alreadyHad: fileHad && idx >= 0, localUri };
  }

  isOffline(trackId: string): boolean {
    const pl = this.playlists.find((p) => p.name === OFFLINE_PLAYLIST_NAME);
    return !!pl?.tracks.some((t) => t.id === trackId && !!t.localUri);
  }

  getOfflineTrack(trackId: string): Track | undefined {
    const pl = this.playlists.find((p) => p.name === OFFLINE_PLAYLIST_NAME);
    return pl?.tracks.find((t) => t.id === trackId);
  }

  async hasOfflineFile(trackId: string): Promise<boolean> {
    const t = this.getOfflineTrack(trackId);
    if (t?.localUri && (await localFileExists(t.localUri))) return true;
    const disk = await findOfflineFileOnDisk(trackId);
    if (disk) {
      if (t) this.registerOffline(t, disk);
      return true;
    }
    return false;
  }

  async resolveOfflineUri(trackId: string): Promise<string | undefined> {
    const t = this.getOfflineTrack(trackId);
    if (t?.localUri && (await localFileExists(t.localUri))) return t.localUri;
    const disk = await findOfflineFileOnDisk(trackId);
    if (disk) {
      if (t) this.registerOffline({ ...t, id: trackId }, disk);
      return disk;
    }
    return undefined;
  }

  async removeOffline(trackId: string): Promise<void> {
    const pl = this.playlists.find((p) => p.name === OFFLINE_PLAYLIST_NAME);
    if (!pl) return;
    const t = pl.tracks.find((x) => x.id === trackId);
    if (t?.localUri) await removeOfflineFile(t.localUri);
    this.removeFromPlaylist(pl.id, trackId);
  }

  private persistPlaylists(): void {
    writeJsonDebounced(STORAGE_KEYS.playlists, this.playlists, 400);
  }

  getRecentlyPlayed(): Track[] {
    return [...this.recents];
  }

  recordPlay(_track: Track): void {}

  recordListen(track: Track): void {
    const clean = stripStream(track);
    this.recents = [clean, ...this.recents.filter((t) => t.id !== track.id)].slice(0, 50);
    writeJsonDebounced(STORAGE_KEYS.recentlyPlayed, this.recents, 400);
    this.history = [
      { id: uid('h'), track: clean, playedAt: Date.now() },
      ...this.history.filter((h) => h.track.id !== track.id),
    ].slice(0, 200);
    writeJsonDebounced(STORAGE_KEYS.history, this.history, 500);
    this.notifyChanged();
  }

  getHistory(): HistoryEntry[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
    writeJsonDebounced(STORAGE_KEYS.history, this.history, 200);
    this.notifyChanged();
  }

  recordSearch(_query: string): void {}

  getSettings(): AppSettings {
    return {
      ...this.settings,
      profile: { ...this.settings.profile },
      resolverEndpoints: [...this.settings.resolverEndpoints],
    };
  }

  updateSettings(partial: Partial<AppSettings>): void {
    this.settings = {
      ...this.settings,
      ...partial,
      profile: partial.profile
        ? { ...this.settings.profile, ...partial.profile }
        : this.settings.profile,
    };
    writeJsonDebounced(STORAGE_KEYS.settings, this.settings, 300);
    this.notifyChanged();
  }

  saveProfile(patch: Partial<UserProfile>): UserProfile {
    this.settings.profile = { ...this.settings.profile, ...patch };
    writeJsonDebounced(STORAGE_KEYS.settings, this.settings, 300);
    this.notifyChanged();
    return { ...this.settings.profile };
  }

  async getSavedPlayback(): Promise<{ trackId: string | null; position: number }> {
    try {
      const s = await readJson<{ trackId?: string; position?: number }>(
        STORAGE_KEYS.playbackState,
        {}
      );
      return { trackId: s.trackId ?? null, position: Number(s.position) || 0 };
    } catch {
      return { trackId: null, position: 0 };
    }
  }

  savePlayback(trackId: string, position: number): void {
    writeJsonDebounced(STORAGE_KEYS.playbackState, { trackId, position }, 800);
  }

  async importPlaylist(_raw: unknown): Promise<Playlist | null> {
    return null;
  }
}

export const LibraryService = new LibraryServiceImpl();
