/**
 * Website-parity search: Saavn + Audius + iTunes + YouTube Music.
 * Saavn / Audius / iTunes return tracks WITH audioUrl → true background play.
 */
import { fetchJson } from '../core/http';
import {
  emptySearchResults,
  ProviderId,
  SearchResults,
  Track,
  trackKey,
} from '../core/types';

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

function pickImage(images: unknown): string {
  if (typeof images === 'string') return images;
  if (!Array.isArray(images) || !images.length) return '';
  for (let i = images.length - 1; i >= 0; i--) {
    const u = images[i]?.url || images[i]?.link;
    if (u) return String(u);
  }
  return '';
}

function upscaleItunesArt(url: string): string {
  if (!url) return '';
  return url.replace(/\d+x\d+bb/, '600x600bb');
}

async function searchSaavn(query: string, limit: number, signal?: AbortSignal): Promise<Track[]> {
  const out: Track[] = [];
  for (const base of SAAVN_ENDPOINTS) {
    try {
      const data = await fetchJson<any>(`${base}?query=${encodeURIComponent(query)}&limit=${limit}`, {
        timeoutMs: 10_000,
        retries: 0,
        signal,
      });
      const results =
        data?.data?.results || data?.data?.songs || data?.results || data?.data || [];
      if (!Array.isArray(results)) continue;
      for (const raw of results) {
        const id = String(raw.id || '');
        if (!id) continue;
        const streamUrl =
          pickStream(raw.downloadUrl) ||
          pickStream(raw.download_url) ||
          raw.media_url ||
          '';
        if (!streamUrl) continue;
        const artistName =
          raw.primaryArtists ||
          raw.primary_artists ||
          (Array.isArray(raw.artists?.primary)
            ? raw.artists.primary.map((a: any) => a.name).join(', ')
            : '') ||
          raw.subtitle ||
          'Unknown';
        out.push({
          id: trackKey('saavn', id),
          title: raw.name || raw.title || 'Unknown',
          artist: { id: `saavn-artist:${artistName}`, name: String(artistName) },
          albumImageUrl: pickImage(raw.image),
          duration: Number(raw.duration) || 0,
          audioUrl: streamUrl,
          provider: 'saavn',
          sourceId: id,
          album: raw.album?.name || raw.album || undefined,
        });
        if (out.length >= limit) break;
      }
      if (out.length) return out;
    } catch {
      /* next */
    }
  }
  return out;
}

async function searchAudius(query: string, limit: number, signal?: AbortSignal): Promise<Track[]> {
  try {
    const data = await fetchJson<any>(
      `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=${APP}&limit=${limit}`,
      { timeoutMs: 10_000, retries: 0, signal }
    );
    const list = data?.data || [];
    if (!Array.isArray(list)) return [];
    return list.slice(0, limit).map((item: any) => {
      const id = String(item.id);
      return {
        id: trackKey('audius', id),
        title: item.title || 'Unknown',
        artist: {
          id: `audius-artist:${item.user?.id || item.user?.handle || 'x'}`,
          name: item.user?.name || item.user?.handle || 'Unknown',
        },
        albumImageUrl: item.artwork?.['480x480'] || item.artwork?.['150x150'] || '',
        duration: Number(item.duration) || 0,
        audioUrl: `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(id)}/stream?app_name=${APP}`,
        provider: 'audius' as ProviderId,
        sourceId: id,
      };
    });
  } catch {
    return [];
  }
}

async function searchItunes(query: string, limit: number, signal?: AbortSignal): Promise<Track[]> {
  try {
    const data = await fetchJson<any>(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}`,
      { timeoutMs: 10_000, retries: 0, signal }
    );
    const results = data?.results || [];
    const out: Track[] = [];
    for (const item of results) {
      if (item.kind !== 'song' && item.wrapperType !== 'track') continue;
      if (!item.previewUrl || !item.trackId) continue;
      const id = String(item.trackId);
      out.push({
        id: trackKey('itunes', id),
        title: item.trackName || 'Unknown',
        artist: {
          id: item.artistId ? `itunes-artist:${item.artistId}` : `itunes-artist:${item.artistName}`,
          name: item.artistName || 'Unknown',
        },
        albumImageUrl: upscaleItunesArt(item.artworkUrl100 || item.artworkUrl60 || ''),
        duration: item.trackTimeMillis ? item.trackTimeMillis / 1000 : 30,
        audioUrl: item.previewUrl, // 30s preview — still real background audio
        provider: 'itunes',
        sourceId: id,
        album: item.collectionName,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Merge like website: stream-ready sources first, then YouTube results from caller.
 */
export async function multiSourceSearch(
  query: string,
  options: { limit?: number; signal?: AbortSignal; youtubeTracks?: Track[] } = {}
): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return emptySearchResults();

  const limit = options.limit ?? 20;
  const half = Math.max(6, Math.floor(limit / 2));

  const [saavn, audius, itunes] = await Promise.all([
    searchSaavn(q, half, options.signal),
    searchAudius(q, half, options.signal),
    searchItunes(q, half, options.signal),
  ]);

  // Prefer tracks that already have a stream (background-capable)
  const withStream = [
    ...saavn.filter((t) => t.audioUrl),
    ...audius.filter((t) => t.audioUrl),
  ];
  const previews = itunes.filter((t) => t.audioUrl);
  const youtube = options.youtubeTracks ?? [];

  const seen = new Set<string>();
  const tracks: Track[] = [];
  for (const t of [...withStream, ...youtube, ...previews]) {
    const key = `${t.title.toLowerCase()}|${t.artist.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tracks.push(t);
    if (tracks.length >= limit) break;
  }

  return {
    query: q,
    tracks,
    artists: [],
    albums: [],
    playlists: [],
  };
}
