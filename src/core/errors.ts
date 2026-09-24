export type ErrorKind =
  | 'network'
  | 'rate_limited'
  | 'track_unavailable'
  | 'source_unavailable'
  | 'region_restricted'
  | 'invalid_playlist'
  | 'search_failed'
  | 'playback_failed'
  | 'timeout'
  | 'unknown';

export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly detail?: string;
  readonly retryable: boolean;

  constructor(
    kind: ErrorKind,
    message: string,
    opts: { detail?: string; retryable?: boolean; cause?: unknown } = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
    this.detail = opts.detail;
    this.retryable = opts.retryable ?? DEFAULT_RETRYABLE[kind];
    if (opts.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }
}

const DEFAULT_RETRYABLE: Record<ErrorKind, boolean> = {
  network: true,
  rate_limited: true,
  track_unavailable: false,
  source_unavailable: true,
  region_restricted: false,
  invalid_playlist: false,
  search_failed: true,
  playback_failed: true,
  timeout: true,
  unknown: true,
};

const MESSAGES: Record<ErrorKind, string> = {
  network: "Can't reach the network. Check your connection.",
  rate_limited: 'Too many requests. Give it a moment.',
  track_unavailable: 'This track is unavailable.',
  source_unavailable: 'No playback source available for this track.',
  region_restricted: "This track isn't available in your region.",
  invalid_playlist: "That doesn't look like a valid playlist.",
  search_failed: "Search didn't work. Try again.",
  playback_failed: "Couldn't play this track.",
  timeout: 'That took too long. Try again.',
  unknown: 'Something went wrong.',
};

export const messageFor = (e: unknown): string => {
  if (e instanceof AppError) return e.message || MESSAGES[e.kind];
  return MESSAGES.unknown;
};

export const isRetryable = (e: unknown): boolean =>
  e instanceof AppError ? e.retryable : true;

export function toAppError(e: unknown, fallback: ErrorKind = 'unknown'): AppError {
  if (e instanceof AppError) return e;

  const raw = e instanceof Error ? e.message : String(e);

  if (e instanceof Error && e.name === 'AbortError') {
    return new AppError('timeout', MESSAGES.timeout, { detail: raw, cause: e });
  }
  if (/network request failed|fetch failed|failed to fetch|networkerror|enotfound|econnrefused|econnreset|etimedout|dns/i.test(raw)) {
    return new AppError('network', MESSAGES.network, { detail: raw, cause: e });
  }

  return new AppError(fallback, MESSAGES[fallback], { detail: raw, cause: e });
}

export const appError = (kind: ErrorKind, detail?: string) =>
  new AppError(kind, MESSAGES[kind], { detail });

export const appErrorWithMessage = (
  kind: ErrorKind,
  message: string,
  detail?: string
) => new AppError(kind, message, { detail });
