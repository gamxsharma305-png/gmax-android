/**
 * Library — playlists, offline registry, settings, history.
 */
import { Playlist, Track } from '../core/types';
import { readJson, writeJsonDebounced, STORAGE_KEYS } from '../core/storage';
import {
  downloadTrackAudio,
  localFileExists,
  removeOfflineFile,
  findOfflineFileOnDisk,
} from './OfflineService';

export type AppSettings = {
  volume: number;
  autoplayRelated: boolean;
  resolverEndpoints: { url: string; kind: string }[];
  profile?: { name: string; gender: string; completed: boolean };
  preferAudioOnly?: boolean;
  themeMode?: string;
  accentColor?: string;
  language?: string;
  audioQuality?: string;
  showQualityBadge?: boolean;
  gapless?: boolean;
  crossfade?: boolean;
  glassTabBar?: boolean;
  voiceAssistantEnabled?: boolean;
  voiceAutoListen?: boolean;
};

const OFFLINE_PLAYLIST_NAME = 'Downloads';

const DEFAULT_SETTINGS: AppSettings = {
  volume: 1,
  autoplayRelated: true,
  resolverEndpoints: [],
};

function stripStream(t: Track): Track {
  const { audioUrl, streamUrl, ...rest } = t as Track & { streamUrl?: string };
  return { ...rest };
}

function uid(): string {
  return `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyPlaylist(name: string, tracks: Track[] = []): Playlist {
  return {
    id: uid(),
    name,
    description: '',
    creator: '',
    coverImageUrl: '',
    tracks,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

class LibraryServiceImpl {
  private playlists: Playlist[] = [];
  private recents: Track[] = [];
  private settings: AppSettings = { ...DEFAULT_SETTINGS };
  private listeners = new Set<() => void>();
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const [pls, rec, set] = await Promise.all([
        readJson<Playlist[]>(STORAGE_KEYS.playlists, []),
        readJson<Track[]>(STORAGE_KEYS.recentlyPlayed, []),
        readJson<Partial<AppSettings>>(STORAGE_KEYS.settings, {}),
      ]);
      this.playlists = Array.isArray(pls) ? pls : [];
      this.recents = Array.isArray(rec) ? rec : [];
      this.settings = { ...DEFAULT_SETTINGS, ...(set || {}) };
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
      try { cb(); } catch { /* ok */ }
    }
  }

  getPlaylists(): Playlist[] {
    return [...this.playlists];
  }

  getPlaylist(id: string): Playlist | undefined {
    return this.playlists.find((p) => p.id === id);
  }

  createPlaylist(name: string): Playlist {
    const pl = emptyPlaylist(name.trim() || 'Playlist');
    this.playlists.push(pl);
    this.persistPlaylists();
    this.notifyChanged();
    return pl;
  }

  renamePlaylist(id: string, name: string): void {
    const pl = this.playlists.find((p) => p.id === id);
    if (!pl || pl.name === OFFLINE_PLAYLIST_NAME) return;
    pl.name = name.trim() || pl.name;
    pl.updatedAt = Date.now();
    this.persistPlaylists();
    this.notifyChanged();
  }

  deletePlaylist(id: string): void {
    const pl = this.playlists.find((p) => p.id === id);
    if (!pl || pl.name === OFFLINE_PLAYLIST_NAME) return;
    this.playlists = this.playlists.filter((p) => p.id !== id);
    this.persistPlaylists();
    this.notifyChanged();
  }

  addToPlaylist(playlistId: string, tracks: Track | Track[]): void {
    const pl = this.playlists.find((p) => p.id === playlistId);
    if (!pl) return;
    const list = Array.isArray(tracks) ? tracks : [tracks];
    for (const t of list) {
      if (!pl.tracks.some((x) => x.id === t.id)) {
        pl.tracks.push(stripStream(t));
      }
    }
    pl.updatedAt = Date.now();
    this.persistPlaylists();
    this.notifyChanged();
  }

  removeFromPlaylist(playlistId: string, trackId: string): void {
    const pl = this.playlists.find((p) => p.id === playlistId);
    if (!pl) return;
    pl.tracks = pl.tracks.filter((t) => t.id !== trackId);
    pl.updatedAt = Date.now();
    this.persistPlaylists();
    this.notifyChanged();
  }

  registerOffline(track: Track, localUri: string): void {
    if (!localUri) return;
    const offlineTrack: Track = { ...stripStream(track), localUri };
    let pl = this.playlists.find((p) => p.name === OFFLINE_PLAYLIST_NAME);
    if (!pl) {
      pl = emptyPlaylist(OFFLINE_PLAYLIST_NAME);
      this.playlists.unshift(pl);
    }
    const idx = pl.tracks.findIndex((t) => t.id === track.id);
    if (idx < 0) pl.tracks.push(offlineTrack);
    else pl.tracks[idx] = { ...pl.tracks[idx], localUri };
    pl.updatedAt = Date.now();
    this.persistPlaylists();
    this.notifyChanged();
  }

  async downloadAndRegister(
    track: Track,
    signal?: AbortSignal
  ): Promise<{ playlistId: string; alreadyHad: boolean; localUri: string }> {
    const { localUri, alreadyHad: fileHad } = await downloadTrackAudio(track, signal);
    const offlineTrack: Track = { ...stripStream(track), localUri };
    let pl = this.playlists.find((p) => p.name === OFFLINE_PLAYLIST_NAME);
    if (!pl) {
      pl = emptyPlaylist(OFFLINE_PLAYLIST_NAME, [offlineTrack]);
      this.playlists.unshift(pl);
      this.persistPlaylists();
      this.notifyChanged();
      return { playlistId: pl.id, alreadyHad: false, localUri };
    }
    const idx = pl.tracks.findIndex((t) => t.id === track.id);
    if (idx < 0) pl.tracks.push(offlineTrack);
    else pl.tracks[idx] = { ...pl.tracks[idx], localUri };
    pl.updatedAt = Date.now();
    this.persistPlaylists();
    this.notifyChanged();
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
    this.notifyChanged();
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
    this.notifyChanged();
  }

  getSettings(): AppSettings {
    return { ...this.settings };
  }

  updateSettings(partial: Partial<AppSettings>): void {
    this.settings = { ...this.settings, ...partial };
    writeJsonDebounced(STORAGE_KEYS.settings, this.settings, 300);
    this.notifyChanged();
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
}

export const LibraryService = new LibraryServiceImpl();
