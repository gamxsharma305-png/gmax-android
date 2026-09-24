import { registerWebModule, NativeModule } from 'expo';

import { NativeStreamResult, PlatformInfo } from './NoteNative.types';

class NoteNativeModule extends NativeModule<{}> {
  getPlatformInfo(): PlatformInfo {
    return { platform: 'web', version: '0' };
  }

  async resolveYouTubeStream(_videoId: string): Promise<NativeStreamResult> {
    return {
      ok: false,
      reason: 'module_unavailable',
      message: 'NoteNative is not available on web',
    };
  }
}

export default registerWebModule(NoteNativeModule, 'NoteNative');
