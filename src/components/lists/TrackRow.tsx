import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MoreVertical } from 'lucide-react-native';
import { Track } from '../../core/types';
import { COLORS, SIZES, FONTS } from '../../constants/theme';
import { useTheme } from '../../theme/ThemeContext';

interface TrackRowProps {
  track: Track;
  onPress: (track: Track) => void;
  isPlaying?: boolean;
  isLoading?: boolean;
  onMorePress?: (track: Track) => void;
}

const TrackRowComponent: React.FC<TrackRowProps> = ({
  track,
  onPress,
  isPlaying,
  isLoading,
  onMorePress,
}) => {
  const { accent } = useTheme();
  const handlePress = useCallback(() => onPress(track), [onPress, track]);
  const handleMorePress = useCallback(() => onMorePress?.(track), [onMorePress, track]);

  return (
    <TouchableOpacity style={styles.container} activeOpacity={0.7} onPress={handlePress}>
      <Image source={{ uri: track.albumImageUrl }} style={styles.image} />

      <View style={styles.infoContainer}>
        <Text
          style={[styles.title, isPlaying && { color: accent }]}
          numberOfLines={1}
        >
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artist?.name || 'Unknown'}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.moreButton}>
          <ActivityIndicator size="small" color={COLORS.text.secondary} />
        </View>
      ) : onMorePress ? (
        <TouchableOpacity style={styles.moreButton} onPress={handleMorePress} hitSlop={12}>
          <MoreVertical color={COLORS.text.secondary} size={18} />
        </TouchableOpacity>
      ) : (
        <View style={styles.moreButton} />
      )}
    </TouchableOpacity>
  );
};

export const TrackRow = React.memo(TrackRowComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.md,
    paddingVertical: 10,
    gap: 12,
  },
  image: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceRaised,
  },
  infoContainer: { flex: 1 },
  title: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.text.primary,
  },
  artist: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  moreButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
