import React from 'react';
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
import { Play, Pause } from 'lucide-react-native';
import { Track } from '../../core/types';
import { useProgress } from '../../hooks/usePlayer';
import { COLORS, SIZES, FONTS, SHADOWS } from '../../constants/theme';

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
  if (!track) return null;

  // Sit above tab bar + system nav (never under phone buttons)
  const systemBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 28 : 8);
  const tabH = tabBarHeight ?? 52 + systemBottom;
  const bottom = tabH + 6;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.positionContainer, { bottom }]}
    >
      <View style={[styles.container, SHADOWS.glass]}>
        <View style={styles.content}>
          <Image
            source={{ uri: track.albumImageUrl }}
            style={styles.image}
          />
          <View style={styles.infoContainer}>
            <Text style={styles.title} numberOfLines={1}>
              {track.title}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {track.artist?.name || 'Unknown'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.playButton}
            onPress={onPlayPause}
            hitSlop={8}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={COLORS.text.primary} />
            ) : isPlaying ? (
              <Pause
                color={COLORS.text.primary}
                size={24}
                fill={COLORS.text.primary}
              />
            ) : (
              <Play
                color={COLORS.text.primary}
                size={24}
                fill={COLORS.text.primary}
              />
            )}
          </TouchableOpacity>
        </View>
        <MiniPlayerProgress />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  positionContainer: {
    position: 'absolute',
    left: SIZES.sm,
    right: SIZES.sm,
    zIndex: 100,
  },
  container: {
    borderRadius: SIZES.radius.md,
    overflow: 'hidden',
    backgroundColor: COLORS.surfaceRaised,
    borderColor: COLORS.glassBorder,
    borderWidth: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  image: {
    width: 40,
    height: 40,
    borderRadius: SIZES.radius.sm,
    backgroundColor: COLORS.surfaceLight,
  },
  infoContainer: {
    flex: 1,
    marginLeft: SIZES.sm,
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.text.primary,
  },
  artist: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  playButton: {
    padding: SIZES.sm,
    marginLeft: SIZES.xs,
  },
  progressTrack: {
    height: 2,
    backgroundColor: COLORS.player.progressTrack,
    width: '100%',
    position: 'absolute',
    bottom: 0,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.player.progressFill,
  },
});
