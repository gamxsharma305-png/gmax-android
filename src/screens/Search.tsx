import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search as SearchIcon, X, ChevronDown, ChevronRight, Disc3, User } from 'lucide-react-native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { TrackRow } from '../components/lists/TrackRow';
import { AddToPlaylistSheet } from '../components/lists/AddToPlaylistSheet';
import { MiniPlayer } from '../components/player/MiniPlayer';
import { StatusBarScrim } from '../components/common/StatusBarScrim';
import { GlassCard } from '../components/common/GlassCard';
import { Album, ArtistResult, Track } from '../core/types';
import { useSearch } from '../hooks/useSearch';
import { usePlayer } from '../hooks/usePlayer';
import { useNavigation } from '@react-navigation/native';
import { MusicService } from '../services/MusicService';

const FILTERS = ['All', 'Songs', 'Artists', 'Albums', 'Playlists'] as const;

type ListRow =
  | { key: string; kind: 'header'; title: string }
  | { key: string; kind: 'track'; track: Track }
  | {
      key: string;
      kind: 'artist';
      artist: ArtistResult;
      expanded: boolean;
      loading: boolean;
      trackCount: number;
    }
  | { key: string; kind: 'artistTrack'; track: Track; artistId: string }
  | { key: string; kind: 'album'; album: Album }
  | { key: string; kind: 'albumTrack'; track: Track; albumId: string };

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const {
    query,
    setQuery,
    filter,
    setFilter,
    results,
    suggestions,
    isSearching,
    error,
    searchNow,
    clear,
  } = useSearch();
  const { playTrack, currentTrack, isPlaying, isLoading, togglePlayPause } = usePlayer();
  const [addingTrack, setAddingTrack] = useState<Track | null>(null);

  const [artistTracks, setArtistTracks] = useState<Record<string, Track[]>>({});
  const [expandedArtists, setExpandedArtists] = useState<Record<string, boolean>>({});
  const [loadingArtists, setLoadingArtists] = useState<Record<string, boolean>>({});

  const [albumTracks, setAlbumTracks] = useState<Record<string, Track[]>>({});
  const [expandedAlbums, setExpandedAlbums] = useState<Record<string, boolean>>({});
  const [loadingAlbums, setLoadingAlbums] = useState<Record<string, boolean>>({});

  const onPlay = useCallback(
    (track: Track, queue?: Track[]) => {
      playTrack(track, {
        tracks: queue && queue.length ? queue : results.tracks,
        label: 'Search',
      });
    },
    [playTrack, results.tracks]
  );

  const toggleArtist = useCallback(
    async (artist: ArtistResult) => {
      const id = artist.browseId || artist.id;
      const isOpen = !!expandedArtists[id];
      if (isOpen) {
        setExpandedArtists((s) => ({ ...s, [id]: false }));
        return;
      }
      setExpandedArtists((s) => ({ ...s, [id]: true }));
      if (artistTracks[id]?.length) return;

      setLoadingArtists((s) => ({ ...s, [id]: true }));
      try {
        const tracks = await MusicService.loadArtistCatalog(
          { name: artist.name, browseId: artist.browseId },
          { maxTracks: 200 }
        );
        setArtistTracks((s) => ({ ...s, [id]: tracks }));
      } catch {
        setArtistTracks((s) => ({ ...s, [id]: [] }));
      } finally {
        setLoadingArtists((s) => ({ ...s, [id]: false }));
      }
    },
    [artistTracks, expandedArtists]
  );

  const toggleAlbum = useCallback(
    async (album: Album) => {
      const id = album.browseId || album.id;
      const isOpen = !!expandedAlbums[id];
      if (isOpen) {
        setExpandedAlbums((s) => ({ ...s, [id]: false }));
        return;
      }
      setExpandedAlbums((s) => ({ ...s, [id]: true }));
      if (albumTracks[id]?.length) return;

      setLoadingAlbums((s) => ({ ...s, [id]: true }));
      try {
        const page = await MusicService.getAlbum(id);
        setAlbumTracks((s) => ({ ...s, [id]: page.tracks || [] }));
      } catch {
        setAlbumTracks((s) => ({ ...s, [id]: [] }));
      } finally {
        setLoadingAlbums((s) => ({ ...s, [id]: false }));
      }
    },
    [albumTracks, expandedAlbums]
  );

  const rows: ListRow[] = useMemo(() => {
    const out: ListRow[] = [];
    const showSongs = filter === 'All' || filter === 'Songs';
    const showArtists = filter === 'All' || filter === 'Artists';
    const showAlbums = filter === 'All' || filter === 'Albums';

    if (showSongs && results.tracks.length) {
      out.push({ key: 'h-songs', kind: 'header', title: `Songs · ${results.tracks.length}` });
      for (const t of results.tracks) {
        out.push({ key: `t-${t.id}`, kind: 'track', track: t });
      }
    }

    if (showArtists && results.artists.length) {
      out.push({
        key: 'h-artists',
        kind: 'header',
        title: `Artists · ${results.artists.length}`,
      });
      for (const a of results.artists) {
        const id = a.browseId || a.id;
        const expanded = !!expandedArtists[id];
        const loading = !!loadingArtists[id];
        const catalog = artistTracks[id] || [];
        out.push({
          key: `a-${id}`,
          kind: 'artist',
          artist: a,
          expanded,
          loading,
          trackCount: catalog.length,
        });
        if (expanded) {
          for (const t of catalog) {
            out.push({
              key: `at-${id}-${t.id}`,
              kind: 'artistTrack',
              track: t,
              artistId: id,
            });
          }
        }
      }
    }

    if (showAlbums && results.albums.length) {
      out.push({
        key: 'h-albums',
        kind: 'header',
        title: `Albums · ${results.albums.length}`,
      });
      for (const al of results.albums) {
        const id = al.browseId || al.id;
        const expanded = !!expandedAlbums[id];
        const catalog = albumTracks[id] || [];
        out.push({ key: `al-${id}`, kind: 'album', album: al });
        if (expanded) {
          for (const t of catalog) {
            out.push({
              key: `alt-${id}-${t.id}`,
              kind: 'albumTrack',
              track: t,
              albumId: id,
            });
          }
        }
      }
    }

    return out;
  }, [
    filter,
    results,
    expandedArtists,
    loadingArtists,
    artistTracks,
    expandedAlbums,
    albumTracks,
  ]);

  const hasAny =
    results.tracks.length > 0 ||
    results.artists.length > 0 ||
    results.albums.length > 0 ||
    results.playlists.length > 0;

  const renderRow = useCallback(
    ({ item }: { item: ListRow }) => {
      if (item.kind === 'header') {
        return (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{item.title}</Text>
          </View>
        );
      }

      if (item.kind === 'track') {
        return (
          <TrackRow
            track={item.track}
            onPress={(t) => onPlay(t, results.tracks)}
            onMorePress={setAddingTrack}
            isPlaying={currentTrack?.id === item.track.id && isPlaying}
          />
        );
      }

      if (item.kind === 'artistTrack') {
        const queue = artistTracks[item.artistId] || [];
        return (
          <View style={styles.indented}>
            <TrackRow
              track={item.track}
              onPress={(t) => onPlay(t, queue)}
              onMorePress={setAddingTrack}
              isPlaying={currentTrack?.id === item.track.id && isPlaying}
            />
          </View>
        );
      }

      if (item.kind === 'albumTrack') {
        const queue = albumTracks[item.albumId] || [];
        return (
          <View style={styles.indented}>
            <TrackRow
              track={item.track}
              onPress={(t) => onPlay(t, queue)}
              onMorePress={setAddingTrack}
              isPlaying={currentTrack?.id === item.track.id && isPlaying}
            />
          </View>
        );
      }

      if (item.kind === 'artist') {
        const { artist, expanded, loading, trackCount } = item;
        return (
          <TouchableOpacity
            style={styles.entityRow}
            onPress={() => void toggleArtist(artist)}
            activeOpacity={0.85}
          >
            {artist.imageUrl ? (
              <Image source={{ uri: artist.imageUrl }} style={styles.entityArt} />
            ) : (
              <View style={[styles.entityArt, styles.entityArtPlaceholder]}>
                <User color={COLORS.text.muted} size={22} />
              </View>
            )}
            <View style={styles.entityMeta}>
              <Text style={styles.entityTitle} numberOfLines={1}>
                {artist.name}
              </Text>
              <Text style={styles.entitySub} numberOfLines={1}>
                {loading
                  ? 'Gane load ho rahe hain…'
                  : expanded
                    ? trackCount
                      ? `${trackCount} songs — tap to collapse`
                      : 'No songs found'
                    : 'Tap to see all songs'}
              </Text>
            </View>
            {loading ? (
              <ActivityIndicator color={COLORS.accent.green} size="small" />
            ) : expanded ? (
              <ChevronDown color={COLORS.text.secondary} size={20} />
            ) : (
              <ChevronRight color={COLORS.text.secondary} size={20} />
            )}
          </TouchableOpacity>
        );
      }

      if (item.kind === 'album') {
        const { album } = item;
        const id = album.browseId || album.id;
        const expanded = !!expandedAlbums[id];
        const loading = !!loadingAlbums[id];
        const count = albumTracks[id]?.length ?? 0;
        return (
          <TouchableOpacity
            style={styles.entityRow}
            onPress={() => void toggleAlbum(album)}
            activeOpacity={0.85}
          >
            {album.coverImageUrl ? (
              <Image source={{ uri: album.coverImageUrl }} style={styles.albumArt} />
            ) : (
              <View style={[styles.albumArt, styles.entityArtPlaceholder]}>
                <Disc3 color={COLORS.text.muted} size={22} />
              </View>
            )}
            <View style={styles.entityMeta}>
              <Text style={styles.entityTitle} numberOfLines={1}>
                {album.title}
              </Text>
              <Text style={styles.entitySub} numberOfLines={1}>
                {album.artist}
                {loading ? ' · Loading…' : expanded && count ? ` · ${count} tracks` : ''}
              </Text>
            </View>
            {loading ? (
              <ActivityIndicator color={COLORS.accent.green} size="small" />
            ) : expanded ? (
              <ChevronDown color={COLORS.text.secondary} size={20} />
            ) : (
              <ChevronRight color={COLORS.text.secondary} size={20} />
            )}
          </TouchableOpacity>
        );
      }

      return null;
    },
    [
      onPlay,
      results.tracks,
      currentTrack,
      isPlaying,
      toggleArtist,
      toggleAlbum,
      artistTracks,
      albumTracks,
      expandedAlbums,
      loadingAlbums,
    ]
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + SIZES.md }]}>
        <View style={styles.searchRow}>
          <SearchIcon color={COLORS.text.secondary} size={18} />
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search songs, artists, albums…"
            placeholderTextColor={COLORS.text.muted}
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => searchNow(query)}
          />
          {!!query && (
            <TouchableOpacity onPress={clear}>
              <X color={COLORS.text.secondary} size={18} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.filters}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.chip, filter === f && styles.chipActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isSearching && !hasAny ? (
        <ActivityIndicator style={{ marginTop: SIZES.xl }} color={COLORS.text.primary} />
      ) : error ? (
        <GlassCard intensity={20} style={styles.message}>
          <Text style={styles.messageText}>{error}</Text>
        </GlassCard>
      ) : !query ? (
        <View style={styles.suggestions}>
          {suggestions.map((s) => (
            <TouchableOpacity key={s} onPress={() => searchNow(s)} style={styles.suggestionRow}>
              <Text style={styles.suggestionText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.key}
          renderItem={renderRow}
          contentContainerStyle={{ paddingBottom: SIZES.bottomInset + 24 }}
          ListEmptyComponent={
            !isSearching ? (
              <GlassCard intensity={20} style={styles.message}>
                <Text style={styles.messageText}>No results for “{query}”.</Text>
              </GlassCard>
            ) : null
          }
          showsVerticalScrollIndicator={false}
          initialNumToRender={16}
          windowSize={11}
        />
      )}

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
  header: { paddingHorizontal: SIZES.md, marginBottom: SIZES.sm },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: SIZES.radius.md,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
  },
  input: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 16,
    color: COLORS.text.primary,
    paddingVertical: 6,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: SIZES.sm,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  chipActive: {
    backgroundColor: COLORS.accent.green,
    borderColor: COLORS.accent.green,
  },
  chipText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.text.secondary,
  },
  chipTextActive: { color: COLORS.background },
  sectionHeader: {
    paddingHorizontal: SIZES.md,
    paddingTop: SIZES.md,
    paddingBottom: SIZES.xs,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    letterSpacing: 0.6,
    color: COLORS.text.muted,
    textTransform: 'uppercase',
  },
  entityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.md,
    paddingVertical: 10,
    gap: 12,
  },
  entityArt: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.surfaceRaised,
  },
  albumArt: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceRaised,
  },
  entityArtPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  entityMeta: { flex: 1 },
  entityTitle: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.text.primary,
  },
  entitySub: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.muted,
    marginTop: 2,
  },
  indented: {
    paddingLeft: SIZES.sm,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.glassBorder,
    marginLeft: SIZES.md,
  },
  message: { margin: SIZES.md, padding: SIZES.md },
  messageText: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.secondary,
    textAlign: 'center',
  },
  suggestions: { paddingHorizontal: SIZES.md },
  suggestionRow: { paddingVertical: 12 },
  suggestionText: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: COLORS.text.secondary,
  },
});
