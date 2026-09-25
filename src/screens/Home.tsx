import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, Play, Heart, Compass, Moon, Target, User } from 'lucide-react-native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { GlassCard } from '../components/common/GlassCard';
import { TrackRow } from '../components/lists/TrackRow';
import { AddToPlaylistSheet } from '../components/lists/AddToPlaylistSheet';
import { Track } from '../core/types';
import { FEATURED_QUERY } from '../data/catalog';
import { usePlayer } from '../hooks/usePlayer';
import { useLibrary } from '../hooks/useLibrary';
import { MusicService } from '../services/MusicService';
import { MiniPlayer } from '../components/player/MiniPlayer';
import { StatusBarScrim } from '../components/common/StatusBarScrim';
import { useNavigation } from '@react-navigation/native';

const ACTIONS = [
  { id: 'liked', label: 'Liked', Icon: Heart, query: null as string | null },
  { id: 'discover', label: 'Discover', Icon: Compass, query: 'discover new music' },
  { id: 'chill', label: 'Chill', Icon: Moon, query: 'chill relaxing songs' },
  { id: 'focus', label: 'Focus', Icon: Target, query: 'focus instrumental concentration' },
] as const;

const greetingFor = (hour: number) =>
  hour < 12 ? 'Good morning,' : hour < 18 ? 'Good afternoon,' : 'Good evening,';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { playTrack, currentTrack, isPlaying, togglePlayPause, isLoading } = usePlayer();
  const { recentlyPlayed, liked, profile } = useLibrary();

  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [featured, setFeatured] = useState<Track[]>([]);
  const [starter, setStarter] = useState<Track[]>([]);
  const [addingTrack, setAddingTrack] = useState<Track | null>(null);

  const hasRecents = recentlyPlayed.length > 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const results = await MusicService.search(FEATURED_QUERY || 'trending music', {
          filter: 'Songs',
          limit: 12,
        });
        if (!cancelled) {
          setFeatured(results.tracks.slice(0, 1));
          setStarter(results.tracks.slice(0, 8));
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onPlay = useCallback(
    (track: Track, list?: Track[]) => {
      playTrack(track, { tracks: list ?? [track], label: 'Home' });
    },
    [playTrack]
  );

  const runAction = useCallback(
    async (id: string, query: string | null) => {
      if (id === 'liked') {
        if (liked.length) onPlay(liked[0], liked);
        return;
      }
      if (!query) return;
      setPendingAction(id);
      try {
        const results = await MusicService.search(query, { filter: 'Songs', limit: 20 });
        if (results.tracks.length) onPlay(results.tracks[0], results.tracks);
      } catch {
        // ignore
      } finally {
        setPendingAction(null);
      }
    },
    [liked, onPlay]
  );

  const list = hasRecents ? recentlyPlayed : starter;

  return (
    <View style={styles.container}>
      <View style={[styles.stickyHeader, { paddingTop: insets.top + SIZES.lg }]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greetingFor(new Date().getHours())}</Text>
            {!!profile.name && <Text style={styles.name}>{profile.name}.</Text>}
            <Text style={styles.madeBy}>MADE BY SJBUILDS</Text>
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
        contentContainerStyle={{ paddingBottom: SIZES.bottomInset, paddingHorizontal: SIZES.md }}
        showsVerticalScrollIndicator={false}
      >
        {featured[0] && (
          <GlassCard intensity={30} style={styles.featuredCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.featuredLabel}>FEATURED</Text>
              <Text style={styles.featuredText} numberOfLines={2}>
                {featured[0].title}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.featuredPlayBtn}
              onPress={() => onPlay(featured[0], featured)}
            >
              <Play color={COLORS.background} size={22} fill={COLORS.background} />
            </TouchableOpacity>
          </GlassCard>
        )}

        <View style={styles.actionsRow}>
          {ACTIONS.map(({ id, label, Icon, query }) => (
            <TouchableOpacity
              key={id}
              style={styles.actionTouchable}
              onPress={() => runAction(id, query)}
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

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {hasRecents ? 'Recently played' : 'Suggested for you'}
          </Text>
        </View>

        {list.length === 0 ? (
          <GlassCard intensity={20} style={styles.emptyCard}>
            <Text style={styles.emptyText}>Nothing here yet.</Text>
            <Text style={styles.emptyHint}>Search for a song to get started.</Text>
          </GlassCard>
        ) : (
          list.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              onPress={(t) => onPlay(t, list)}
              onMorePress={setAddingTrack}
              isPlaying={currentTrack?.id === track.id && isPlaying}
            />
          ))
        )}
      </ScrollView>

      <StatusBarScrim />
      <AddToPlaylistSheet track={addingTrack} onClose={() => setAddingTrack(null)} />

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
    letterSpacing: 2,
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
  featuredCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SIZES.md,
    marginBottom: SIZES.lg,
  },
  featuredLabel: {
    fontFamily: FONTS.regular,
    fontSize: 10,
    letterSpacing: 2,
    color: COLORS.text.muted,
    marginBottom: 4,
  },
  featuredText: { fontFamily: FONTS.medium, fontSize: 16, color: COLORS.text.primary },
  featuredPlayBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.text.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionsRow: { flexDirection: 'row', marginBottom: SIZES.xl },
  actionTouchable: { flex: 1 },
  actionCard: {
    marginHorizontal: 4,
    paddingVertical: SIZES.md,
    alignItems: 'center',
    gap: 8,
  },
  actionText: { fontFamily: FONTS.regular, fontSize: 10, color: COLORS.text.secondary },
  sectionHeader: { marginBottom: SIZES.sm },
  sectionTitle: { fontFamily: FONTS.medium, fontSize: 18, color: COLORS.text.primary },
  emptyCard: { padding: SIZES.md },
  emptyText: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.text.primary },
  emptyHint: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 4,
  },
});
