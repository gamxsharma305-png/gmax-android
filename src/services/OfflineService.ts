/**
 * Offline audio — YouTube only (Musify-style).
 *
 * Primary: native NoteNative.downloadYouTubeAudio
 *   → NewPipe audio streams → full byte pipe to file (Range resume)
 * Fallback: JS progressive download with Content-Length checks
 *
 * localUri is always a file:// URI that expo-audio can play offline.
 */
import { Platform } from 'react-native';
import { Track } from '../core/types';
import { MusicService } from './MusicService';
import {
  downloadYouTubeAudio as nativeDownloadYouTubeAudio,
  isNoteNativeAvailable,
} from '../../modules/note-native';

export type ProgressCb = (p: {
  written: number;
  total: number;
  /** 0–1 when total known */
  ratio?: number;
}) => void;

export type DownloadResult = {
  localUri: string;
  alreadyHad: boolean;
  youtubeId?: string;
  bytes?: number;
};

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
  moveAsync?: (opts: { from: string; to: string }) => Promise<void>;
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

const YT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** ~96 kbps × seconds × 0.70 — rejects half/stub files (Musify-style) */
function minBytesFor(track: Track, bitrateKbps = 96): number {
  const dur = Number(track.duration) || 0;
  if (dur > 0) {
    const expected = Math.floor(bitrateKbps * 125 * dur * 0.7);
    return Math.max(100_000, expected);
  }
  return 800_000;
}

function offlineDir(): string {
  const base = FileSystem?.documentDirectory;
  if (!base) throw new Error('File system unavailable');
  return `${base}gmax-offline/`;
}

function safeName(trackId: string): string {
  return trackId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function toAbsolutePath(fileUri: string): string {
  if (fileUri.startsWith('file://')) return fileUri.replace(/^file:\/\/\/, '');
  return fileUri;
}

function toFileUri(pathOrUri: string): string {
  if (pathOrUri.startsWith('file://')) return pathOrUri;
  return `file://${pathOrUri.startsWith('/') ? pathOrUri : `/${pathOrUri}`}`;
}

function extForMime(mime?: string | null): string {
  const m = (mime || '').toLowerCase();
  if (m.includes('webm') || m.includes('opus')) return 'webm';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  return 'm4a';
}

async function ensureDir(): Promise<void> {
  if (!FileSystem) throw new Error('File system unavailable');
  const dir = offlineDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function fileSize(uri: string): Promise<number> {
  if (!FileSystem) return 0;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return 0;
    return info.size ?? 0;
  } catch {
    return 0;
  }
}

async function deleteQuiet(uri: string): Promise<void> {
  if (!FileSystem) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    /* ok */
  }
}

/**
 * One-track full YouTube offline download (Musify makeSongOffline equivalent).
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
  const baseName = safeName(track.id);
  let path = `${dir}${baseName}.m4a`;
  const minBytes = minBytesFor(track);

  for (const ext of ['m4a', 'webm', 'mp3', 'mp4']) {
    const candidate = `${dir}${baseName}.${ext}`;
    const size = await fileSize(candidate);
    if (size >= minBytes) {
      onProgress?.({ written: size, total: size, ratio: 1 });
      return { localUri: toFileUri(candidate), alreadyHad: true, bytes: size };
    }
  }
  if (track.localUri) {
    const size = await fileSize(track.localUri);
    if (size >= minBytes) {
      return { localUri: toFileUri(track.localUri), alreadyHad: true, bytes: size };
    }
  }

  if (signal?.aborted) throw new Error('Download cancelled');

  const ytTrack = await MusicService.resolveYouTubeTrackForOffline(track, signal);
  const videoId = ytTrack.sourceId;
  if (!videoId) throw new Error('No YouTube video id for this track');

  if (Platform.OS === 'android' && isNoteNativeAvailable()) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (signal?.aborted) throw new Error('Download cancelled');
      try {
        // Resume: only wipe tiny/corrupt stubs; keep partial for native Range resume
        if (attempt === 0) {
          const existing = await fileSize(path);
          if (existing > 0 && existing < Math.min(minBytes, 80_000)) {
            await deleteQuiet(path);
          }
        }

        const abs = toAbsolutePath(path);
        const result = await nativeDownloadYouTubeAudio(videoId, abs);

        if (result.ok) {
          let finalPath = path;
          const mime = result.mimeType as string | undefined;
          const wantExt = extForMime(mime);
          if (!finalPath.endsWith(`.${wantExt}`)) {
            const renamed = `${dir}${baseName}.${wantExt}`;
            try {
              if (FileSystem.moveAsync) {
                await FileSystem.moveAsync({ from: path, to: renamed });
                const movedSize = await fileSize(renamed);
                if (movedSize > 0) finalPath = renamed;
              }
            } catch {
              /* keep path */
            }
          }

          const size = (await fileSize(finalPath)) || Number(result.bytes) || 0;
          // STRICT: no soft pass on 200KB — half downloads must not count as success
          if (size >= minBytes) {
            onProgress?.({ written: size, total: size, ratio: 1 });
            return {
              localUri: toFileUri(finalPath),
              alreadyHad: false,
              youtubeId: videoId,
              bytes: size,
            };
          }
          if (size < 80_000) {
            await deleteQuiet(finalPath);
          }
          if (__DEV__) {
            console.warn('[Offline] native incomplete', size, 'need', minBytes);
          }
        } else if (__DEV__) {
          console.warn('[Offline] native fail', result.reason, result.message);
        }
      } catch (e) {
        if (__DEV__) console.warn('[Offline] native error', attempt, e);
      }
      await new Promise((r) => setTimeout(r, 700 + attempt * 500));
    }
  }

  if (signal?.aborted) throw new Error('Download cancelled');

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new Error('Download cancelled');
    try {
      const stream = await MusicService.resolveStreamForOffline(ytTrack, signal);
      const doc = FileSystem.documentDirectory ?? '';
      if (
        stream.url.startsWith('file://') ||
        (doc && stream.url.startsWith(doc))
      ) {
        return { localUri: toFileUri(stream.url), alreadyHad: true };
      }

      const headers: Record<string, string> = {
        'User-Agent': stream.headers?.['User-Agent'] || YT_UA,
        Accept: '*/*',
        'Accept-Encoding': 'identity',
        Connection: 'keep-alive',
        Referer: 'https://www.youtube.com/',
        ...(stream.headers || {}),
      };

      await deleteQuiet(path);
      await downloadUrlToPath(stream.url, path, headers, minBytes, onProgress);

      const size = await fileSize(path);
      return {
        localUri: toFileUri(path),
        alreadyHad: false,
        youtubeId: videoId,
        bytes: size,
      };
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      await new Promise((r) => setTimeout(r, 500 + attempt * 400));
    }
  }

  throw lastErr ?? new Error('YouTube download failed');
}

