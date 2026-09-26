import React, { useMemo, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Heart, ListMusic, X } from 'lucide-react-native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { MiniPlayer } from '../components/player/MiniPlayer';
import { StatusBarScrim } from '../components/common/StatusBarScrim';
import { useLibrary } from '../hooks/useLibrary';
import { usePlayer } from '../hooks/usePlayer';
import { useNavigation } from '@react-navigation/native';
import { AUTO_PLAYLISTS } from '../data/catalog';
import { MusicService } from '../services/MusicService';

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { playlists, likedPlaylist, createPlaylist } = useLibrary();
  const { currentTrack, isPlaying, isLoading, togglePlayPause, playTrack } = usePlayer();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [loadingGenre, setLoadingGenre] = useState<string | null>(null);
  const [autoError, setAutoError] = useState<string | null>(null);

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

  const playAutoMix = useCallback(
    async (mix: (typeof AUTO_PLAYLISTS)[0], save: boolean) => {
      if (loadingGenre) return;
      setAutoError(null);
      setLoadingGenre(mix.id);
      try {
        const results = await MusicService.search(mix.query, { limit: 25 });
        const tracks = results.tracks ?? [];
        if (!tracks.length) {
          setAutoError('No songs found for this mix. Try again.');
          return;
        }
        if (save) {
          const existing = playlists.find((p) => p.name === mix.name);
          if (existing) openPlaylist(existing.id);
          else {
            const p = createPlaylist(mix.name, { tracks, description: mix.description });
            openPlaylist(p.id);
          }
        }
        playTrack(tracks[0], { tracks, label: mix.name });
      } catch {
        setAutoError('Could not load mix. Check network.');
      } finally {
        setLoadingGenre(null);
      }
    },
    [loadingGenre, playTrack, playlists, createPlaylist]
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

  const ListHeader = (
    <>
      <Text style={styles.sectionLabel}>AUTO MIXES</Text>
      <Text style={styles.hint}>Tap to play · long-press to save in library</Text>
      {autoError ? <Text style={styles.error}>{autoError}</Text> : null}
      <View style={styles.mixGrid}>
        {AUTO_PLAYLISTS.map((g) => (
          <TouchableOpacity
            key={g.id}
            style={[styles.mixCard, { borderLeftColor: g.color }]}
            onPress={() => void playAutoMix(g, false)}
            onLongPress={() => void playAutoMix(g, true)}
            activeOpacity={0.75}
          >
            {loadingGenre === g.id ? (
              <ActivityIndicator size="small" color={g.color} />
            ) : (
              <>
                <Text style={styles.mixName} numberOfLines={1}>
                  {g.name}
                </Text>
                <Text style={styles.mixDesc} numberOfLines={1}>
                  {g.description}
                </Text>
              </>
            )}
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[styles.sectionLabel, { marginTop: SIZES.md }]}>YOUR PLAYLISTS</Text>
    </>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + SIZES.lg }]}>
        <Text style={styles.title}>Your Library</Text>
        <TouchableOpacity onPress={() => setCreating((v) => !v)} hitSlop={12}>
          {creating ? (
            <X color={COLORS.text.primary} size={24} />
          ) : (
            <Plus color={COLORS.text.primary} size={24} />
          )}
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

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={ListHeader}
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

      <MiniPlayer
        track={currentTrack}
        isPlaying={isPlaying}
        isLoading={isLoading}
        onPlayPause={togglePlayPause}
        onPress={() => navigation.navigate('NowPlaying' as never)}
      />
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
    marginBottom: 6,
  },
  hint: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.muted,
    marginBottom: SIZES.sm,
  },
  error: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#e07a5f',
    marginBottom: 8,
  },
  mixGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: SIZES.sm,
  },
  mixCard: {
    width: '48%',
    flexGrow: 1,
    minWidth: '45%',
    maxWidth: '48%',
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    minHeight: 64,
    justifyContent: 'center',
  },
  mixName: { fontFamily: FONTS.semiBold, fontSize: 14, color: COLORS.text.primary },
  mixDesc: { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.text.secondary, marginTop: 2 },
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
  rowMeta: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  empty: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.muted,
    textAlign: 'center',
    marginTop: 40,
  },
});
