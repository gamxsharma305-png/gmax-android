import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search as SearchIcon, X } from 'lucide-react-native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { TrackRow } from '../components/lists/TrackRow';
import { AddToPlaylistSheet } from '../components/lists/AddToPlaylistSheet';
import { MiniPlayer } from '../components/player/MiniPlayer';
import { StatusBarScrim } from '../components/common/StatusBarScrim';
import { GlassCard } from '../components/common/GlassCard';
import { Track } from '../core/types';
import { useSearch } from '../hooks/useSearch';
import { usePlayer } from '../hooks/usePlayer';
import { useNavigation } from '@react-navigation/native';

const FILTERS = ['All', 'Songs', 'Artists', 'Albums', 'Playlists'] as const;

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
    hasResults,
  } = useSearch();
  const { playTrack, currentTrack, isPlaying, isLoading, togglePlayPause } = usePlayer();
  const [addingTrack, setAddingTrack] = useState<Track | null>(null);

  const onPlay = (track: Track) => {
    playTrack(track, { tracks: results.tracks, label: 'Search' });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + SIZES.md }]}>
        <View style={styles.searchRow}>
          <SearchIcon color={COLORS.text.secondary} size={18} />
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search songs, artists…"
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

      {isSearching && !hasResults ? (
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
          data={results.tracks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TrackRow
              track={item}
              onPress={onPlay}
              onMorePress={setAddingTrack}
              isPlaying={currentTrack?.id === item.id && isPlaying}
            />
          )}
          contentContainerStyle={{ paddingBottom: SIZES.bottomInset }}
          ListEmptyComponent={
            !isSearching ? (
              <GlassCard intensity={20} style={styles.message}>
                <Text style={styles.messageText}>No results for “{query}”.</Text>
              </GlassCard>
            ) : null
          }
          showsVerticalScrollIndicator={false}
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
    fontSize: 15,
    color: COLORS.text.primary,
    paddingVertical: 4,
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm, marginTop: SIZES.sm },
  chip: {
    paddingHorizontal: SIZES.md,
    paddingVertical: 6,
    borderRadius: SIZES.radius.pill,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  chipActive: { backgroundColor: COLORS.text.primary, borderColor: COLORS.text.primary },
  chipText: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.text.secondary },
  chipTextActive: { color: COLORS.background },
  suggestions: { paddingHorizontal: SIZES.md },
  suggestionRow: { paddingVertical: SIZES.sm },
  suggestionText: { fontFamily: FONTS.regular, fontSize: 15, color: COLORS.text.secondary },
  message: { margin: SIZES.md, padding: SIZES.lg },
  messageText: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.text.secondary },
});
