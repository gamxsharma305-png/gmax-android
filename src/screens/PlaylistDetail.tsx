import React, { useCallback, useMemo, useState } from 'react';
import {
  Image,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  Play,
  Shuffle,
  ListPlus,
  GripVertical,
  ListOrdered,
  Check,
  Download,
} from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSubscription } from '../hooks/useSubscription';
import { downloadTracksBatch } from '../services/OfflineService';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { TrackRow } from '../components/lists/TrackRow';
import { AddToPlaylistSheet } from '../components/lists/AddToPlaylistSheet';
import { MiniPlayer } from '../components/player/MiniPlayer';
import { GlassCard } from '../components/common/GlassCard';
import { Track } from '../core/types';
import { usePlayer } from '../hooks/usePlayer';
import { useLibrary } from '../hooks/useLibrary';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type PlaylistRouteParams = { playlistId: string };
type PlaylistRoute = RouteProp<{ Playlist: PlaylistRouteParams }, 'Playlist'>;

export default function PlaylistDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<PlaylistRoute>();
  const { playlistId } = route.params;

  const {
    playlists,
    likedPlaylist,
    reorderPlaylistTracks,
    reorderLikedTracks,
  } = useLibrary();
  const {
    playTrack,
    addToQueue,
    currentTrack,
    isPlaying,
    isLoading,
    togglePlayPause,
    shuffle,
    toggleShuffle,
  } = usePlayer();

  const [addingTrack, setAddingTrack] = useState<Track | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const { isPremium } = useSubscription();
  const [dlBusy, setDlBusy] = useState(false);
  const [dlProgress, setDlProgress] = useState('');

  const playlist = useMemo(
    () =>
      playlistId === 'liked'
        ? likedPlaylist
        : playlists.find((p) => p.id === playlistId),
    [playlistId, playlists, likedPlaylist]
  );

  const tracks = playlist?.tracks ?? [];
  const canReorder = tracks.length > 1;

  const playFromStart = useCallback(() => {
    if (!tracks.length || !playlist) return;
    if (shuffle) toggleShuffle();
    playTrack(tracks[0], { tracks, label: playlist.name });
  }, [tracks, playlist, playTrack, shuffle, toggleShuffle]);

  const playShuffled = useCallback(() => {
    if (!tracks.length || !playlist) return;
    const start = tracks[Math.floor(Math.random() * tracks.length)];
    playTrack(start, { tracks, label: playlist.name });
    if (!shuffle) toggleShuffle();
  }, [tracks, playlist, playTrack, shuffle, toggleShuffle]);

  const queueAll = useCallback(() => {
    if (tracks.length) addToQueue(tracks);
  }, [tracks, addToQueue]);

  const downloadAll = useCallback(async () => {
    if (!tracks.length || dlBusy) return;
    if (!isPremium) {
      navigation.navigate('Paywall' as never);
      return;
    }
    setDlBusy(true);
    setDlProgress('Starting…');
    try {
      const { completed, failed } = await downloadTracksBatch(tracks, {
        concurrency: 2,
        onOverall: (done, fail, total) => {
          setDlProgress(`${done + fail}/${total} · ${done} ok`);
        },
      });
      setDlProgress(
        `Done · ${completed} saved` + (failed ? ` · ${failed} failed` : '')
      );
    } catch (e) {
      setDlProgress(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDlBusy(false);
    }
  }, [tracks, dlBusy, isPremium, navigation]);

  const onTrackPress = useCallback(
    (track: Track) => {
      if (reorderMode) return;
      if (!playlist) return;
      playTrack(track, { tracks, label: playlist.name });
    },
    [playTrack, tracks, playlist, reorderMode]
  );

  const onDragEnd = useCallback(
    ({ from, to }: { data: Track[]; from: number; to: number }) => {
      if (from === to) return;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      if (playlistId === 'liked') {
        reorderLikedTracks(from, to);
      } else if (playlistId) {
        reorderPlaylistTracks(playlistId, from, to);
      }
    },
    [playlistId, reorderLikedTracks, reorderPlaylistTracks]
  );

  const toggleReorder = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setReorderMode((v) => !v);
  }, []);

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<Track>) => {
      return (
        <ScaleDecorator activeScale={1.03}>
          <View style={[styles.rowWrap, isActive && styles.rowActive]}>
            {reorderMode && (
              <TouchableOpacity
                onLongPress={drag}
                delayLongPress={80}
                style={styles.grip}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              >
                <GripVertical
                  color={isActive ? COLORS.accent.green : COLORS.text.secondary}
                  size={22}
                />
              </TouchableOpacity>
            )}
            <View style={styles.rowFlex}>
              <TrackRow
                track={item}
                onPress={onTrackPress}
                onMorePress={reorderMode ? undefined : setAddingTrack}
                isPlaying={!reorderMode && currentTrack?.id === item.id && isPlaying}
              />
            </View>
          </View>
        </ScaleDecorator>
      );
    },
    [reorderMode, onTrackPress, currentTrack?.id, isPlaying]
  );

  if (!playlist) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ChevronLeft color={COLORS.text.primary} size={24} />
        </TouchableOpacity>
        <Text style={[styles.title, { marginTop: 60, marginHorizontal: SIZES.md }]}>
          Playlist not found
        </Text>
      </View>
    );
  }

  const header = (
    <View style={[styles.headerBlock, { paddingTop: insets.top + 52 }]}>
      <View style={styles.artworkWrap}>
        {playlist.coverImageUrl ? (
          <Image source={{ uri: playlist.coverImageUrl }} style={styles.artwork} />
        ) : (
          <View style={[styles.artwork, styles.artworkFallback]} />
        )}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {playlist.name}
      </Text>
      <Text style={styles.meta}>
        {tracks.length} song{tracks.length === 1 ? '' : 's'}
        {playlist.creator ? ` · ${playlist.creator}` : ''}
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryAction, !tracks.length && styles.actionDisabled]}
          onPress={playFromStart}
          disabled={!tracks.length}
        >
          <Play color={COLORS.background} size={18} fill={COLORS.background} />
          <Text style={styles.primaryActionText}>Play</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryAction, !tracks.length && styles.actionDisabled]}
          onPress={playShuffled}
          disabled={!tracks.length}
        >
          <Shuffle color={COLORS.text.primary} size={18} />
          <Text style={styles.secondaryActionText}>Shuffle</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconAction, !tracks.length && styles.actionDisabled]}
          onPress={queueAll}
          disabled={!tracks.length}
        >
          <ListPlus color={COLORS.text.primary} size={20} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconAction, (!tracks.length || dlBusy) && styles.actionDisabled]}
          onPress={() => { void downloadAll(); }}
          disabled={!tracks.length || dlBusy}
        >
          <Download color={isPremium ? COLORS.accent.green : COLORS.text.muted} size={20} />
        </TouchableOpacity>
        {canReorder && (
          <TouchableOpacity
            style={[styles.iconAction, reorderMode && styles.reorderActive]}
            onPress={toggleReorder}
          >
            {reorderMode ? (
              <Check color={COLORS.accent.green} size={20} />
            ) : (
              <ListOrdered color={COLORS.text.primary} size={20} />
            )}
          </TouchableOpacity>
        )}
      </View>
      {!!dlProgress && (
        <Text style={styles.reorderHint}>{dlProgress}</Text>
      )}
      {reorderMode && (
        <Text style={styles.reorderHint}>
          Grip long-press karke upar/neeche drag karo
        </Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.backButton, { top: insets.top + 8 }]}
        onPress={() => {
          if (reorderMode) setReorderMode(false);
          else navigation.goBack();
        }}
      >
        <ChevronLeft color={COLORS.text.primary} size={24} />
      </TouchableOpacity>

      <DraggableFlatList
        data={tracks}
        keyExtractor={(item) => item.id}
        onDragEnd={onDragEnd}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <GlassCard style={styles.emptyCard}>
            <Text style={styles.emptyText}>No songs in this playlist yet.</Text>
          </GlassCard>
        }
        contentContainerStyle={{
          paddingBottom: currentTrack ? 100 : insets.bottom + 24,
        }}
        activationDistance={reorderMode ? 10 : 10000}
        dragItemOverflow
      />

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
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  backButton: {
    position: 'absolute',
    left: SIZES.md,
    zIndex: 30,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  headerBlock: {
    paddingHorizontal: SIZES.md,
    paddingBottom: SIZES.lg,
  },
  artworkWrap: {
    alignItems: 'center',
    marginBottom: SIZES.lg,
  },
  artwork: {
    width: 200,
    height: 200,
    borderRadius: SIZES.radius.md,
    backgroundColor: COLORS.surfaceLight,
  },
  artworkFallback: {
    backgroundColor: COLORS.surfaceRaised,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 28,
    color: COLORS.text.primary,
    marginBottom: SIZES.xs,
  },
  meta: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.secondary,
    marginBottom: SIZES.lg,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
  },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    backgroundColor: COLORS.text.primary,
    paddingVertical: SIZES.sm + 4,
    paddingHorizontal: SIZES.lg,
    borderRadius: SIZES.radius.pill,
  },
  primaryActionText: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.background,
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingVertical: SIZES.sm + 4,
    paddingHorizontal: SIZES.md,
    borderRadius: SIZES.radius.pill,
  },
  secondaryActionText: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.text.primary,
  },
  iconAction: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: SIZES.radius.pill,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  reorderActive: {
    borderColor: COLORS.accent.green,
    backgroundColor: 'rgba(29,185,84,0.15)',
  },
  reorderHint: {
    marginTop: SIZES.md,
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.accent.green,
  },
  actionDisabled: {
    opacity: 0.4,
  },
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  rowActive: {
    backgroundColor: COLORS.surfaceRaised,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  grip: {
    paddingLeft: SIZES.sm,
    paddingRight: 2,
    justifyContent: 'center',
  },
  rowFlex: {
    flex: 1,
  },
  emptyCard: {
    marginHorizontal: SIZES.md,
    padding: SIZES.lg,
  },
  emptyText: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.secondary,
  },
});
