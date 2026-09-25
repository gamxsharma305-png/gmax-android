import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Heart, ListMusic } from 'lucide-react-native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { MiniPlayer } from '../components/player/MiniPlayer';
import { StatusBarScrim } from '../components/common/StatusBarScrim';
import { GlassCard } from '../components/common/GlassCard';
import { useLibrary } from '../hooks/useLibrary';
import { usePlayer } from '../hooks/usePlayer';
import { useNavigation } from '@react-navigation/native';

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { playlists, likedPlaylist, createPlaylist } = useLibrary();
  const { currentTrack, isPlaying, isLoading, togglePlayPause } = usePlayer();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

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

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: SIZES.bottomInset, paddingHorizontal: SIZES.md }}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => openPlaylist(item.id)}>
            <View style={styles.cover}>
              {item.cover ? (
                <Image source={{ uri: item.cover }} style={styles.coverImg} />
              ) : item.id === 'liked' ? (
                <Heart color={COLORS.accent?.red ?? '#ff6b6b'} size={22} />
              ) : (
                <ListMusic color={COLORS.text.secondary} size={22} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.rowMeta}>{item.count} tracks</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <GlassCard intensity={20} style={{ padding: SIZES.lg }}>
            <Text style={{ color: COLORS.text.secondary, fontFamily: FONTS.regular }}>
              No playlists yet. Create one above.
            </Text>
          </GlassCard>
        }
        showsVerticalScrollIndicator={false}
      />

      <StatusBarScrim />

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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SIZES.md,
    paddingBottom: SIZES.md,
  },
  title: { fontFamily: FONTS.bold, fontSize: 32, color: COLORS.text.primary },
  createRow: {
    flexDirection: 'row',
    gap: SIZES.sm,
    paddingHorizontal: SIZES.md,
    marginBottom: SIZES.md,
  },
  input: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.text.primary,
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: SIZES.radius.sm,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
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
});
