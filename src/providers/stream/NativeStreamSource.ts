import { Platform } from 'react-native';
import {
  NativeStreamFailureReason,
  resolveYouTubeStream,
} from '../../../modules/note-native';
import { AppError, appError, appErrorWithMessage } from '../../core/errors';
import { ResolvedStream, Track } from '../../core/types';
import { StreamSource } from './StreamResolver';

const FALLBACK_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const STREAM_TTL = 4 * 60 * 60 * 1000;

function expiryFor(url: string): number {
  const fallback = Date.now() + STREAM_TTL;

  const match = /[?&]expire=(\d+)/.exec(url);
  if (!match) return fallback;

  const epochSeconds = Number(match[1]);
  if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) return fallback;

  const expiresAt = epochSeconds * 1000 - 60_000;
  return expiresAt > Date.now() ? Math.min(expiresAt, fallback) : fallback;
}

function toAppErrorFor(reason: NativeStreamFailureReason, message: string): AppError {
  switch (reason) {
    case 'geo_restricted':
      return appError('region_restricted', message);

    case 'private_content':
    case 'unavailable':
    case 'age_restricted':
    case 'paid_content':
    case 'sign_in_required':
      return appError('track_unavailable', message);

    case 'live_stream':
      return appErrorWithMessage(
        'source_unavailable',
        "Live streams can't be played yet.",
        message
      );

    case 'rate_limited':
      return appError('rate_limited', message);

    case 'network':
      return appError('network', message);

    case 'no_audio_stream':
    case 'unsupported':
    case 'extraction_failed':
    case 'invalid_id':
    case 'module_unavailable':
    case 'unknown':
    default:
      return appError('source_unavailable', message);
  }
}

export class NativeStreamSource implements StreamSource {
  readonly id = 'native-newpipe';

  canHandle(track: Track): boolean {
    return Platform.OS === 'android' && track.provider === 'youtube' && !!track.sourceId;
  }

  async resolve(track: Track, signal?: AbortSignal): Promise<ResolvedStream> {
    if (signal?.aborted) throw appError('timeout');

    const result = await resolveYouTubeStream(track.sourceId);

    if (signal?.aborted) throw appError('timeout');

    if (!result.ok) {
      if (__DEV__) {
        console.log(
          `[NativeStreamSource] ${track.sourceId} failed:`,
          result.reason,
          result.message,
          result.exception ?? ''
        );
      }
      throw toAppErrorFor(result.reason, result.message);
    }

    if (__DEV__) {
      console.log('[NativeStreamSource] resolved', {
        sourceId: track.sourceId,
        title: result.title,
        mimeType: result.mimeType,
        bitrate: result.bitrate,
        durationSeconds: result.durationSeconds,
        extractor: result.extractor,
      });
    }

    return {
      url: result.url,
      mimeType: result.mimeType,
      bitrate: result.bitrate,
      expiresAt: expiryFor(result.url),
      resolvedBy: this.id,
      headers: { 'User-Agent': result.userAgent ?? FALLBACK_USER_AGENT },
    };
  }
}
