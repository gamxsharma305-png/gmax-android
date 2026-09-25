import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Heart,
} from 'lucide-react-native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { SeekBar } from '../components/player/SeekBar';
import { usePlayer } from '../hooks/usePlayer';
import { useLibrary } from '../hooks/useLibrary';
import { useNavigation } from '@react-navigation/native';

export default function NowPlayingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const {
    currentTrack,
    isPlaying,
    isLoading,
    togglePlayPause,
    next,
    previous,
    seekTo,
    shuffle,
    toggleShuffle,
    repeat,
    cycleRepeat,
    error,
    clearError,
    retry,
  } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();

  if (!currentTrack) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + SIZES.lg }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.close}>
          <ChevronDown color={COLORS.text.primary} size={28} />
        </TouchableOpacity>
        <Text style={styles.empty}>Nothing playing</Text>
      </View>
    );
  }

  const liked = isLiked(currentTrack.id);

  return (
    <View style={[styles.container, { paddingTop: insets.top + SIZES.sm }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <ChevronDown color={COLORS.text.primary} size={28} />
        </TouchableOpacity>
        <Text style={styles.topLabel}>NOW PLAYING</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.artWrap}>
        <Image source={{ uri: currentTrack.albumImageUrl }} style={styles.art} />
      </View>

      <View style={styles.meta}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={2}>{currentTrack.title}</Text>
          <Text style={styles.artist} numberOfLines={1}>{currentTrack.artist.name}</Text>
        </View>
        <TouchableOpacity onPress={() => toggleLike(currentTrack)}>
          <Heart
            color={liked ? '#ff6b6b' : COLORS.text.secondary}
            fill={liked ? '#ff6b6b' : 'transparent'}
            size={24}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.seekWrap}>
        <SeekBar onSeek={seekTo} />
      </View>

      {error ? (
        <TouchableOpacity onPress={retry} style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retry}>Tap to retry</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.controls}>
        <TouchableOpacity onPress={toggleShuffle}>
          <Shuffle color={shuffle ? COLORS.text.primary : COLORS.text.muted} size={22} />
        </TouchableOpacity>

        <TouchableOpacity onPress={previous}>
          <SkipBack color={COLORS.text.primary} size={28} fill={COLORS.text.primary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.playBtn} onPress={togglePlayPause}>
          {isLoading ? (
            <ActivityIndicator color={COLORS.background} />
          ) : isPlaying ? (
            <Pause color={COLORS.background} size={32} fill={COLORS.background} />
          ) : (
            <Play color={COLORS.background} size={32} fill={COLORS.background} />
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={next}>
          <SkipForward color={COLORS.text.primary} size={28} fill={COLORS.text.primary} />
        </TouchableOpacity>

        <TouchableOpacity onPress={cycleRepeat}>
          <Repeat
            color={repeat !== 'off' ? COLORS.text.primary : COLORS.text.muted}
            size={22}
          />
        </TouchableOpacity>
      </View>

      <View style={{ height: insets.bottom + SIZES.lg }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SIZES.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SIZES.lg,
  },
  topLabel: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    letterSpacing: 2,
    color: COLORS.text.muted,
  },
  close: { marginBottom: SIZES.lg },
  empty: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginTop: SIZES.xxl,
  },
  artWrap: { alignItems: 'center', marginBottom: SIZES.xl },
  art: {
    width: 280,
    height: 280,
    borderRadius: SIZES.radius.md,
    backgroundColor: COLORS.surfaceLight,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.md,
    marginBottom: SIZES.lg,
  },
  title: { fontFamily: FONTS.bold, fontSize: 22, color: COLORS.text.primary },
  artist: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: COLORS.text.secondary,
    marginTop: 4,
  },
  seekWrap: { marginBottom: SIZES.md },
  errorBox: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: SIZES.radius.sm,
    padding: SIZES.md,
    marginBottom: SIZES.md,
  },
  errorText: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.text.secondary },
  retry: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.text.primary, marginTop: 4 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.sm,
    marginTop: SIZES.md,
  },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.text.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
