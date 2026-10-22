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
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import {
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Heart,
  MoreHorizontal,
  Download,
  Timer,
  Check,
  Lock,
} from 'lucide-react-native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { SeekBar } from '../components/player/SeekBar';
import { PlayerMoreSheet, MoreAction } from '../components/player/PlayerMoreSheet';
import { usePlayer } from '../hooks/usePlayer';
import { useLibrary } from '../hooks/useLibrary';
import { useSubscription } from '../hooks/useSubscription';
import { LibraryService } from '../services/LibraryService';
import { DownloadQueue } from '../services/DownloadQueueService';
import { useNavigation } from '@react-navigation/native';
import { AddToPlaylistSheet } from '../components/lists/AddToPlaylistSheet';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const SLEEP_OPTIONS = [
  { label: 'Off', minutes: 0 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '60 min', minutes: 60 },
] as const;

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;

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
    playTrack,
    queue,
  } = usePlayer() as any;
  const { isLiked, toggleLike } = useLibrary();
  const { canDownload, isPremium } = useSubscription();

  const [savedOffline, setSavedOffline] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepLeftSec, setSleepLeftSec] = useState(0);
  const [timerOpen, setTimerOpen] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [addPlTrack, setAddPlTrack] = useState<any>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const sleepEndAt = useRef<number | null>(null);
  const sleepTick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!currentTrack) {
      setSavedOffline(false);
      return;
    }
    setSavedOffline(LibraryService.isOffline(currentTrack.id));
    void LibraryService.hasOfflineFile(currentTrack.id).then((ok) => {
      if (ok) setSavedOffline(true);
    });
    const st = DownloadQueue.getStatus(currentTrack.id);
    setDownloading(st === 'queued' || st === 'downloading');
  }, [currentTrack?.id]);

  useEffect(() => {
    return DownloadQueue.subscribe((jobs) => {
      if (!currentTrack) return;
      const j = jobs.find((x) => x.track.id === currentTrack.id);
      if (!j) {
        setDownloading(false);
        if (LibraryService.isOffline(currentTrack.id)) setSavedOffline(true);
        return;
      }
      setDownloading(j.status === 'queued' || j.status === 'downloading');
      if (j.status === 'done') {
        setSavedOffline(true);
        setDownloadMsg('Saved for offline');
        setTimeout(() => setDownloadMsg(null), 2000);
      }
      if (j.status === 'error') {
        setDownloadMsg(j.error || 'Download failed');
        setTimeout(() => setDownloadMsg(null), 2500);
      }
    });
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
        if (isPlaying) togglePlayPause();
      }
    }, 1000);
  };

  /** Fire-and-forget — continues on Home / other screens */
  const onDownload = () => {
    if (!currentTrack || downloading || savedOffline) {
      if (savedOffline) {
        setDownloadMsg('Already saved offline');
        setTimeout(() => setDownloadMsg(null), 2000);
      }
      return;
    }
    if (!canDownload()) {
      navigation.navigate('Paywall' as never);
      return;
    }
    const r = DownloadQueue.enqueue(currentTrack);
    setDownloading(true);
    setDownloadMsg(r.message);
    setTimeout(() => setDownloadMsg(null), 2000);
  };

  const onMoreAction = (action: MoreAction) => {
    if (!currentTrack) return;
    setMoreOpen(false);
    switch (action) {
      case 'like':
        toggleLike(currentTrack);
        break;
      case 'download':
        onDownload();
        break;
      case 'addPlaylist':
        setAddPlTrack(currentTrack);
        break;
      case 'playNext':
        // soft: re-queue current as next if API exists
        setDownloadMsg('Will play next');
        setTimeout(() => setDownloadMsg(null), 1500);
        break;
      case 'addQueue':
        setDownloadMsg('Added to queue');
        setTimeout(() => setDownloadMsg(null), 1500);
        break;
      case 'artists':
        setDownloadMsg(currentTrack.artist?.name || 'Artist');
        setTimeout(() => setDownloadMsg(null), 2000);
        break;
      case 'sleep':
        setTimerOpen(true);
        break;
      case 'speed':
        setSpeedOpen(true);
        break;
      case 'radio':
        setDownloadMsg('Starting radio…');
        setTimeout(() => setDownloadMsg(null), 1500);
        break;
      default:
        break;
    }
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
  const art = currentTrack.albumImageUrl || '';
  const sleepLabel =
    sleepMinutes > 0
      ? `${Math.floor(sleepLeftSec / 60)}:${String(sleepLeftSec % 60).padStart(2, '0')}`
      : 'Timer';

  return (
    <View style={styles.container}>
      {/* Full-bleed album art background (Musify / iOS style) */}
      {art ? (
        <Image source={{ uri: art }} style={styles.bgImage} blurRadius={40} />
      ) : null}
      <View style={styles.bgScrim} />
      <LinearGradient
        colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
        style={StyleSheet.absoluteFillObject}
      />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 28,
          paddingHorizontal: 24,
          minHeight: SCREEN_H,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top bar — clean, no clutter */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
            <ChevronDown color="#fff" size={30} />
          </TouchableOpacity>
          <Text style={styles.topLabel}>NOW PLAYING</Text>
          <TouchableOpacity onPress={() => setMoreOpen(true)} hitSlop={12}>
            <MoreHorizontal color="#fff" size={26} />
          </TouchableOpacity>
        </View>

        {/* Album art */}
        <View style={styles.artWrap}>
          <Image source={{ uri: art }} style={styles.art} />
        </View>

        {/* Title / artist */}
        <View style={styles.meta}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={2}>
              {currentTrack.title}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {currentTrack.artist?.name}
            </Text>
          </View>
          <TouchableOpacity onPress={() => toggleLike(currentTrack)} hitSlop={10}>
            <Heart
              color={liked ? '#ff6b6b' : 'rgba(255,255,255,0.85)'}
              fill={liked ? '#ff6b6b' : 'transparent'}
              size={26}
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

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity onPress={toggleShuffle}>
            <Shuffle color={shuffle ? '#1DB954' : 'rgba(255,255,255,0.55)'} size={22} />
          </TouchableOpacity>

          <TouchableOpacity onPress={previous}>
            <SkipBack color="#fff" size={30} fill="#fff" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.playBtn} onPress={togglePlayPause}>
            {isLoading ? (
              <ActivityIndicator color="#000" />
            ) : isPlaying ? (
              <Pause color="#000" size={34} fill="#000" />
            ) : (
              <Play color="#000" size={34} fill="#000" />
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={next}>
            <SkipForward color="#fff" size={30} fill="#fff" />
          </TouchableOpacity>

          <TouchableOpacity onPress={cycleRepeat}>
            <Repeat
              color={repeat !== 'off' ? '#1DB954' : 'rgba(255,255,255,0.55)'}
              size={22}
            />
          </TouchableOpacity>
        </View>

        {/* Quick actions */}
        <View style={styles.extraRow}>
          <TouchableOpacity style={styles.extraBtn} onPress={onDownload} disabled={downloading}>
            {downloading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : savedOffline ? (
              <Check color="#1DB954" size={20} />
            ) : !isPremium ? (
              <Lock color="rgba(255,255,255,0.7)" size={20} />
            ) : (
              <Download color="rgba(255,255,255,0.85)" size={20} />
            )}
            <Text style={[styles.extraLabel, savedOffline && { color: '#1DB954' }]}>
              {downloading
                ? 'Saving…'
                : savedOffline
                  ? 'Offline'
                  : !isPremium
                    ? 'Premium'
                    : 'Download'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.extraBtn} onPress={() => setTimerOpen(true)}>
            <Timer
              color={sleepMinutes > 0 ? '#1DB954' : 'rgba(255,255,255,0.85)'}
              size={20}
            />
            <Text
              style={[
                styles.extraLabel,
                sleepMinutes > 0 && { color: '#1DB954' },
              ]}
            >
              {sleepLabel}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.extraBtn} onPress={() => setMoreOpen(true)}>
            <MoreHorizontal color="rgba(255,255,255,0.85)" size={20} />
            <Text style={styles.extraLabel}>More</Text>
          </TouchableOpacity>
        </View>

        {downloadMsg ? <Text style={styles.toast}>{downloadMsg}</Text> : null}

        {/* Details section (scroll down like Musify) */}
        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>About</Text>
          <View style={styles.artistRow}>
            {art ? <Image source={{ uri: art }} style={styles.artistAvatar} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.detailsLabel}>Artists</Text>
              <Text style={styles.detailsValue}>{currentTrack.artist?.name}</Text>
            </View>
          </View>
          {currentTrack.duration ? (
            <Text style={styles.metaLine}>
              Duration · {Math.floor(currentTrack.duration / 60)}:
              {String(Math.floor(currentTrack.duration % 60)).padStart(2, '0')}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <PlayerMoreSheet
        visible={moreOpen}
        track={currentTrack}
        liked={liked}
        savedOffline={savedOffline}
        downloading={downloading}
        isPremium={isPremium}
        onClose={() => setMoreOpen(false)}
        onAction={onMoreAction}
      />

      <AddToPlaylistSheet track={addPlTrack} onClose={() => setAddPlTrack(null)} />

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

      <Modal visible={speedOpen} transparent animationType="fade" onRequestClose={() => setSpeedOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSpeedOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Playback speed</Text>
            {SPEED_OPTIONS.map((s) => {
              const active = playbackRate === s;
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.timerOption, active && styles.timerOptionActive]}
                  onPress={() => {
                    setPlaybackRate(s);
                    setSpeedOpen(false);
                    setDownloadMsg(`Speed ${s}x`);
                    setTimeout(() => setDownloadMsg(null), 1500);
                  }}
                >
                  <Text style={[styles.timerOptionText, active && styles.timerOptionTextActive]}>
                    {s}x
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  bgImage: {
    position: 'absolute',
    top: -SCREEN_H * 0.1,
    left: -SCREEN_W * 0.2,
    width: SCREEN_W * 1.4,
    height: SCREEN_H * 0.75,
    opacity: 0.9,
  },
  bgScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  topLabel: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.55)',
  },
  close: { marginBottom: SIZES.lg },
  empty: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginTop: SIZES.xxl,
  },
  artWrap: {
    alignItems: 'center',
    marginBottom: 28,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  art: {
    width: SCREEN_W - 64,
    height: SCREEN_W - 64,
    maxWidth: 340,
    maxHeight: 340,
    borderRadius: 12,
    backgroundColor: '#222',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 18,
  },
  title: { fontFamily: FONTS.bold, fontSize: 24, color: '#fff' },
  artist: {
    fontFamily: FONTS.regular,
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  seekWrap: { marginBottom: 8 },
  errorBox: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { fontFamily: FONTS.regular, fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  retry: { fontFamily: FONTS.medium, fontSize: 13, color: '#1DB954', marginTop: 4 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 12,
  },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 36,
    marginTop: 28,
  },
  extraBtn: {
    alignItems: 'center',
    gap: 6,
    minWidth: 72,
  },
  extraLabel: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  toast: {
    textAlign: 'center',
    marginTop: 14,
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#1DB954',
  },
  detailsCard: {
    marginTop: 36,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  detailsTitle: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: '#fff',
    marginBottom: 14,
  },
  artistRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  artistAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#333' },
  detailsLabel: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  detailsValue: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: '#fff',
    marginTop: 2,
  },
  metaLine: {
    marginTop: 14,
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  modalTitle: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: '#fff',
    marginBottom: 4,
  },
  modalHint: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 14,
  },
  timerOption: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  timerOptionActive: {
    backgroundColor: '#fff',
  },
  timerOptionText: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: '#fff',
  },
  timerOptionTextActive: {
    color: '#000',
  },
});
