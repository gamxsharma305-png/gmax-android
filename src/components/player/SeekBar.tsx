import React, { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { COLORS, SIZES, FONTS } from '../../constants/theme';
import { useProgress } from '../../hooks/usePlayer';

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

type SeekBarProps = {
  onSeek: (seconds: number) => void;
};

export const SeekBar: React.FC<SeekBarProps> = ({ onSeek }) => {
  const { position, duration } = useProgress();

  const [barWidth, setBarWidth] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [displayPosition, setDisplayPosition] = useState(0);

  const barWidthRef = useRef(0);
  const durationRef = useRef(0);
  const displayRef = useRef(0);

  barWidthRef.current = barWidth;
  durationRef.current = Number.isFinite(duration) && duration > 0 ? duration : 0;

  const positionForX = useCallback((x: number): number => {
    const width = barWidthRef.current;
    const total = durationRef.current;

    if (!width || !total) return 0;
    if (!Number.isFinite(x)) return 0;

    const ratio = Math.min(1, Math.max(0, x / width));
    const seconds = ratio * total;

    if (!Number.isFinite(seconds)) return 0;
    return Math.min(total, Math.max(0, seconds));
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,

        onPanResponderGrant: (e) => {
          if (!durationRef.current) return;

          const next = positionForX(e.nativeEvent.locationX);
          displayRef.current = next;
          setDisplayPosition(next);
          setIsSeeking(true);
        },

        onPanResponderMove: (e) => {
          if (!durationRef.current) return;

          const next = positionForX(e.nativeEvent.locationX);

          displayRef.current = next;
          setDisplayPosition(next);
        },

        onPanResponderRelease: () => {
          if (!durationRef.current) {
            setIsSeeking(false);
            return;
          }
          onSeek(displayRef.current);
          setIsSeeking(false);
        },

        onPanResponderTerminate: () => {
          setIsSeeking(false);
        },
      }),
    [onSeek, positionForX]
  );

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safePosition = Number.isFinite(position) && position > 0 ? position : 0;

  const shown = isSeeking ? displayPosition : safePosition;
  const ratio = safeDuration > 0 ? Math.min(1, Math.max(0, shown / safeDuration)) : 0;
  const percent: `${number}%` = `${ratio * 100}%`;
  const remaining = Math.max(0, safeDuration - shown);

  return (
    <View style={styles.container}>
      <View
        style={styles.barBg}
        hitSlop={{ top: 20, bottom: 20, left: 0, right: 0 }}
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        <View style={[styles.barFill, { width: percent }]} />
        <View
          style={[styles.dot, { left: percent }, isSeeking && styles.dotActive]}
        />
      </View>

      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(shown)}</Text>
        <Text style={styles.timeText}>-{formatTime(remaining)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: SIZES.lg,
  },
  barBg: {
    height: 4,
    backgroundColor: COLORS.player.progressTrack,
    borderRadius: 2,
    marginBottom: SIZES.sm,
    justifyContent: 'center',
  },
  barFill: {
    height: '100%',
    backgroundColor: COLORS.text.primary,
    borderRadius: 2,
  },
  dot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.text.primary,
    marginLeft: -6,
  },
  dotActive: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
  },
});
