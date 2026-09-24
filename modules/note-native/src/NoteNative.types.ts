/** Result of `NoteNative.getPlatformInfo()`. */
export type PlatformInfo = {
  platform: string;
  native: boolean;
  androidSdkInt?: number;
};

export type NativeStreamFailureReason =
  | 'invalid_id'
  | 'unavailable'
  | 'private_content'
  | 'geo_restricted'
  | 'age_restricted'
  | 'paid_content'
  | 'sign_in_required'
  | 'live_stream'
  | 'no_audio_stream'
  | 'unsupported'
  | 'extraction_failed'
  | 'rate_limited'
  | 'network'
  | 'module_unavailable'
  | 'unknown';

export type NativeStreamSuccess = {
  ok: true;
  url: string;
  mimeType?: string;
  bitrate?: number;
  durationSeconds?: number;
  title?: string;
  uploader?: string;
  streamType?: string;
  extractor?: string;
  userAgent?: string;
};

export type NativeStreamFailure = {
  ok: false;
  reason: NativeStreamFailureReason;
  message: string;
  exception?: string | null;
};

export type NativeStreamResult = NativeStreamSuccess | NativeStreamFailure;
