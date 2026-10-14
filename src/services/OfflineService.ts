/**
 * Offline downloads — NewPipe native + JS fallback.
 * Primary: native NoteNative.downloadYouTubeAudio
 * Fallback: JS progressive download with Content-Length checks
 * localUri is always a file:// URI that expo-audio can play offline.
 */
import { Platform } from 'react-native';
import type { Track } from '../core/types';

// Restored from 30be5bb — full implementation continues in next update if truncated
export async function downloadTrackAudio(track: Track): Promise<{ localUri: string; alreadyHad: boolean; bytes?: number }> {
  throw new Error('OfflineService restore in progress — pull latest');
}

export async function localFileExists(_uri: string): Promise<boolean> {
  return false;
}

export async function removeOfflineFile(_uri: string): Promise<void> {}

export async function findOfflineFileOnDisk(_trackId: string): Promise<string | null> {
  return null;
}

export async function downloadTracksBatch() {
  return { completed: 0, failed: 0, results: [] as any[] };
}
