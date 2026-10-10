import { fetchJson } from '../../core/http';
import { appError, appErrorWithMessage, AppError, toAppError } from '../../core/errors';
import { ResolvedStream, Track } from '../../core/types';
import { findOfflineFileOnDisk } from '../../services/OfflineService';
import { NativeStreamSource } from './NativeStreamSource';
import { TitleMatchStreamSource } from './TitleMatchStreamSource';

export interface StreamSource {
  readonly id: string;
  canHandle(track: Track): boolean;
  resolve(track: Track, signal?: AbortSignal): Promise<ResolvedStream>;
}

const STREAM_TTL = 4 * 60 * 60 * 1000;
const LOCAL_TTL = 10 * 365 * 24 * 60 * 60 * 1000;
/** Avoid re-scanning FS on every song switch */
const diskCache = new Map<string, { uri: string | null; at: number }>();
const DISK_CACHE_MS = 5 * 60 * 1000;

export class LocalStreamSource implements StreamSource {
  readonly id = 'local';
  canHandle(track: Track): boolean {
    return typeof track.localUri === 'string' && track.localUri.length > 0;
  }
  async resolve(track: Track): Promise<ResolvedStream> {
    return {
      url: track.localUri as string,
      expiresAt: Date.now() + LOCAL_TTL,
      resolvedBy: this.id,
    };
  }
}

export class DirectStreamSource implements StreamSource {
  readonly id = 'direct';
  canHandle(track: Track): boolean {
    return typeof track.audioUrl === 'string' && /^https?:\/\//.test(track.audioUrl);
  }
  async resolve(track: Track): Promise<ResolvedStream> {
    return {
      url: track.audioUrl as string,
      expiresAt: Date.now() + STREAM_TTL,
      resolvedBy: this.id,
    };
  }
}

type EndpointKind = 'invidious' | 'piped' | 'custom';
export type ResolverEndpoint = { url: string; kind: EndpointKind };
type AudioFormat = { url: string; mimeType?: string; bitrate?: number };

function bestAudio(formats: AudioFormat[]): AudioFormat | undefined {
  const audio = formats.filter((f) => f.url && /audio/i.test(f.mimeType ?? ''));
  const pool = audio.length ? audio : formats.filter((f) => f.url);
  return pool.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
}

function parseInvidious(body: any): AudioFormat[] {
  return ((body?.adaptiveFormats ?? []) as any[]).map((f) => ({
    url: f?.url,
    mimeType: f?.type ?? f?.mimeType,
    bitrate: Number(f?.bitrate) || 0,
  }));
}
function parsePiped(body: any): AudioFormat[] {
  return ((body?.audioStreams ?? []) as any[]).map((f) => ({
    url: f?.url,
    mimeType: f?.mimeType ?? `audio/${f?.format ?? 'mp4'}`,
    bitrate: Number(f?.bitrate) || 0,
  }));
}
function parseCustom(body: any): AudioFormat[] {
  if (typeof body?.url === 'string') return [{ url: body.url, mimeType: body.mimeType }];
  if (typeof body?.audioUrl === 'string') return [{ url: body.audioUrl }];
  if (Array.isArray(body?.formats)) {
    return body.formats.map((f: any) => ({
      url: f?.url,
      mimeType: f?.mimeType ?? f?.type,
      bitrate: Number(f?.bitrate) || 0,
    }));
  }
  return [...parseInvidious(body), ...parsePiped(body)];
}
function endpointUrl(endpoint: ResolverEndpoint, sourceId: string): string {
  const base = endpoint.url.replace(/\/+$/, '');
  switch (endpoint.kind) {
    case 'invidious': return `${base}/api/v1/videos/${sourceId}`;
    case 'piped': return `${base}/streams/${sourceId}`;
    default: return `${base}/resolve?id=${encodeURIComponent(sourceId)}`;
  }
}

export class EndpointStreamSource implements StreamSource {
  readonly id = 'endpoints';
  private endpoints: ResolverEndpoint[] = [];
  setEndpoints(endpoints: ResolverEndpoint[]): void {
    this.endpoints = endpoints.filter((e) => e?.url?.startsWith('http'));
  }
  getEndpoints(): ResolverEndpoint[] { return [...this.endpoints]; }
  canHandle(track: Track): boolean {
    return !!track.sourceId && this.endpoints.length > 0;
  }
  async resolve(track: Track, signal?: AbortSignal): Promise<ResolvedStream> {
    if (!track.sourceId) throw appError('source_unavailable', 'No source id');
    let lastErr: unknown;
    for (const endpoint of this.endpoints) {
      if (signal?.aborted) throw appError('timeout');
      try {
        const url = endpointUrl(endpoint, track.sourceId);
        const body = await fetchJson(url, { signal, timeoutMs: 12_000 });
        const formats =
          endpoint.kind === 'invidious' ? parseInvidious(body)
          : endpoint.kind === 'piped' ? parsePiped(body)
          : parseCustom(body);
        const best = bestAudio(formats);
        if (!best?.url) { lastErr = new Error(`No audio on ${endpoint.url}`); continue; }
        return {
          url: best.url,
          expiresAt: Date.now() + STREAM_TTL,
          resolvedBy: `${this.id}:${endpoint.url}`,
          mimeType: best.mimeType,
        };
      } catch (e) { lastErr = e; }
    }
    throw toAppError(lastErr ?? new Error('All endpoints failed'), 'source_unavailable');
  }
}

