import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
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
  Download,
  Timer,
  Check,
} from 'lucide-react-native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { SeekBar } from '../components/player/SeekBar';
import { usePlayer } from '../hooks/usePlayer';
import { useLibrary } from '../hooks/useLibrary';
import { LibraryService } from '../services/LibraryService';
import { useNavigation } from '@react-navigation/native';

const SLEEP_OPTIONS = [
  { label: 'Off', minutes: 0 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '60 min', minutes: 60 },
] as const;

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
    retry,
  } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();

  const [savedOffline, setSavedOffline] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepLeftSec, setSleepLeftSec] = useState(0);
  const [timerOpen, setTimerOpen] = useState(false);
  const sleepEndAt = useRef<number | null>(null);
  const sleepTick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!currentTrack) {
      setSavedOffline(false);
      return;
    }
    setSavedOffline(LibraryService.isOffline(currentTrack.id));
  }, [currentTrack?.id]);

  useEffect(() => {
    return () => {
      if (sleepTick.current) clearInterval(sleepTick.current);
    };
  }, []);

  const clearSleepTimer = () => {
    if (sleepTick.current) clearInterval(sleepTick.current);
    sleepTick.current = null;
    sleepEndAt.current = null;
    setSleepMinutes(0);
    setSleepLeftSec(0);
  };

  const startSleepTimer = (minutes: number) => {
    if (sleepTick.current) clearInterval(sleepTick.current);
    if (minutes <= 0) {
      clearSleepTimer();
      setTimerOpen(false);
      return;
    }
    sleepEndAt.current = Date.now() + minutes * 60 * 1000;
    setSleepMinutes(minutes);
    setSleepLeftSec(minutes * 60);
    setTimerOpen(false);

    sleepTick.current = setInterval(() => {
      const end = sleepEndAt.current;
      if (!end) return;
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setSleepLeftSec(left);
      if (left <= 0) {
        clearSleepTimer();
        // Pause only — does not tear down MediaSession / engine
        if (isPlaying) togglePlayPause();
        else {
          // ensure paused if still playing via status lag
          try {
            togglePlayPause();
          } catch {
            /* ok */
          }
        }
      }
    }, 1000);
  };

  const onDownload = () => {
    if (!currentTrack) return;
    const result = LibraryService.saveOffline(currentTrack);
    setSavedOffline(true);
    setDownloadMsg(result.alreadyHad ? 'Already in Downloads' : 'Saved to Downloads');
    setTimeout(() => setDownloadMsg(null), 2000);
  };

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
  const sleepLabel =
    sleepMinutes > 0
      ? `${Math.floor(sleepLeftSec / 60)}:${String(sleepLeftSec % 60).padStart(2, '0')}`
      : 'Timer';

  return (
    <View style={[styles.container, { paddingTop: insets.top + SIZES.sm }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <ChevronDown color={COLORS.text.primary} size={28} />
        </TouchableOpacity>
        <Text style={styles.topLabel}>NOW PLAYING</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* A) Large poster / album art */}
      <View style={styles.artWrap}>
        <Image source={{ uri: currentTrack.albumImageUrl }} style={styles.art} />
      </View>

      <View style={styles.meta}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={2}>
            {currentTrack.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {currentTrack.artist.name}
          </Text>
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

      {/* B + C) Download | Sleep timer */}
      <View style={styles.extraRow}>
        <TouchableOpacity style={styles.extraBtn} onPress={onDownload} activeOpacity={0.75}>
          {savedOffline ? (
            <Check color={COLORS.accent.green} size={20} />
          ) : (
            <Download color={COLORS.text.secondary} size={20} />
          )}
          <Text style={[styles.extraLabel, savedOffline && { color: COLORS.accent.green }]}>
            {savedOffline ? 'Saved' : 'Download'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.extraBtn}
          onPress={() => setTimerOpen(true)}
          activeOpacity={0.75}
        >
          <Timer
            color={sleepMinutes > 0 ? COLORS.accent.green : COLORS.text.secondary}
            size={20}
          />
          <Text
            style={[
              styles.extraLabel,
              sleepMinutes > 0 && { color: COLORS.accent.green },
            ]}
          >
            {sleepLabel}
          </Text>
        </TouchableOpacity>
      </View>

      {downloadMsg ? <Text style={styles.toast}>{downloadMsg}</Text> : null}

      <Modal visible={timerOpen} transparent animationType="fade" onRequestClose={() => setTimerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setTimerOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Sleep timer</Text>
            <Text style={styles.modalHint}>Playback pauses when the timer ends</Text>
            {SLEEP_OPTIONS.map((opt) => {
              const active = sleepMinutes === opt.minutes;
              return (
                <TouchableOpacity
                  key={opt.label}
                  style={[styles.timerOption, active && styles.timerOptionActive]}
                  onPress={() => startSleepTimer(opt.minutes)}
                >
                  <Text style={[styles.timerOptionText, active && styles.timerOptionTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>

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
  extraRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SIZES.xl,
    marginTop: SIZES.xl,
  },
  extraBtn: {
    alignItems: 'center',
    gap: 6,
    minWidth: 88,
  },
  extraLabel: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.text.secondary,
  },
  toast: {
    textAlign: 'center',
    marginTop: SIZES.sm,
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.accent.green,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.surfaceRaised,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SIZES.lg,
    paddingBottom: SIZES.xxl,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  modalTitle: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.text.primary,
    marginBottom: 4,
  },
  modalHint: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.text.secondary,
    marginBottom: SIZES.md,
  },
  timerOption: {
    paddingVertical: 14,
    paddingHorizontal: SIZES.md,
    borderRadius: SIZES.radius.sm,
    marginBottom: 6,
    backgroundColor: COLORS.surfaceLight,
  },
  timerOptionActive: {
    backgroundColor: COLORS.text.primary,
  },
  timerOptionText: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.text.primary,
  },
  timerOptionTextActive: {
    color: COLORS.background,
  },
});
