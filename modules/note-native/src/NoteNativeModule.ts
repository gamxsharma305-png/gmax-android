import { NativeModule, requireOptionalNativeModule } from 'expo';

import { NativeStreamResult, PlatformInfo } from './NoteNative.types';

declare class NoteNativeModule extends NativeModule<{}> {
  getPlatformInfo(): PlatformInfo;
  resolveYouTubeStream(videoId: string): Promise<NativeStreamResult>;
}

export default requireOptionalNativeModule<NoteNativeModule>('NoteNative');
