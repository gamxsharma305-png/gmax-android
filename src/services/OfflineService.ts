/**
 * Offline audio — YouTube only (Musify / NewPipe progressive audio).
 * Resumable download + size checks so files finish completely.
 */
import { Track } from '../core/types';
import { MusicService } from './MusicService';

type ProgressCb = (p: { written: number; total: number }) => void;

type FSModule = {
  documentDirectory: string | null;
  getInfoAsync: (uri: string) => Promise<{ exists: boolean; size?: number }>;
  makeDirectoryAsync: (uri: string, opts?: { intermediates?: boolean }) => Promise<void>;
  downloadAsync: (
    url: string,
    fileUri: string,
    opts?: { headers?: Record<string, string> }
  ) => Promise<{ uri: string; status: number; headers?: Record<string, string> }>;
  createDownloadResumable?: (
    url: string,
    fileUri: string,
    options?: { headers?: Record<string, string> },
    callback?: (progress: {
      totalBytesWritten: number;
      totalBytesExpectedToWrite: number;
    }) => void
  ) => {
    downloadAsync: () => Promise<
      { uri: string; status?: number; headers?: Record<string, string> } | undefined
    >;
  };
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

/** Soft floor — primary check is Content-Length match */
function minBytesFor(track: Track): number {
  const dur = Number(track.duration) || 0;
  if (dur > 0) return Math.max(40_000, Math.floor(dur * 4_000)); // ~32kbps floor
  return 40_000;
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
  youtubeId?: string;
};

const YT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function downloadUrlToPath(
  url: string,
  path: string,
  headers: Record<string, string>,
  minBytes: number,
  onProgress?: ProgressCb
): Promise<void> {
  if (!FileSystem) throw new Error('File system unavailable');

  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    /* ok */
  }

  // Prefer resumable — better for long YouTube progressive streams
  let status = 0;
  let respHeaders: Record<string, string> = {};

  if (FileSystem.createDownloadResumable) {
    const task = FileSystem.createDownloadResumable(
      url,
      path,
      { headers },
      (p) => {
        onProgress?.({
          written: p.totalBytesWritten,
          total: p.totalBytesExpectedToWrite,
        });
      }
    );
    const result = await task.downloadAsync();
    if (!result) throw new Error('Download returned empty');
    status = result.status ?? 200;
    respHeaders = (result.headers as Record<string, string>) || {};
  } else {
    const result = await FileSystem.downloadAsync(url, path, { headers });
    status = result.status;
    respHeaders = result.headers || {};
  }

  if (status < 200 || status >= 300) {
    try {
      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch {
      /* ok */
    }
    throw new Error(`Download failed (${status})`);
  }

  const info = await FileSystem.getInfoAsync(path);
  const size = info.size ?? 0;

  const clRaw =
    respHeaders['Content-Length'] ||
    respHeaders['content-length'] ||
    '';
  const contentLength = Number(clRaw);

  // If server announced size, require ~full body (Musify-style complete file)
  if (Number.isFinite(contentLength) && contentLength > 10_000) {
    if (size < contentLength * 0.98) {
      try {
        await FileSystem.deleteAsync(path, { idempotent: true });
      } catch {
        /* ok */
      }
      throw new Error(`Incomplete (${size}/${contentLength}) — retry`);
    }
  } else if (!info.exists || size < minBytes) {
    try {
      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch {
      /* ok */
    }
    throw new Error('Incomplete download — file too small');
  }
}

/**
 * Download THIS YouTube song fully (NewPipe progressive audio).
 * Never swaps to Saavn.
 */
export async function downloadTrackAudio(
  track: Track,
  signal?: AbortSignal,
  onProgress?: ProgressCb
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

  let lastErr: Error | null = null;

  // Up to 4 attempts with FRESH YouTube URL each time (URLs expire / truncate)
  for (let attempt = 0; attempt < 4; attempt++) {
    if (signal?.aborted) throw new Error('Download cancelled');
    try {
      const stream = await MusicService.resolveStreamForOffline(track, signal);
      if (signal?.aborted) throw new Error('Download cancelled');

      const doc = FileSystem.documentDirectory ?? '';
      if (stream.url.startsWith('file://') || (doc && stream.url.startsWith(doc))) {
        return { localUri: stream.url, alreadyHad: true };
      }

      const headers: Record<string, string> = {
        'User-Agent': stream.headers?.['User-Agent'] || YT_UA,
        Accept: '*/*',
        'Accept-Encoding': 'identity',
        Connection: 'keep-alive',
        ...(stream.headers || {}),
      };

      await downloadUrlToPath(stream.url, path, headers, minBytes, onProgress);
      return {
        localUri: path,
        alreadyHad: false,
        youtubeId: track.provider === 'youtube' ? track.sourceId : undefined,
      };
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (signal?.aborted) throw new Error('Download cancelled');
      // brief pause before re-resolving stream
      await new Promise((r) => setTimeout(r, 400 + attempt * 300));
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
