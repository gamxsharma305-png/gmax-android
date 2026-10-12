/**
 * Fetch remote playlists (YouTube / Deezer) and map to local Tracks.
 * Spotify stays CSV-based in ImportSpotifyPlaylist screen.
 */
import { Track } from '../core/types';
import { MusicService } from './MusicService';

const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.fdn.fr',
  'https://invidious.privacyredirect.com',
  'https://invidious.materialio.us',
];

export type ImportedPlaylist = {
  name: string;
  description?: string;
  coverImageUrl?: string;
  tracks: Track[];
  source: { provider: 'youtube' | 'saavn'; browseId: string };
};

export function extractYouTubePlaylistId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    const list = u.searchParams.get('list');
    if (list && /^[\w-]+$/.test(list)) return list;
  } catch {
    /* not a URL */
  }
  if (/^PL[\w-]+$/.test(s) || /^OLAK5uy_[\w-]+$/.test(s) || /^UU[\w-]+$/.test(s)) {
    return s;
  }
  const m = s.match(/[?&]list=([\w-]+)/);
  return m?.[1] ?? null;
}

export function extractDeezerPlaylistId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/deezer\.com\/(?:\w+\/)?playlist\/(\d+)/i);
  if (m?.[1]) return m[1];
  const idOnly = s.match(/playlist\/(\d+)/i);
  return idOnly?.[1] ?? null;
}

function ytThumb(videoId: string, thumbs?: { url: string; width: number }[]): string {
  if (Array.isArray(thumbs) && thumbs.length) {
    const sorted = [...thumbs].sort((a, b) => (b.width || 0) - (a.width || 0));
    if (sorted[0]?.url) return sorted[0].url;
  }
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function toYtTrack(v: any): Track | null {
  const videoId = String(v?.videoId || v?.videoID || '').trim();
  if (!videoId) return null;
  const title = String(v?.title || 'Unknown').trim();
  const author = String(v?.author || v?.uploaderName || 'YouTube').trim();
  const duration = Number(v?.lengthSeconds || v?.duration || 0) || 0;
  return {
    id: `youtube:${videoId}`,
    title,
    artist: { id: `yt-artist:${author}`, name: author },
    albumImageUrl: ytThumb(videoId, v?.videoThumbnails),
    duration,
    provider: 'youtube',
    sourceId: videoId,
    isVideo: true,
  };
}

export async function fetchYouTubePlaylist(playlistId: string): Promise<ImportedPlaylist> {
  let lastErr = 'YouTube playlist load failed';
  for (const host of INVIDIOUS) {
    try {
      const res = await fetch(`${host}/api/v1/playlists/${encodeURIComponent(playlistId)}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        continue;
      }
      const body = await res.json();
      const videos = Array.isArray(body?.videos) ? body.videos : [];
      const tracks = videos.map(toYtTrack).filter(Boolean) as Track[];
      if (!tracks.length) {
        lastErr = 'Empty playlist or blocked mirror';
        continue;
      }
      return {
        name: String(body?.title || 'YouTube Playlist'),
        description: String(body?.description || ''),
        coverImageUrl: tracks[0]?.albumImageUrl,
        tracks,
        source: { provider: 'youtube', browseId: playlistId },
      };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : 'network error';
    }
  }
  throw new Error(lastErr);
}

type DeezerTrackRow = {
  title: string;
  artist: string;
  album?: string;
  cover?: string;
  duration?: number;
};

export async function fetchDeezerPlaylistMeta(playlistId: string): Promise<{
  name: string;
  description: string;
  cover: string;
  rows: DeezerTrackRow[];
}> {
  const res = await fetch(`https://api.deezer.com/playlist/${encodeURIComponent(playlistId)}`);
  if (!res.ok) throw new Error(`Deezer HTTP ${res.status}`);
  const body = await res.json();
  if (body?.error) throw new Error(String(body.error.message || 'Deezer error'));

  const rows: DeezerTrackRow[] = [];
  let next: string | null = null;
  const firstTracks = body?.tracks?.data;
  if (Array.isArray(firstTracks)) {
    for (const t of firstTracks) {
      rows.push({
        title: String(t?.title || ''),
        artist: String(t?.artist?.name || ''),
        album: String(t?.album?.title || ''),
        cover: String(t?.album?.cover_medium || t?.album?.cover || ''),
        duration: Number(t?.duration || 0),
      });
    }
    next = body?.tracks?.next || null;
  }

  let pages = 0;
  while (next && pages < 10) {
    pages++;
    const r = await fetch(next);
    if (!r.ok) break;
    const page = await r.json();
    const data = page?.data;
    if (!Array.isArray(data) || !data.length) break;
    for (const t of data) {
      rows.push({
        title: String(t?.title || ''),
        artist: String(t?.artist?.name || ''),
        album: String(t?.album?.title || ''),
        cover: String(t?.album?.cover_medium || ''),
        duration: Number(t?.duration || 0),
      });
    }
    next = page?.next || null;
  }

  return {
    name: String(body?.title || 'Deezer Playlist'),
    description: String(body?.description || ''),
    cover: String(body?.picture_medium || body?.picture || ''),
    rows: rows.filter((r) => r.title),
  };
}

export async function resolveRowsToTracks(
  rows: DeezerTrackRow[],
  onProgress?: (done: number, total: number) => void
): Promise<Track[]> {
  const out: Track[] = [];
  const total = rows.length;
  const BATCH = 5;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const found = await Promise.all(
      batch.map(async (row) => {
        const q = `${row.title} ${row.artist}`.trim();
        if (!q) return null;
        try {
          const results = await MusicService.search(q, { filter: 'Songs', limit: 6 });
          const tracks = results.tracks || [];
          const yt = tracks.find((t) => t.provider === 'youtube' && t.sourceId);
          return yt || tracks[0] || null;
        } catch {
          return null;
        }
      })
    );
    for (const t of found) if (t) out.push(t);
    onProgress?.(Math.min(i + batch.length, total), total);
    if (i + BATCH < rows.length) {
      await new Promise((r) => setTimeout(r, 180));
    }
  }
  return out;
}