async function downloadUrlToPath(
  url: string,
  path: string,
  headers: Record<string, string>,
  minBytes: number,
  onProgress?: ProgressCb
): Promise<void> {
  if (!FileSystem) throw new Error('File system unavailable');

  let status = 0;
  let respHeaders: Record<string, string> = {};

  if (FileSystem.createDownloadResumable) {
    const task = FileSystem.createDownloadResumable(
      url,
      path,
      { headers },
      (p) => {
        const total = p.totalBytesExpectedToWrite || 0;
        onProgress?.({
          written: p.totalBytesWritten,
          total,
          ratio: total > 0 ? p.totalBytesWritten / total : undefined,
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
    await deleteQuiet(path);
    throw new Error(`Download failed (${status})`);
  }

  const size = await fileSize(path);
  const clRaw =
    respHeaders['Content-Length'] || respHeaders['content-length'] || '';
  const contentLength = Number(clRaw);

  if (Number.isFinite(contentLength) && contentLength > 50_000) {
    if (size < contentLength * 0.96) {
      await deleteQuiet(path);
      throw new Error(
        `Incomplete download (${Math.round(size / 1000)}KB / ${Math.round(contentLength / 1000)}KB). Network weak — try again.`
      );
    }
  } else if (size < minBytes) {
    await deleteQuiet(path);
    throw new Error(
      `File too small (${Math.round(size / 1000)}KB). Need ~${Math.round(minBytes / 1000)}KB for this song.`
    );
  }
}

/** Musify-style concurrent playlist offline (max 2 workers — less fight with playback). */
export async function downloadTracksBatch(
  tracks: Track[],
  options: {
    concurrency?: number;
    signal?: AbortSignal;
    onTrackProgress?: (
      index: number,
      track: Track,
      state: 'start' | 'done' | 'skip' | 'fail',
      detail?: string
    ) => void;
    onOverall?: (done: number, failed: number, total: number) => void;
  } = {}
): Promise<{ completed: number; failed: number; results: DownloadResult[] }> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 2, 2));
  const list = tracks.filter(Boolean);
  let done = 0;
  let failed = 0;
  const results: DownloadResult[] = [];
  let cursor = 0;

  const worker = async () => {
    while (cursor < list.length) {
      if (options.signal?.aborted) break;
      const index = cursor++;
      const track = list[index];
      options.onTrackProgress?.(index, track, 'start');
      try {
        const r = await downloadTrackAudio(track, options.signal);
        results[index] = r;
        done++;
        options.onTrackProgress?.(index, track, r.alreadyHad ? 'skip' : 'done');
      } catch (e) {
        failed++;
        options.onTrackProgress?.(
          index,
          track,
          'fail',
          e instanceof Error ? e.message : String(e)
        );
      }
      options.onOverall?.(done, failed, list.length);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, list.length) }, () => worker())
  );

  return { completed: done, failed, results };
}

export async function localFileExists(uri?: string | null): Promise<boolean> {
  if (!uri || !FileSystem) return false;
  try {
    const size = await fileSize(uri);
    return size >= 120_000;
  } catch {
    return false;
  }
}

export async function removeOfflineFile(uri?: string | null): Promise<void> {
  if (!uri) return;
  await deleteQuiet(uri);
}

export function isOfflineSupported(): boolean {
  return FileSystem != null && !!FileSystem.documentDirectory;
}
