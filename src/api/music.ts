/** GMAX music search — Saavn + Audius + YouTube (search only / embed play). */

export type Provider = "saavn" | "audius" | "youtube";

export type Track = {
  id: string;
  title: string;
  artist: string;
  image: string;
  duration: number;
  streamUrl: string;
  provider: Provider;
  videoId?: string;
};

const APP = "gmax-android";

const SAAVN_ENDPOINTS = [
  "https://saavn.dev/api/search/songs",
  "https://jiosavan-api-with-playlist.vercel.app/api/search/songs",
];

const INVIDIOUS = [
  "https://inv.nadeko.net",
  "https://invidious.fdn.fr",
  "https://yewtu.be",
  "https://vid.puffyan.us",
];

function pickStream(downloadUrl: unknown): string {
  if (typeof downloadUrl === "string" && downloadUrl.startsWith("http")) return downloadUrl;
  if (!Array.isArray(downloadUrl)) return "";
  let best = "";
  let score = -1;
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
    if (s > score) {
      score = s;
      best = url;
    }
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
  for (const base of SAAVN_ENDPOINTS) {
    try {
      const res = await fetch(`${base}?query=${encodeURIComponent(query)}&limit=${limit}`);
      if (!res.ok) continue;
      const data = await res.json();
      const results =
        data?.data?.results || data?.results || (Array.isArray(data?.data) ? data.data : []);
      if (!Array.isArray(results)) continue;
      const out: Track[] = [];
      for (const raw of results) {
        const streamUrl =
          pickStream(raw.downloadUrl) || pickStream(raw.download_url) || raw.media_url || "";
        if (!streamUrl || !raw.id) continue;
        const artist =
          raw.primaryArtists ||
          (raw.artists?.primary || []).map((a: { name: string }) => a.name).filter(Boolean).join(", ") ||
          "Unknown";
        out.push({
          id: `saavn:${raw.id}`,
          title: raw.name || raw.title || "Unknown",
          artist,
          image: pickImage(raw.image),
          duration: Number(raw.duration) || 0,
          streamUrl,
          provider: "saavn",
        });
        if (out.length >= limit) break;
      }
      if (out.length) return out;
    } catch {
      /* next endpoint */
    }
  }
  return [];
}

async function searchAudius(query: string, limit = 15): Promise<Track[]> {
  try {
    const res = await fetch(
      `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=${APP}&limit=${limit}`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    const list = data?.data || [];
    if (!Array.isArray(list)) return [];
    return list.slice(0, limit).map(
      (item: {
        id: string;
        title: string;
        duration?: number;
        user?: { name?: string; handle?: string };
        artwork?: Record<string, string>;
      }) => ({
        id: `audius:${item.id}`,
        title: item.title || "Unknown",
        artist: item.user?.name || item.user?.handle || "Unknown",
        image: item.artwork?.["480x480"] || item.artwork?.["150x150"] || "",
        duration: Number(item.duration) || 0,
        streamUrl: `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(item.id)}/stream?app_name=${APP}`,
        provider: "audius" as const,
      }),
    );
  } catch {
    return [];
  }
}

/** YouTube search via public Invidious API (no API key). Play via official embed. */
async function searchYouTube(query: string, limit = 12): Promise<Track[]> {
  for (const host of INVIDIOUS) {
    try {
      const res = await fetch(
        `${host}/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data)) continue;
      const out: Track[] = [];
      for (const item of data) {
        const videoId = item?.videoId || item?.videoID;
        if (!videoId || item?.type === "playlist") continue;
        const title = item.title || "Unknown";
        const artist = item.author || item.uploaderName || "YouTube";
        const image =
          item.videoThumbnails?.find((t: { quality: string }) => t.quality === "medium")?.url ||
          item.videoThumbnails?.[0]?.url ||
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        out.push({
          id: `youtube:${videoId}`,
          title,
          artist,
          image: String(image).startsWith("//") ? `https:${image}` : image,
          duration: Number(item.lengthSeconds) || 0,
          streamUrl: "",
          provider: "youtube",
          videoId: String(videoId),
        });
        if (out.length >= limit) break;
      }
      if (out.length) return out;
    } catch {
      /* try next instance */
    }
  }
  return [];
}

export async function searchMusic(query: string): Promise<Track[]> {
  const q = query.trim();
  if (!q) return [];
  const [saavn, audius, youtube] = await Promise.all([
    searchSaavn(q, 18),
    searchAudius(q, 12),
    searchYouTube(q, 12),
  ]);
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const t of [
    ...saavn.filter((t) => t.streamUrl),
    ...audius.filter((t) => t.streamUrl),
    ...youtube.filter((t) => t.videoId),
  ]) {
    const key = `${t.title}\n${t.artist}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
