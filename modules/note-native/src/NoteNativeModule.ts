import { NativeModule, requireOptionalNativeModule } from 'expo';

import { NativeDownloadResult, NativeStreamResult, PlatformInfo } from './NoteNative.types';

declare class NoteNativeModule extends NativeModule<{}> {
  getPlatformInfo(): PlatformInfo;
  resolveYouTubeStream(videoId: string): Promise<NativeStreamResult>;
  downloadYouTubeAudio(videoId: string, destPath: string): Promise<NativeDownloadResult>;
}

export default requireOptionalNativeModule<NoteNativeModule>('NoteNative');
