import { Category } from '../core/types';

export const BROWSE_CATEGORIES: Category[] = [
  { id: 'c1', name: 'Charts', color: '#1DB954', query: 'top hits this week' },
  { id: 'c2', name: 'New Releases', color: '#8A2BE2', query: 'new music releases' },
  { id: 'c3', name: 'Moods', color: '#FF7F50', query: 'chill mood playlist' },
  { id: 'c4', name: 'Indian', color: '#DAA520', query: 'bollywood hits' },
  { id: 'c5', name: 'Hip-Hop', color: '#4682B4', query: 'hip hop essentials' },
  { id: 'c6', name: 'Pop', color: '#FF69B4', query: 'pop hits' },
  { id: 'c7', name: 'EDM', color: '#00CED1', query: 'edm dance mix' },
  { id: 'c8', name: 'Rock', color: '#B22222', query: 'rock classics' },
];

/** Auto genre playlists shown in Library — tap to search & play. */
export const AUTO_GENRE_PLAYLISTS: { id: string; name: string; query: string; color: string }[] = [
  { id: 'ag1', name: 'Punjabi', query: 'punjabi hits songs', color: '#E63946' },
  { id: 'ag2', name: 'Hindi', query: 'bollywood hindi hits', color: '#F4A261' },
  { id: 'ag3', name: 'Love', query: 'romantic love songs', color: '#E76F51' },
  { id: 'ag4', name: 'Lofi', query: 'lofi hip hop beats', color: '#7B68EE' },
  { id: 'ag5', name: 'Funk', query: 'funk disco groove', color: '#2A9D8F' },
  { id: 'ag6', name: 'English', query: 'english pop hits', color: '#457B9D' },
  { id: 'ag7', name: 'Sad', query: 'sad emotional songs', color: '#6D6875' },
  { id: 'ag8', name: 'Party', query: 'party dance mix', color: '#FF006E' },
  { id: 'ag9', name: 'Devotional', query: 'devotional bhajan', color: '#FFB703' },
  { id: 'ag10', name: 'Rap', query: 'desi hip hop rap', color: '#8338EC' },
];

export const ACTION_QUERIES: Record<string, string[]> = {
  discover: [
    'trending songs this week',
    'viral hits right now',
    'top global chart songs',
    'new music this month',
    'breakout artists 2026',
    'most played songs today',
  ],
  chill: [
    'chill relaxing songs',
    'lofi chill beats',
    'acoustic chill playlist',
    'calm indie chill',
    'soft rnb chill',
    'sunset chill mix',
  ],
  focus: [
    'focus instrumental concentration',
    'deep focus study music',
    'ambient focus no lyrics',
    'piano focus instrumental',
    'minimal techno focus',
    'nature focus soundscape',
  ],
};

export function randomQueryFor(actionId: string): string | null {
  const pool = ACTION_QUERIES[actionId];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export const QUICK_ACTIONS = [
  { id: 'liked', label: 'Liked', query: null },
  { id: 'discover', label: 'Discover', query: 'discover new music' },
  { id: 'chill', label: 'Chill', query: 'chill relaxing songs' },
  { id: 'focus', label: 'Focus', query: 'focus instrumental concentration' },
] as const;

export const FEATURED_QUERY = 'calm ambient evening';
