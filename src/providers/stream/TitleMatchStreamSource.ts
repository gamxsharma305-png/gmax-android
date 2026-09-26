import { fetchJson } from '../../core/http';
import { appError, toAppError } from '../../core/errors';
import { ResolvedStream, Track } from '../../core/types';
import type { StreamSource } from './StreamResolver';

const STREAM_TTL = 4 * 60 * 60 * 1000;
const APP = 'GMAXPlayer';

const SAAVN_ENDPOINTS = [
  'https://jiosaavn-api-taupe.vercel.app/search/songs',
  'https://saavn.dev/api/search/songs',
];

function pickStream(downloadUrl: unknown): string {
  if (typeof downloadUrl === 'string' && downloadUrl.startsWith('http')) return downloadUrl;
  if (!Array.isArray(downloadUrl)) return '';
  let best = '';
  let score = -1;
  for (const item of downloadUrl as Array<
    string | { quality?: string; url?: string; link?: string }
  >) {
    if (typeof item === 'string' && item.startsWith('http')) {
      if (!best) best = item;
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const q = String(item.quality || '').toLowerCase();
    const url = item.url || item.link || '';
    if (!url.startsWith('http')) continue;
    let s = 1;
    if (q.includes('320')) s = 320;
    else if (q.includes('160')) s = 160;
    else if (q.includes('96')) s = 96;
    if (s >= score) {
      score = s;
      best = url;
    }
  }
  return best;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreMatch(track: Track, title: string, artist: string): number {
  const nt = norm(track.title || '');
  const na = norm(track.artist || '');
  const rt = norm(title);
  const ra = norm(artist);
  if (!rt) return 0;
  let s = 0;
  if (nt === rt) s += 50;
  else if (nt.includes(rt) || rt.includes(nt)) s += 30;
  else {
    const tw = nt.split(' ').filter(Boolean);
    const rw = rt.split(' ').filter(Boolean);
    const hit = rw.filter((w) => tw.some((t) => t.includes(w) || w.includes(t))).length;
    s += hit * 8;
  }
  if (ra && na) {
    if (na === ra) s += 30;
    else if (na.includes(ra) || ra.includes(na)) s += 18;
  }
  return s;
}

async function resolveSaavn(track: Track, signal?: AbortSignal): Promise<string | null> {
  const q = [track.artist, track.title].filter(Boolean).join(' ').trim() || track.title;
  if (!q) return null;

  for (const base of SAAVN_ENDPOINTS) {
    try {
      const url = `${base}?query=${encodeURIComponent(q)}&limit=8`;
      const data = await fetchJson<any>(url, { timeoutMs: 10_000, retries: 0, signal });
      const results =
        data?.data?.results || data?.data?.songs || data?.results || data?.data || [];
      if (!Array.isArray(results) || !results.length) continue;

      let bestUrl = '';
      let bestScore = 0;
      for (const item of results) {
        const title = item.name || item.title || '';
        const artist =
          item.primaryArtists ||
          item.primary_artists ||
          (Array.isArray(item.artists?.primary)
            ? item.artists.primary.map((a: any) => a.name).join(', ')
            : '') ||
          item.subtitle ||
          '';
        const stream =
          pickStream(item.downloadUrl) ||
          pickStream(item.download_url) ||
          item.media_url ||
          '';
        if (!stream) continue;
        const sc = scoreMatch(track, title, artist);
        if (sc > bestScore) {
          bestScore = sc;
          bestUrl = stream;
        }
      }
      if (bestUrl && bestScore >= 20) return bestUrl;
      // weak match still better than nothing
      if (bestUrl && bestScore >= 8) return bestUrl;
    } catch {
      /* try next endpoint */
    }
  }
  return null;
}

async function resolveAudius(track: Track, signal?: AbortSignal): Promise<string | null> {
  const q = [track.artist, track.title].filter(Boolean).join(' ').trim() || track.title;
  if (!q) return null;
  try {
    const url = `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=${APP}&limit=5`;
    const data = await fetchJson<any>(url, { timeoutMs: 10_000, retries: 0, signal });
    const list = data?.data || [];
    for (const item of list) {
      if (item?.id) {
        return `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(item.id)}/stream?app_name=${APP}`;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Resolves playable HTTPS audio for YouTube (and other) tracks by matching
 * title/artist against Saavn + Audius — same strategy as the GMAX website API.
 */
export class TitleMatchStreamSource implements StreamSource {
  readonly id = 'title-match';

  canHandle(track: Track): boolean {
    return Boolean(track.title?.trim());
  }

  async resolve(track: Track, signal?: AbortSignal): Promise<ResolvedStream> {
    if (signal?.aborted) throw appError('timeout');

    // Prefer Saavn (direct AAC CDN — works on mobile)
    const saavn = await resolveSaavn(track, signal);
    if (saavn) {
      return {
        url: saavn,
        mimeType: 'audio/mp4',
        expiresAt: Date.now() + STREAM_TTL,
        resolvedBy: `${this.id}:saavn`,
      };
    }

    if (signal?.aborted) throw appError('timeout');

    const audius = await resolveAudius(track, signal);
    if (audius) {
      return {
        url: audius,
        mimeType: 'audio/mpeg',
        expiresAt: Date.now() + STREAM_TTL,
        resolvedBy: `${this.id}:audius`,
      };
    }

    throw toAppError(new Error('no title match'), 'source_unavailable');
  }
}
