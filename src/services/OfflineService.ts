/**
 * Offline audio download.
 * Uses expo-file-system LEGACY API (stable on SDK 57).
 * If the native module is missing, download fails gracefully — app still boots.
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
  ) => Promise<{ uri: string; status: number }>;
  deleteAsync: (uri: string, opts?: { idempotent?: boolean }) => Promise<void>;
};

let FileSystem: FSModule | null = null;
try {
  // Legacy entry is the supported path for documentDirectory / downloadAsync on SDK 57+
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

/**
 * Resolve stream → download audio to app documents → return file:// URI.
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

  const existing = await FileSystem.getInfoAsync(path);
  if (existing.exists && (existing.size ?? 0) > 10_000) {
    return { localUri: path, alreadyHad: true };
  }

  if (track.localUri) {
    const t = await FileSystem.getInfoAsync(track.localUri);
    if (t.exists && (t.size ?? 0) > 10_000) {
      return { localUri: track.localUri, alreadyHad: true };
    }
  }

  const stream = await MusicService.resolveStream(track, signal);
  if (signal?.aborted) throw new Error('Download cancelled');

  const doc = FileSystem.documentDirectory ?? '';
  if (stream.url.startsWith('file://') || (doc && stream.url.startsWith(doc))) {
    return { localUri: stream.url, alreadyHad: true };
  }

  const headers = stream.headers ?? {};
  const result = await FileSystem.downloadAsync(stream.url, path, { headers });

  if (result.status < 200 || result.status >= 300) {
    try {
      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch {
      /* ok */
    }
    throw new Error(`Download failed (${result.status})`);
  }

  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists || (info.size ?? 0) < 5_000) {
    try {
      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch {
      /* ok */
    }
    throw new Error('Downloaded file too small / empty');
  }

  return { localUri: path, alreadyHad: false };
}

export async function localFileExists(uri?: string | null): Promise<boolean> {
  if (!uri || !FileSystem) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return !!info.exists && (info.size ?? 0) > 5_000;
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
