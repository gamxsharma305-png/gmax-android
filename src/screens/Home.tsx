import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, Play, Heart, ListMusic, Moon, Target, User } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { GlassCard } from '../components/common/GlassCard';
import { TrackRow } from '../components/lists/TrackRow';
import { AddToPlaylistSheet } from '../components/lists/AddToPlaylistSheet';
import { Track } from '../core/types';
import { HOME_SHELVES } from '../data/homeShelves';
import { usePlayer } from '../hooks/usePlayer';
import { useLibrary } from '../hooks/useLibrary';
import { MusicService } from '../services/MusicService';
import { MiniPlayer } from '../components/player/MiniPlayer';
import { StatusBarScrim } from '../components/common/StatusBarScrim';
import { HomeAdModal } from '../components/HomeAdModal';
import { fetchRemoteAds, type RemoteAds } from '../services/RemoteConfigService';

const CHILL_QUERIES = [
  'Arijit Singh lofi hindi songs soft romantic',
  'hindi lofi mix Arijit Singh chill',
  'Arijit Singh soft songs acoustic',
  'hindi chill lofi romantic night',
  'bollywood lofi Arijit slow',
];

const FOCUS_QUERIES = [
  'Sidhu Moose Wala Subh Karan Aujla punjabi gangster songs',
  'Sidhu Moose Wala punjabi songs',
  'Karan Aujla punjabi hits',
  'Subh punjabi songs',
  'punjabi gangster mix Sidhu',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleTracks(tracks: Track[]): Track[] {
  const a = [...tracks];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ACTIONS = [
  { id: 'liked', label: 'Liked', Icon: Heart },
  { id: 'playlist', label: 'Playlist', Icon: ListMusic },
  { id: 'chill', label: 'Chill', Icon: Moon },
  { id: 'focus', label: 'Focus', Icon: Target },
] as const;

const greetingFor = (hour: number) =>
  hour < 12 ? 'Good morning,' : hour < 18 ? 'Good afternoon,' : 'Good evening,';

const CARD_W = 140;

function ShelfCard({
  track,
  onPress,
}: {
  track: Track;
  onPress: () => void;
}) {
  const uri = track.albumImageUrl || '';
  const artist = track.artist?.name || 'Unknown';
  return (
    <TouchableOpacity style={styles.shelfCard} onPress={onPress} activeOpacity={0.85}>
      {uri ? (
        <Image source={{ uri }} style={styles.shelfCover} />
      ) : (
        <View style={[styles.shelfCover, styles.shelfCoverPlaceholder]}>
          <Play color={COLORS.text.muted} size={28} />
        </View>
      )}
      <Text style={styles.shelfTitle} numberOfLines={2}>
        {track.title}
      </Text>
      <Text style={styles.shelfArtist} numberOfLines={1}>
        {artist}
      </Text>
    </TouchableOpacity>
  );
}

function HorizontalShelf({
  title,
  tracks,
  loading,
  onPlay,
}: {
  title: string;
  tracks: Track[];
  loading?: boolean;
  onPlay: (t: Track, list: Track[]) => void;
}) {
  if (!loading && tracks.length === 0) return null;
  return (
    <View style={styles.shelf}>
      <Text style={styles.shelfHeading}>{title}</Text>
      {loading && tracks.length === 0 ? (
        <ActivityIndicator color={COLORS.text.secondary} style={{ marginVertical: 16 }} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.shelfRow}
        >
          {tracks.map((t) => (
            <ShelfCard key={t.id} track={t} onPress={() => onPlay(t, tracks)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { playTrack, currentTrack, isPlaying, togglePlayPause, isLoading } = usePlayer();
  const [homeAds, setHomeAds] = useState<RemoteAds | null>(null);
  const [showHomeAd, setShowHomeAd] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      try {
        const ads = await fetchRemoteAds();
        if (cancelled || !ads.enabled || !ads.items?.length) return;

        if (ads.oncePerDay) {
          const key = `gmax_home_ad_day_${new Date().toISOString().slice(0, 10)}`;
          const seen = await AsyncStorage.getItem(key);
          if (seen) return;
        }

        const delay = Math.max(0, (ads.delaySeconds ?? 10) * 1000);
        timer = setTimeout(() => {
          if (cancelled) return;
          setHomeAds(ads);
          setShowHomeAd(true);
        }, delay);
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const { recentlyPlayed, liked, profile } = useLibrary();

  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [addingTrack, setAddingTrack] = useState<Track | null>(null);
  const [shelves, setShelves] = useState<Record<string, Track[]>>({});
  const [shelvesLoading, setShelvesLoading] = useState(true);
  const [basedOn, setBasedOn] = useState<Track[]>([]);
  const [basedTitle, setBasedTitle] = useState('Based on your recent listening');

  const onPlay = useCallback(
    (track: Track, list?: Track[]) => {
      playTrack(track, { tracks: list ?? [track], label: 'Home' });
    },
    [playTrack]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setShelvesLoading(true);
      const entries = await Promise.all(
        HOME_SHELVES.map(async (s) => {
          try {
            const res = await MusicService.search(s.query, {
              filter: 'Songs',
              limit: s.limit ?? 12,
            });
            return [s.id, res.tracks] as const;
          } catch {
            return [s.id, [] as Track[]] as const;
          }
        })
      );
      if (cancelled) return;
      const map: Record<string, Track[]> = {};
      for (const [id, tracks] of entries) map[id] = tracks;
      setShelves(map);
      setShelvesLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const seed = recentlyPlayed[0];
    if (!seed) {
      setBasedOn([]);
      return;
    }
    const artist = seed.artist?.name || '';
    const q = artist ? `${artist} songs hits` : `${seed.title} similar songs`;
    setBasedTitle(artist ? `More like ${artist}` : 'Based on your recent listening');
    (async () => {
      try {
        const res = await MusicService.search(q, { filter: 'Songs', limit: 12 });
        if (!cancelled) setBasedOn(res.tracks);
      } catch {
        if (!cancelled) setBasedOn([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recentlyPlayed]);

  const runAction = useCallback(
    async (id: string) => {
      if (id === 'liked') {
        if (liked.length) {
          const shuffled = shuffleTracks(liked);
          onPlay(shuffled[0], shuffled);
        }
        return;
      }
      if (id === 'playlist') {
        navigation.navigate('LibraryTab' as never);
        return;
      }
      let query: string | null = null;
      if (id === 'chill') query = pickRandom(CHILL_QUERIES);
      else if (id === 'focus') query = pickRandom(FOCUS_QUERIES);
      if (!query) return;
      setPendingAction(id);
      try {
        const results = await MusicService.search(query, { filter: 'Songs', limit: 30 });
        if (results.tracks.length) {
          const mixed = shuffleTracks(results.tracks);
          onPlay(mixed[0], mixed);
        }
      } catch {
        /* ignore */
      } finally {
        setPendingAction(null);
      }
    },
    [liked, onPlay, navigation]
  );

  const recents = useMemo(() => recentlyPlayed.slice(0, 16), [recentlyPlayed]);

  return (
    <View style={styles.container}>
      <View style={[styles.stickyHeader, { paddingTop: insets.top + SIZES.lg }]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greetingFor(new Date().getHours())}</Text>
            {!!profile.name && <Text style={styles.name}>{profile.name}.</Text>}
            <Text style={styles.madeBy}>Made by Gmax</Text>
          </View>
          <TouchableOpacity
            style={styles.avatar}
            onPress={() => navigation.navigate('Settings' as never)}
          >
            <User color={COLORS.text.secondary} size={26} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.searchBar}
          onPress={() => navigation.navigate('SearchTab' as never)}
        >
          <Search color={COLORS.text.secondary} size={18} />
          <Text style={styles.searchPlaceholder}>Search songs, artists…</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: SIZES.bottomInset }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.actionsPad}>
          <View style={styles.actionsRow}>
            {ACTIONS.map(({ id, label, Icon }) => (
              <TouchableOpacity
                key={id}
                style={styles.actionTouchable}
                onPress={() => runAction(id)}
                disabled={pendingAction === id}
              >
                <GlassCard intensity={20} style={styles.actionCard}>
                  {pendingAction === id ? (
                    <ActivityIndicator color={COLORS.text.primary} />
                  ) : (
                    <Icon color={COLORS.text.secondary} size={22} />
                  )}
                  <Text style={styles.actionText}>{label}</Text>
                </GlassCard>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {recents.length > 0 && (
          <HorizontalShelf title="Recents" tracks={recents} onPlay={onPlay} />
        )}

        {basedOn.length > 0 && (
          <HorizontalShelf title={basedTitle} tracks={basedOn} onPlay={onPlay} />
        )}

        {HOME_SHELVES.map((s) => (
          <HorizontalShelf
            key={s.id}
            title={s.title}
            tracks={shelves[s.id] || []}
            loading={shelvesLoading}
            onPlay={onPlay}
          />
        ))}

        {(shelves.recommended || []).length > 0 && (
          <View style={styles.listSection}>
            <Text style={styles.shelfHeading}>Quick play</Text>
            {(shelves.recommended || []).slice(0, 6).map((track) => (
              <TrackRow
                key={`q-${track.id}`}
                track={track}
                onPress={(t) => onPlay(t, shelves.recommended)}
                onMorePress={setAddingTrack}
                isPlaying={currentTrack?.id === track.id && isPlaying}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <StatusBarScrim />
      <AddToPlaylistSheet track={addingTrack} onClose={() => setAddingTrack(null)} />

      {homeAds && (
        <HomeAdModal
          visible={showHomeAd}
          ads={homeAds}
          onClose={() => {
            setShowHomeAd(false);
            if (homeAds.oncePerDay) {
              const key = `gmax_home_ad_day_${new Date().toISOString().slice(0, 10)}`;
              void AsyncStorage.setItem(key, '1');
            }
          }}
        />
      )}

      {currentTrack && (
        <MiniPlayer
          track={currentTrack}
          isPlaying={isPlaying}
          isLoading={isLoading}
          onPlayPause={togglePlayPause}
          onPress={() => navigation.navigate('NowPlaying' as never)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  stickyHeader: { paddingHorizontal: SIZES.md, marginBottom: SIZES.sm },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.md,
  },
  greeting: { fontFamily: FONTS.bold, fontSize: 28, color: COLORS.text.primary },
  name: { fontFamily: FONTS.medium, fontSize: 18, color: COLORS.text.secondary },
  madeBy: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    letterSpacing: 1.5,
    color: COLORS.text.muted,
    marginTop: 4,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: SIZES.radius.md,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm + 4,
  },
  searchPlaceholder: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.text.secondary },
  actionsPad: { paddingHorizontal: SIZES.md, marginBottom: SIZES.md },
  actionsRow: { flexDirection: 'row' },
  actionTouchable: { flex: 1 },
  actionCard: {
    marginHorizontal: 4,
    paddingVertical: SIZES.md,
    alignItems: 'center',
    gap: 8,
  },
  actionText: { fontFamily: FONTS.regular, fontSize: 10, color: COLORS.text.secondary },
  shelf: { marginBottom: SIZES.lg },
  shelfHeading: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: COLORS.text.primary,
    paddingHorizontal: SIZES.md,
    marginBottom: SIZES.sm,
  },
  shelfRow: { paddingHorizontal: SIZES.md, gap: 12 },
  shelfCard: { width: CARD_W },
  shelfCover: {
    width: CARD_W,
    height: CARD_W,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceRaised,
  },
  shelfCoverPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  shelfTitle: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.text.primary,
    marginTop: 8,
  },
  shelfArtist: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  listSection: { paddingHorizontal: SIZES.md, marginBottom: SIZES.xl },
});
