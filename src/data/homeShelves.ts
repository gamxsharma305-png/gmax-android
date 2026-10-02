/** Horizontal home shelves — Spotify-like categories (search-backed). */

export type HomeShelfDef = {
  id: string;
  title: string;
  query: string;
  /** max tracks to show in the row */
  limit?: number;
};

export const HOME_SHELVES: HomeShelfDef[] = [
  {
    id: 'recommended',
    title: 'Recommended for today',
    query: 'trending hindi punjabi english hits today',
    limit: 12,
  },
  {
    id: 'charts',
    title: "Today's biggest hits",
    query: 'top bollywood punjabi chart songs',
    limit: 12,
  },
  {
    id: 'popular',
    title: 'Popular albums and singles',
    query: 'popular bollywood albums singles hits',
    limit: 12,
  },
  {
    id: 'hindi',
    title: 'More of what you like · Hindi',
    query: 'Arijit Singh bollywood romantic hits',
    limit: 12,
  },
  {
    id: 'punjabi',
    title: 'Mega Punjabi Hits',
    query: 'Sidhu Moose Wala Karan Aujla Shubh punjabi hits',
    limit: 12,
  },
  {
    id: 'party',
    title: 'Party',
    query: 'bollywood party dance mix',
    limit: 10,
  },
  {
    id: 'lofi',
    title: 'Made for chill',
    query: 'hindi lofi chill soft songs',
    limit: 10,
  },
  {
    id: 'english',
    title: 'English / Global',
    query: 'english pop hits trending',
    limit: 10,
  },
  {
    id: 'phonk',
    title: 'Phonk & drift',
    query: 'phonk drift music',
    limit: 8,
  },
];
