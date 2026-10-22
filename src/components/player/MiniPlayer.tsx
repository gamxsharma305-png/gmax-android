import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Play, Pause, Heart } from 'lucide-react-native';
import { Track } from '../../core/types';
import { useProgress } from '../../hooks/usePlayer';
import { useLibrary } from '../../hooks/useLibrary';
import { COLORS, SIZES, FONTS } from '../../constants/theme';

interface MiniPlayerProps {
  track: Track | null;
  isPlaying: boolean;
  onPress: () => void;
  onPlayPause: () => void;
  tabBarHeight?: number;
  isLoading?: boolean;
}

const MiniPlayerProgress: React.FC = React.memo(() => {
  const { position, duration } = useProgress();
  const progressPercent =
    duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
    </View>
  );
});
MiniPlayerProgress.displayName = 'MiniPlayerProgress';

export const MiniPlayer: React.FC<MiniPlayerProps> = ({
  track,
  isPlaying,
  onPress,
  onPlayPause,
  tabBarHeight,
  isLoading = false,
}) => {
  const insets = useSafeAreaInsets();
  const { isLiked, toggleLike } = useLibrary();
  if (!track) return null;

  const systemBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 28 : 8);
  const tabH = tabBarHeight ?? 52 + systemBottom;
  const bottom = tabH + 8;
  const liked = isLiked(track.id);
  const art = track.albumImageUrl || '';

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onPress}
      style={[styles.positionContainer, { bottom }]}
    >
      <View style={styles.shell}>
        {/* Album art as soft background tint (Musify / iOS style) */}
        {art ? (
          <Image source={{ uri: art }} style={styles.bgArt} blurRadius={24} />
        ) : null}
        <View style={styles.bgDim} />
        <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFillObject} />

        <View style={styles.content}>
          <Image source={{ uri: art }} style={styles.image} />
          <View style={styles.infoContainer}>
            <Text style={styles.title} numberOfLines={1}>
              {track.title}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {track.artist?.name || 'Unknown'}
            </Text>
          </View>
          <View style={styles.controls}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={(e) => {
                e.stopPropagation?.();
                toggleLike(track);
              }}
              hitSlop={10}
            >
              <Heart
                color={liked ? '#ff6b6b' : '#fff'}
                fill={liked ? '#ff6b6b' : 'transparent'}
                size={20}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.playButton}
              onPress={(e) => {
                e.stopPropagation?.();
                onPlayPause();
              }}
              hitSlop={8}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : isPlaying ? (
                <Pause color="#fff" size={26} fill="#fff" />
              ) : (
                <Play color="#fff" size={26} fill="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
        <MiniPlayerProgress />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  positionContainer: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 100,
  },
  shell: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(30,30,30,0.85)',
  },
  bgArt: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    opacity: 0.55,
  },
  bgDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  image: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceLight,
  },
  infoContainer: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: '#fff',
  },
  artist: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    padding: 8,
  },
  playButton: {
    padding: 8,
  },
  progressTrack: {
    height: 2.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    width: '100%',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1DB954',
  },
});
