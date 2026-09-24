import NoteNativeModule from './src/NoteNativeModule';
import { NativeStreamResult, PlatformInfo } from './src/NoteNative.types';

export * from './src/NoteNative.types';
export { default as NoteNativeModule } from './src/NoteNativeModule';

export function isNoteNativeAvailable(): boolean {
  return NoteNativeModule != null;
}

export function getPlatformInfo(): PlatformInfo | null {
  return NoteNativeModule?.getPlatformInfo() ?? null;
}

export async function resolveYouTubeStream(
  videoId: string
): Promise<NativeStreamResult> {
  const module = NoteNativeModule;
  if (!module) {
    return {
      ok: false,
      reason: 'module_unavailable',
      message: 'NoteNative is not present in this binary',
    };
  }

  try {
    return await module.resolveYouTubeStream(videoId);
  } catch (e) {
    return {
      ok: false,
      reason: 'unknown',
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
