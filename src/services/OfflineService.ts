import * as FileSystem from 'expo-file-system';
import { Track } from '../core/types';
import { MusicService } from './MusicService';

const DIR = `${FileSystem.documentDirectory}gmax-offline/`;

function safeName(trackId: string): string {
  return trackId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
  }
}

export type DownloadResult = {
  localUri: string;
  alreadyHad: boolean;
};

/**
 * Resolve stream → download audio bytes to app documents → return file:// URI.
 * Playback can then use localUri without network.
 */
export async function downloadTrackAudio(
  track: Track,
  signal?: AbortSignal
): Promise<DownloadResult> {
  await ensureDir();

  const path = `${DIR}${safeName(track.id)}.m4a`;
  const existing = await FileSystem.getInfoAsync(path);
  if (existing.exists && (existing.size ?? 0) > 10_000) {
    return { localUri: path, alreadyHad: true };
  }

  // Prefer existing local if track already has it
  if (track.localUri) {
    const t = await FileSystem.getInfoAsync(track.localUri);
    if (t.exists && (t.size ?? 0) > 10_000) {
      return { localUri: track.localUri, alreadyHad: true };
    }
  }

  const stream = await MusicService.resolveStream(track, signal);
  if (signal?.aborted) throw new Error('Download cancelled');

  // file:// or already-local — nothing to fetch
  if (stream.url.startsWith('file://') || stream.url.startsWith(FileSystem.documentDirectory ?? 'file://')) {
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
  if (!uri) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return !!info.exists && (info.size ?? 0) > 5_000;
  } catch {
    return false;
  }
}

export async function removeOfflineFile(uri?: string | null): Promise<void> {
  if (!uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    /* ok */
  }
}
