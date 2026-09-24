export type ProviderId = "youtube" | "itunes" | "saavn" | "audius";

export type Artist = { id: string; name: string; imageUrl?: string };

export type Track = {
  id: string;
  title: string;
  artist: Artist;
  albumImageUrl: string;
  duration: number;
  provider: ProviderId;
  sourceId: string;
  album?: string;
  videoId?: string;
  previewUrl?: string;
  streamUrl?: string;
};

export type RepeatMode = "off" | "all" | "one";
export type ThemeMode = "dark" | "light" | "system";
export type AudioQuality = "auto" | "high" | "medium";

export type UserPrefs = {
  themeMode: ThemeMode;
  accent: string;
  language: string;
  audioQuality: AudioQuality;
  showQualityBadge: boolean;
  gapless: boolean;
  crossfade: boolean;
};

export type UserProfile = {
  name: string;
  gender: "male" | "female" | "unspecified";
  completed: boolean;
  prefs?: UserPrefs;
};

export const DEFAULT_PREFS: UserPrefs = {
  themeMode: "dark",
  accent: "#1db954",
  language: "en",
  audioQuality: "high",
  showQualityBadge: false,
  gapless: true,
  crossfade: false,
};

export type SearchResults = {
  query: string;
  tracks: Track[];
  artists: { id: string; name: string; imageUrl: string }[];
  albums: { id: string; title: string; artist: string; coverImageUrl: string }[];
};

export const emptySearchResults = (query = ""): SearchResults => ({
  query,
  tracks: [],
  artists: [],
  albums: [],
});

export const trackKey = (provider: ProviderId, sourceId: string) =>
  `${provider}:${sourceId}`;
