/**
 * Offline audio download — YouTube only (Musify / youtube_explode pattern).
 * Uses NewPipe progressive audio for the same video id.
 * Does NOT replace the song with a Saavn/Audius title match.
 */
import { Track } from '../core/types';
import { MusicService } from './MusicService';

type FSModule = {
  documentDirectory: string | null;
  getInfoAsync: (uri: string) => Promise<{ exists: boolean; size?: number }>;
  makeDirectoryAsync: (uri: string, opts?: { intermediates?: boolean }) => Promise<void>;
  downloadAsync: (
    url: string,
    fileUri: string,
    opts?: { headers?: Record<string, string> }
  ) => Promise<{ uri: string; status: number; headers?: Record<string, string> }>;
  deleteAsync: (uri: string, opts?: { idempotent?: boolean }) => Promise<void>;
};

let FileSystem: FSModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  FileSystem = require('expo-file-system/legacy') as FSModule;
} catch {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    FileSystem = require('expo-file-system') as FSModule;
  } catch {
    FileSystem = null;
  }
}

function offlineDir(): string {
  const base = FileSystem?.documentDirectory;
  if (!base) throw new Error('File system unavailable');
  return `${base}gmax-offline/`;
}

function safeName(trackId: string): string {
  return trackId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

/** Minimum bytes for a "complete" download. */
function minBytesFor(track: Track): number {
  const dur = Number(track.duration) || 0;
  // ~48 kbps floor × duration, at least 60 KB
  if (dur > 0) return Math.max(60_000, Math.floor(dur * 6_000));
  return 60_000;
}

async function ensureDir(): Promise<void> {
  if (!FileSystem) throw new Error('File system unavailable');
  const dir = offlineDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

export type DownloadResult = {
  localUri: string;
  alreadyHad: boolean;
  /** Which YouTube video was saved */
  youtubeId?: string;
};

async function downloadUrlToPath(
  url: string,
  path: string,
  headers: Record<string, string>,
  minBytes: number
): Promise<void> {
  if (!FileSystem) throw new Error('File system unavailable');

  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    /* ok */
  }

  const result = await FileSystem.downloadAsync(url, path, { headers });

  if (result.status < 200 || result.status >= 300) {
    try {
      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch {
      /* ok */
    }
    throw new Error(`Download failed (${result.status})`);
  }

  const info = await FileSystem.getInfoAsync(path);
  const size = info.size ?? 0;

  const clRaw =
    result.headers?.['Content-Length'] ||
    result.headers?.['content-length'] ||
    '';
  const contentLength = Number(clRaw);
  if (Number.isFinite(contentLength) && contentLength > 0 && size < contentLength * 0.92) {
    try {
      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch {
      /* ok */
    }
    throw new Error('Incomplete download — retry');
  }

  if (!info.exists || size < minBytes) {
    try {
      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch {
      /* ok */
    }
    throw new Error('Incomplete download — file too small');
  }
}

/**
 * Download THIS song from YouTube (same video / title match on YT only).
 * Never swaps to Saavn or another provider's different track.
 */
export async function downloadTrackAudio(
  track: Track,
  signal?: AbortSignal
): Promise<DownloadResult> {
  if (!FileSystem) {
    throw new Error('Offline download needs a rebuild with expo-file-system');
  }

  await ensureDir();
  const dir = offlineDir();
  // Key by original track id so library links stay stable
  const path = `${dir}${safeName(track.id)}.m4a`;
  const minBytes = minBytesFor(track);

  const existing = await FileSystem.getInfoAsync(path);
  if (existing.exists && (existing.size ?? 0) >= minBytes) {
    return { localUri: path, alreadyHad: true };
  }

  if (track.localUri) {
    const t = await FileSystem.getInfoAsync(track.localUri);
    if (t.exists && (t.size ?? 0) >= minBytes) {
      return { localUri: track.localUri, alreadyHad: true };
    }
  }

  // YouTube-only stream (NewPipe progressive audio)
  const stream = await MusicService.resolveStreamForOffline(track, signal);
  if (signal?.aborted) throw new Error('Download cancelled');

  const doc = FileSystem.documentDirectory ?? '';
  if (stream.url.startsWith('file://') || (doc && stream.url.startsWith(doc))) {
    return { localUri: stream.url, alreadyHad: true };
  }

  const headers: Record<string, string> = {
    'User-Agent':
      stream.headers?.['User-Agent'] ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: '*/*',
    ...(stream.headers || {}),
  };

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Fresh URL each retry (YouTube URLs expire / can truncate once)
      const s =
        attempt === 0 ? stream : await MusicService.resolveStreamForOffline(track, signal);
      await downloadUrlToPath(s.url, path, { ...headers, ...(s.headers || {}) }, minBytes);
      return {
        localUri: path,
        alreadyHad: false,
        youtubeId: track.provider === 'youtube' ? track.sourceId : undefined,
      };
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (signal?.aborted) throw new Error('Download cancelled');
    }
  }

  throw lastErr ?? new Error('YouTube download failed');
}

export async function localFileExists(uri?: string | null): Promise<boolean> {
  if (!uri || !FileSystem) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return !!info.exists && (info.size ?? 0) > 40_000;
  } catch {
    return false;
  }
}

export async function removeOfflineFile(uri?: string | null): Promise<void> {
  if (!uri || !FileSystem) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    /* ok */
  }
}

export function isOfflineSupported(): boolean {
  return FileSystem != null && !!FileSystem.documentDirectory;
}
