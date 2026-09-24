import type { SearchResults, Track } from "./types";
import { emptySearchResults, trackKey } from "./types";
import { safeUrl } from "./text";

const APP = "gmax-android";
const INVIDIOUS = [
  "https://inv.nadeko.net",
  "https://invidious.fdn.fr",
  "https://yewtu.be",
  "https://vid.puffyan.us",
];
const SAAVN = [
  "https://saavn.dev/api/search/songs",
  "https://jiosavan-api-with-playlist.vercel.app/api/search/songs",
];

function pickStream(downloadUrl: unknown): string {
  if (typeof downloadUrl === "string" && downloadUrl.startsWith("http")) return downloadUrl;
  if (!Array.isArray(downloadUrl)) return "";
  let best = "", score = -1;
  for (const item of downloadUrl as Array<string | { quality?: string; url?: string; link?: string }>) {
    if (typeof item === "string" && item.startsWith("http")) {
      if (!best) best = item;
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const q = String(item.quality || "").toLowerCase();
    const url = item.url || item.link || "";
    if (!url) continue;
    let s = 1;
    if (q.includes("320")) s = 320;
    else if (q.includes("160")) s = 160;
    else if (q.includes("96")) s = 96;
    if (s > score) { score = s; best = url; }
  }
  return best;
}

function pickImage(images: unknown): string {
  if (!Array.isArray(images) || !images.length) return "";
  for (let i = images.length - 1; i >= 0; i--) {
    const u = (images[i] as { url?: string; link?: string })?.url || (images[i] as { link?: string })?.link;
    if (u) return String(u);
  }
  return "";
}

async function searchSaavn(query: string, limit = 20): Promise<Track[]> {
  for (const base of SAAVN) {
    try {
      const res = await fetch(`${base}?query=${encodeURIComponent(query)}&limit=${limit}`);
      if (!res.ok) continue;
      const data = await res.json();
      const results = data?.data?.results || data?.results || (Array.isArray(data?.data) ? data.data : []);
      if (!Array.isArray(results)) continue;
      const out: Track[] = [];
      for (const raw of results) {
        const streamUrl = pickStream(raw.downloadUrl) || pickStream(raw.download_url) || raw.media_url || "";
        if (!raw.id) continue;
        const artistName =
          raw.primaryArtists ||
          (raw.artists?.primary || []).map((a: { name: string }) => a.name).filter(Boolean).join(", ") ||
          "Unknown";
        out.push({
          id: trackKey("saavn", String(raw.id)),
          title: raw.name || raw.title || "Unknown",
          artist: { id: `artist:${artistName}`, name: artistName },
          albumImageUrl: pickImage(raw.image),
          duration: Number(raw.duration) || 0,
          provider: "saavn",
          sourceId: String(raw.id),
          streamUrl: streamUrl || undefined,
        });
        if (out.length >= limit) break;
      }
      if (out.length) return out;
    } catch { /* next */ }
  }
  return [];
}

async function searchAudius(query: string, limit = 12): Promise<Track[]> {
  try {
    const res = await fetch(
      `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=${APP}&limit=${limit}`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    const list = data?.data || [];
    if (!Array.isArray(list)) return [];
    return list.slice(0, limit).map((item: {
      id: string; title: string; duration?: number;
      user?: { name?: string; handle?: string };
      artwork?: Record<string, string>;
    }) => ({
      id: trackKey("audius", item.id),
      title: item.title || "Unknown",
      artist: { id: `artist:${item.user?.name || "x"}`, name: item.user?.name || item.user?.handle || "Unknown" },
      albumImageUrl: item.artwork?.["480x480"] || item.artwork?.["150x150"] || "",
      duration: Number(item.duration) || 0,
      provider: "audius" as const,
      sourceId: item.id,
      streamUrl: `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(item.id)}/stream?app_name=${APP}`,
    }));
  } catch {
    return [];
  }
}

async function searchYouTube(query: string, limit = 12): Promise<Track[]> {
  for (const host of INVIDIOUS) {
    try {
      const res = await fetch(`${host}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data)) continue;
      const out: Track[] = [];
      for (const item of data) {
        const videoId = item?.videoId || item?.videoID;
        if (!videoId) continue;
        const title = item.title || "Unknown";
        const artistName = item.author || item.uploaderName || "YouTube";
        const image =
          item.videoThumbnails?.find((t: { quality: string }) => t.quality === "medium")?.url ||
          item.videoThumbnails?.[0]?.url ||
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        out.push({
          id: trackKey("youtube", String(videoId)),
          title,
          artist: { id: `artist:${artistName}`, name: artistName },
          albumImageUrl: String(image).startsWith("//") ? `https:${image}` : image,
          duration: Number(item.lengthSeconds) || 0,
          provider: "youtube",
          sourceId: String(videoId),
          videoId: String(videoId),
        });
        if (out.length >= limit) break;
      }
      if (out.length) return out;
    } catch { /* next */ }
  }
  return [];
}

export async function resolveYouTubeStream(videoId: string): Promise<string> {
  const id = videoId.trim();
  if (!id) return "";
  for (const host of INVIDIOUS) {
    try {
      const res = await fetch(`${host}/api/v1/videos/${encodeURIComponent(id)}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const formats = [
        ...(Array.isArray(data?.adaptiveFormats) ? data.adaptiveFormats : []),
        ...(Array.isArray(data?.formatStreams) ? data.formatStreams : []),
      ];
      const audio = formats.filter((f: { type?: string; itag?: string | number }) => {
        const t = String(f.type || "").toLowerCase();
        const itag = String(f.itag || "");
        return t.includes("audio") || ["140", "251", "250", "249"].includes(itag);
      });
      const ranked = (audio.length ? audio : formats)
        .filter((f: { url?: string }) => f.url && String(f.url).startsWith("http"))
        .sort((a: { bitrate?: number }, b: { bitrate?: number }) => Number(b.bitrate || 0) - Number(a.bitrate || 0));
      if (ranked[0]?.url) return String(ranked[0].url);
    } catch { /* next */ }
    try {
      const url = `${host}/latest_version?id=${encodeURIComponent(id)}&itag=140`;
      const head = await fetch(url, { method: "HEAD" });
      if (head.ok || head.status === 302) return url;
    } catch { /* next */ }
  }
  return "";
}

export async function searchAll(query: string): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return emptySearchResults();
  const [saavn, audius, youtube] = await Promise.all([
    searchSaavn(q, 18),
    searchAudius(q, 12),
    searchYouTube(q, 12),
  ]);
  const seen = new Set<string>();
  const tracks: Track[] = [];
  for (const t of [...saavn, ...audius, ...youtube]) {
    const key = `${t.title}\n${t.artist.name}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tracks.push(t);
  }
  return { query: q, tracks, artists: [], albums: [] };
}

export async function resolvePlayable(track: Track): Promise<Track> {
  if (track.streamUrl && safeUrl(track.streamUrl)) return track;
  if (track.provider === "youtube" && track.videoId) {
    const url = await resolveYouTubeStream(track.videoId);
    if (url) return { ...track, streamUrl: url };
  }
  return track;
}
