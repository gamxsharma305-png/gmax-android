/**
 * Offline audio download.
 * Prefers Saavn/Audius/direct CDN URLs (complete files, fast).
 * YouTube progressive URLs often truncate — used only as last resort.
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

/** Minimum bytes for a "complete" download (avoid truncated last ~20s). */
function minBytesFor(track: Track): number {
  const dur = Number(track.duration) || 0;
  // ~64 kbps floor × duration, at least 80 KB
  if (dur > 0) return Math.max(80_000, Math.floor(dur * 8_000));
  return 80_000;
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
};

async function downloadUrlToPath(
  url: string,
  path: string,
  headers: Record<string, string>,
  minBytes: number
): Promise<void> {
  if (!FileSystem) throw new Error('File system unavailable');

  // Wipe any partial previous attempt
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

  // If server sent Content-Length, require full body
  const clRaw =
    result.headers?.['Content-Length'] ||
    result.headers?.['content-length'] ||
    '';
  const contentLength = Number(clRaw);
  if (Number.isFinite(contentLength) && contentLength > 0 && size < contentLength * 0.95) {
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
 * Resolve stream → download full audio → return file:// URI.
 * Prefers Saavn/CDN so files finish completely and quickly.
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

  // Prefer offline-friendly stream (Saavn/Audius/direct) — complete + fast
  const stream = await MusicService.resolveStreamForOffline(track, signal);
  if (signal?.aborted) throw new Error('Download cancelled');

  const doc = FileSystem.documentDirectory ?? '';
  if (stream.url.startsWith('file://') || (doc && stream.url.startsWith(doc))) {
    return { localUri: stream.url, alreadyHad: true };
  }

  const headers = stream.headers ?? {};
  let lastErr: Error | null = null;

  // Up to 2 attempts — incomplete YouTube bodies often succeed on Saavn retry path already
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await downloadUrlToPath(stream.url, path, headers, minBytes);
      return { localUri: path, alreadyHad: false };
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (signal?.aborted) throw new Error('Download cancelled');
    }
  }

  throw lastErr ?? new Error('Download failed');
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