export const endpointSource = new EndpointStreamSource();

class StreamResolverChain {
  private sources: StreamSource[] = [];
  private cache = new Map<string, ResolvedStream>();
  private inflight = new Map<string, Promise<ResolvedStream>>();

  use(source: StreamSource): this {
    this.sources.push(source);
    return this;
  }

  peek(track: Track): ResolvedStream | null {
    const hit = this.cache.get(track.id);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) { this.cache.delete(track.id); return null; }
    return hit;
  }

  invalidate(track: Track): void {
    this.cache.delete(track.id);
    this.inflight.delete(track.id);
  }

  canResolve(track: Track): boolean {
    return this.sources.some((s) => s.canHandle(track));
  }

  async resolve(track: Track, signal?: AbortSignal): Promise<ResolvedStream> {
    if (track.localUri) {
      return { url: track.localUri, expiresAt: Date.now() + LOCAL_TTL, resolvedBy: 'local' };
    }
    try {
      const cached = diskCache.get(track.id);
      const now = Date.now();
      if (cached && now - cached.at < DISK_CACHE_MS) {
        if (cached.uri) {
          return { url: cached.uri, expiresAt: now + LOCAL_TTL, resolvedBy: 'local-disk' };
        }
      } else {
        const disk = await findOfflineFileOnDisk(track.id);
        diskCache.set(track.id, { uri: disk, at: now });
        if (disk) {
          return { url: disk, expiresAt: now + LOCAL_TTL, resolvedBy: 'local-disk' };
        }
      }
    } catch {
      /* network fallback */
    }

    const cached = this.peek(track);
    if (cached) return cached;
    const existing = this.inflight.get(track.id);
    if (existing) return existing;

    const promise = this.resolveUncached(track, signal).finally(() => {
      this.inflight.delete(track.id);
    });
    this.inflight.set(track.id, promise);
    return promise;
  }

  private async resolveUncached(track: Track, signal?: AbortSignal): Promise<ResolvedStream> {
    const usable = this.sources.filter((s) => s.canHandle(track));
    if (!usable.length) {
      throw appErrorWithMessage(
        'source_unavailable',
        'No playback source yet. Tap to retry.',
        'no StreamSource can handle this track'
      );
    }
    const instant = usable.find((s) => s.id === 'local' || s.id === 'direct');
    if (instant) {
      const stream = await instant.resolve(track, signal);
      this.cache.set(track.id, stream);
      return stream;
    }

    return new Promise<ResolvedStream>((resolve, reject) => {
      let pending = usable.length;
      let lastError: AppError | undefined;
      let settled = false;
      const childControllers: AbortController[] = [];

      const settleOk = (stream: ResolvedStream) => {
        if (settled) return;
        settled = true;
        for (const c of childControllers) { try { c.abort(); } catch { /* ok */ } }
        this.cache.set(track.id, stream);
        resolve(stream);
      };
      const settleFail = (err: AppError) => {
        lastError = err;
        pending -= 1;
        if (pending <= 0 && !settled) {
          settled = true;
          reject(lastError ?? appError('source_unavailable'));
        }
      };

      for (const source of usable) {
        const child = new AbortController();
        childControllers.push(child);
        if (signal) {
          if (signal.aborted) { settleFail(appError('timeout')); continue; }
          signal.addEventListener('abort', () => child.abort(), { once: true });
        }
        const timer = setTimeout(() => child.abort(), 15_000);
        source
          .resolve(track, child.signal)
          .then((stream) => {
            clearTimeout(timer);
            if (signal?.aborted) { settleFail(appError('timeout')); return; }
            settleOk(stream);
          })
          .catch((e) => {
            clearTimeout(timer);
            const err = toAppError(e, 'source_unavailable');
            if (err.kind === 'track_unavailable' || err.kind === 'region_restricted') {
              if (!settled) {
                settled = true;
                for (const c of childControllers) { try { c.abort(); } catch { /* ok */ } }
                reject(err);
              }
              return;
            }
            settleFail(err);
          });
      }
    });
  }
}

export const streamResolver = new StreamResolverChain()
  .use(new LocalStreamSource())
  .use(new DirectStreamSource())
  .use(new NativeStreamSource())
  .use(new TitleMatchStreamSource())
  .use(endpointSource);
