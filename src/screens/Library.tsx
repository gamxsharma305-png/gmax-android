import React, { useMemo, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Heart, ListMusic, Radio } from 'lucide-react-native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { MiniPlayer } from '../components/player/MiniPlayer';
import { StatusBarScrim } from '../components/common/StatusBarScrim';
import { useLibrary } from '../hooks/useLibrary';
import { usePlayer } from '../hooks/usePlayer';
import { useNavigation } from '@react-navigation/native';
import { AUTO_GENRE_PLAYLISTS } from '../data/catalog';
import { MusicService } from '../services/MusicService';

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { playlists, likedPlaylist, createPlaylist } = useLibrary();
  const { currentTrack, isPlaying, isLoading, togglePlayPause, playTracks } = usePlayer();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [loadingGenre, setLoadingGenre] = useState<string | null>(null);

  const ordered = useMemo(
    () => [...playlists].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    [playlists]
  );

  const openPlaylist = (id: string) => {
    navigation.navigate('Playlist' as never, { playlistId: id } as never);
  };

  const onCreate = () => {
    const name = newName.trim();
    if (!name) return;
    const p = createPlaylist(name);
    setNewName('');
    setCreating(false);
    openPlaylist(p.id);
  };

  const playAutoGenre = useCallback(
    async (genre: (typeof AUTO_GENRE_PLAYLISTS)[0]) => {
      if (loadingGenre) return;
      setLoadingGenre(genre.id);
      try {
        const results = await MusicService.search(genre.query, { limit: 30 });
        const tracks = results.tracks ?? [];
        if (tracks.length && playTracks) {
          await playTracks(tracks, 0);
        } else if (tracks.length) {
          // Fallback: create playlist and open
          const p = createPlaylist(genre.name, { tracks, description: 'Auto playlist' });
          openPlaylist(p.id);
        }
      } catch {
        // ignore — user can retry
      } finally {
        setLoadingGenre(null);
      }
    },
    [loadingGenre, playTracks, createPlaylist]
  );

  const data = [
    { id: 'liked', name: 'Liked Songs', count: likedPlaylist.tracks.length, cover: null },
    ...ordered.map((p) => ({
      id: p.id,
      name: p.name,
      count: p.tracks.length,
      cover: p.coverImageUrl || null,
    })),
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + SIZES.lg }]}>
        <Text style={styles.title}>Library</Text>
        <TouchableOpacity onPress={() => setCreating((v) => !v)}>
          <Plus color={COLORS.text.primary} size={24} />
        </TouchableOpacity>
      </View>

      {creating && (
        <View style={styles.createRow}>
          <TextInput
            style={styles.input}
            value={newName}
            onChangeText={setNewName}
            placeholder="Playlist name"
            placeholderTextColor={COLORS.text.muted}
            autoFocus
            onSubmitEditing={onCreate}
          />
          <TouchableOpacity style={styles.createBtn} onPress={onCreate}>
            <Text style={styles.createBtnText}>Create</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.sectionLabel}>AUTO PLAYLISTS</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.genreRow}
      >
        {AUTO_GENRE_PLAYLISTS.map((g) => (
          <TouchableOpacity
            key={g.id}
            style={[styles.genreChip, { borderColor: g.color + '66', backgroundColor: g.color + '22' }]}
            onPress={() => void playAutoGenre(g)}
            activeOpacity={0.8}
          >
            {loadingGenre === g.id ? (
              <ActivityIndicator size="small" color={g.color} />
            ) : (
              <Radio size={14} color={g.color} />
            )}
            <Text style={[styles.genreText, { color: g.color }]}>{g.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.sectionLabel}>YOUR PLAYLISTS</Text>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: SIZES.md,
          paddingBottom: currentTrack ? 100 : insets.bottom + 24,
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>No playlists yet. Create one above.</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => openPlaylist(item.id)}
            activeOpacity={0.7}
          >
            <View style={styles.cover}>
              {item.cover ? (
                <Image source={{ uri: item.cover }} style={styles.coverImg} />
              ) : item.id === 'liked' ? (
                <Heart size={22} color={COLORS.accent} fill={COLORS.accent} />
              ) : (
                <ListMusic size={22} color={COLORS.text.secondary} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.rowMeta}>{item.count} songs</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      {currentTrack ? (
        <MiniPlayer
          track={currentTrack}
          isPlaying={isPlaying}
          isLoading={isLoading}
          onToggle={togglePlayPause}
          onOpen={() => navigation.navigate('NowPlaying' as never)}
        />
      ) : null}
      <StatusBarScrim />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.md,
    paddingBottom: SIZES.md,
  },
  title: { fontFamily: FONTS.bold, fontSize: 28, color: COLORS.text.primary },
  sectionLabel: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    letterSpacing: 2,
    color: COLORS.text.muted,
    marginHorizontal: SIZES.md,
    marginTop: SIZES.sm,
    marginBottom: SIZES.sm,
  },
  genreRow: {
    paddingHorizontal: SIZES.md,
    gap: 8,
    paddingBottom: SIZES.sm,
  },
  genreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  genreText: { fontFamily: FONTS.medium, fontSize: 13 },
  createRow: {
    flexDirection: 'row',
    paddingHorizontal: SIZES.md,
    gap: SIZES.sm,
    marginBottom: SIZES.md,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: SIZES.radius.sm,
    paddingHorizontal: SIZES.md,
    paddingVertical: 10,
    color: COLORS.text.primary,
    fontFamily: FONTS.regular,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  createBtn: {
    backgroundColor: COLORS.text.primary,
    borderRadius: SIZES.radius.sm,
    paddingHorizontal: SIZES.md,
    justifyContent: 'center',
  },
  createBtnText: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.background },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.md,
    paddingVertical: SIZES.sm + 4,
  },
  cover: {
    width: 56,
    height: 56,
    borderRadius: SIZES.radius.sm,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverImg: { width: '100%', height: '100%' },
  rowTitle: { fontFamily: FONTS.medium, fontSize: 16, color: COLORS.text.primary },
  rowMeta: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.text.secondary, marginTop: 2 },
  empty: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.muted,
    textAlign: 'center',
    marginTop: 40,
  },
});
