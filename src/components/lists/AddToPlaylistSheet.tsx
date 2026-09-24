import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Heart, ListMusic, Plus, X } from 'lucide-react-native';
import { COLORS, SIZES, FONTS } from '../../constants/theme';
import { Track } from '../../core/types';
import { useLibrary } from '../../hooks/useLibrary';

type Props = {
  track: Track | null;
  onClose: () => void;
};

export const AddToPlaylistSheet: React.FC<Props> = ({ track, onClose }) => {
  const insets = useSafeAreaInsets();
  const {
    playlists,
    addToPlaylist,
    removeFromPlaylist,
    createPlaylist,
    toggleLike,
    isLiked,
  } = useLibrary();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setKeyboardHeight(e.endCoordinates.height)
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const liked = track ? isLiked(track.id) : false;

  const ordered = useMemo(
    () => [...playlists].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    [playlists]
  );

  const close = useCallback(() => {
    Keyboard.dismiss();
    setCreating(false);
    setNewName('');
    onClose();
  }, [onClose]);

  const toggleIn = useCallback(
    (playlistId: string, alreadyIn: boolean) => {
      if (!track) return;
      if (alreadyIn) removeFromPlaylist(playlistId, track.id);
      else addToPlaylist(playlistId, track);
    },
    [track, addToPlaylist, removeFromPlaylist]
  );

  const createAndAdd = useCallback(() => {
    const name = newName.trim();
    if (!name || !track) return;
    createPlaylist(name, [track]);
    Keyboard.dismiss();
    setNewName('');
    setCreating(false);
    close();
  }, [newName, track, createPlaylist, close]);

  if (!track) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <View style={[styles.backdrop, { paddingBottom: Math.max(insets.bottom, keyboardHeight) }]}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Add to playlist</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{track.title}</Text>
            </View>
            <TouchableOpacity onPress={close}>
              <X color={COLORS.text.secondary} size={22} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.row}
            onPress={() => toggleLike(track)}
          >
            <View style={styles.rowIcon}>
              <Heart
                color={liked ? COLORS.accent.red : COLORS.text.secondary}
                fill={liked ? COLORS.accent.red : 'transparent'}
                size={20}
              />
            </View>
            <Text style={styles.rowLabel}>{liked ? 'Liked' : 'Like'}</Text>
            {liked ? <Check color={COLORS.accent.green} size={18} /> : null}
          </TouchableOpacity>

          {creating ? (
            <View style={styles.createRow}>
              <TextInput
                style={styles.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="Playlist name"
                placeholderTextColor={COLORS.text.muted}
                autoFocus
                onSubmitEditing={createAndAdd}
              />
              <TouchableOpacity
                style={[styles.createButton, !newName.trim() && styles.disabled]}
                onPress={createAndAdd}
                disabled={!newName.trim()}
              >
                <Text style={styles.createButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.row} onPress={() => setCreating(true)}>
              <View style={styles.rowIcon}>
                <Plus color={COLORS.text.secondary} size={20} />
              </View>
              <Text style={styles.rowLabel}>New playlist</Text>
            </TouchableOpacity>
          )}

          <ScrollView style={styles.list}>
            {ordered.length === 0 ? (
              <Text style={styles.empty}>No playlists yet.</Text>
            ) : (
              ordered.map((p) => {
                const alreadyIn = p.tracks.some((t) => t.id === track.id);
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.row}
                    onPress={() => toggleIn(p.id, alreadyIn)}
                  >
                    <View style={styles.rowIcon}>
                      <ListMusic color={COLORS.text.secondary} size={20} />
                    </View>
                    <View style={styles.rowTextWrap}>
                      <Text style={styles.rowLabel}>{p.name}</Text>
                      <Text style={styles.rowMeta}>{p.tracks.length} songs</Text>
                    </View>
                    {alreadyIn ? <Check color={COLORS.accent.green} size={18} /> : null}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: COLORS.surfaceRaised,
    borderTopLeftRadius: SIZES.radius.lg,
    borderTopRightRadius: SIZES.radius.lg,
    padding: SIZES.lg,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SIZES.md,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: COLORS.text.primary,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SIZES.sm + 4,
    gap: SIZES.md,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: SIZES.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceLight,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowLabel: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.primary,
  },
  rowMeta: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    marginBottom: SIZES.sm,
  },
  input: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.primary,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: SIZES.radius.sm,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm + 4,
  },
  createButton: {
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm + 4,
    borderRadius: SIZES.radius.sm,
    backgroundColor: COLORS.text.primary,
  },
  createButtonText: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.background,
  },
  disabled: {
    opacity: 0.4,
  },
  empty: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.secondary,
    paddingVertical: SIZES.lg,
  },
});
