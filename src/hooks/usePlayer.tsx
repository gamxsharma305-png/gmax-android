import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';
import { AppError, messageFor, toAppError } from '../core/errors';
import { RepeatMode, Track } from '../core/types';
import { flushWrites, readJson, writeJsonDebounced, STORAGE_KEYS } from '../core/storage';
import { playbackEngine, IDLE_STATUS, PlaybackStatus } from '../playback/PlaybackEngine';
import { Queue, QueueSnapshot, EMPTY_QUEUE } from '../playback/queue';
import { preloader } from '../playback/preload';
import { endpointSource } from '../providers/stream/StreamResolver';
import { LibraryService } from '../services/LibraryService';
import { MusicService } from '../services/MusicService';

type PlayerContextType = {
  currentTrack: Track | null;
  isPlaying: boolean;
  playTrack: (track: Track, context?: { tracks?: Track[]; label?: string }) => void;
  togglePlayPause: () => void;
  isLoading: boolean;
  isBuffering: boolean;
  error: string | null;
  clearError: () => void;
  retry: () => void;
  duration: number;
  volume: number;
  setVolume: (v: number) => void;
  seekTo: (seconds: number) => void;
  seekBy: (deltaSeconds: number) => void;
  next: () => void;
  previous: () => void;
  hasNext: boolean;
  hasPrevious: boolean;
  queue: Track[];
  upcoming: Track[];
  queueContext: string;
  addToQueue: (tracks: Track | Track[]) => void;
  playNext: (tracks: Track | Track[]) => void;
  removeFromQueue: (trackId: string) => void;
  reorderQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  jumpTo: (trackId: string) => void;
  shuffle: boolean;
  toggleShuffle: () => void;
  repeat: RepeatMode;
  cycleRepeat: () => void;
  isReady: boolean;
  canPlayCurrent: boolean;
};

const HISTORY_MIN_SECONDS = 20;
const HISTORY_MIN_RATIO = 0.25;
const MAX_AUTO_SKIPS = 3;

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);
const ProgressContext = createContext<{ position: number; duration: number }>({
  position: 0,
  duration: 0,
});

export const PlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const queueRef = useRef(new Queue());

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [status, setStatus] = useState<PlaybackStatus>(IDLE_STATUS);
  const statusRef = useRef<PlaybackStatus>(IDLE_STATUS);
  statusRef.current = status;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [queueVersion, setQueueVersion] = useState(0);
  const [volume, setVolumeState] = useState(1);

  const loadAbort = useRef<AbortController | null>(null);
  const loadId = useRef(0);
  const lastAttempt = useRef<{ track: Track; position: number } | null>(null);
  const loadingTrackId = useRef<string | null>(null);
  const autoSkips = useRef(0);
  const historyWrittenFor = useRef<number | null>(null);

  const bumpQueue = useCallback(() => setQueueVersion((v) => v + 1), []);

  const persistQueue = useCallback(() => {
    writeJsonDebounced(STORAGE_KEYS.queue, queueRef.current.snapshot(), 600);
  }, []);

  const loadCurrent = useCallback(
    async (options: { autoPlay?: boolean; startPosition?: number } = {}) => {
      const track = queueRef.current.current;
      if (!track) {
        setCurrentTrack(null);
        setIsLoading(false);
        playbackEngine.stop();
        return;
      }

      const id = ++loadId.current;

      if (loadingTrackId.current !== track.id) {
        loadAbort.current?.abort();
      }

      const controller = new AbortController();
      loadAbort.current = controller;
      loadingTrackId.current = track.id;
      historyWrittenFor.current = null;
      preloader.adopt(track.id);

      setCurrentTrack(track);
      setError(null);
      setIsLoading(true);
      lastAttempt.current = { track, position: options.startPosition ?? 0 };

      try {
        const stream = await MusicService.resolveStream(track, controller.signal);
        if (id !== loadId.current) return;

        await playbackEngine.load(track, stream, options);
        if (id !== loadId.current) return;

        setIsLoading(false);
        autoSkips.current = 0;
        loadingTrackId.current = null;
        LibraryService.recordPlay(track);
        preloader.schedule(queueRef.current.peekNext());
      } catch (e) {
        if (id !== loadId.current) return;

        setIsLoading(false);
        loadingTrackId.current = null;
        const err = toAppError(e, 'playback_failed');

        if (err.kind !== 'network' && err.kind !== 'timeout') {
          MusicService.invalidateStream(track);
        }

        const skippable =
          err.kind === 'track_unavailable' ||
          err.kind === 'region_restricted' ||
          err.kind === 'source_unavailable';

        if (skippable && autoSkips.current < MAX_AUTO_SKIPS && queueRef.current.hasNext) {
          autoSkips.current += 1;
          queueRef.current.next(false);
          bumpQueue();
          persistQueue();
          void loadCurrent({ autoPlay: true });
          return;
        }

        autoSkips.current = 0;
        setError(messageFor(err));
      }
    },
    [bumpQueue, persistQueue]
  );

  const extendWithRelated = useCallback(async () => {
    const settings = LibraryService.getSettings();
    const last = queueRef.current.current;
    if (!settings.autoplayRelated || !last) return;

    try {
      const related = await MusicService.getRelated(last);
      const fresh = related.filter((t) => !queueRef.current.items.some((q) => q.id === t.id));
      if (!fresh.length) return;

      queueRef.current.add(fresh.slice(0, 20));
      const nextTrack = queueRef.current.next(false);
      bumpQueue();
      persistQueue();
      if (nextTrack) void loadCurrent({ autoPlay: true });
    } catch {
      // silence
    }
  }, [bumpQueue, loadCurrent, persistQueue]);

  useEffect(() => {
    playbackEngine.on('onStatus', (s) => setStatus(s));

    playbackEngine.on('onComplete', () => {
      const nextTrack = queueRef.current.next(true);
      bumpQueue();
      persistQueue();
      if (!nextTrack) {
        void extendWithRelated();
        return;
      }
      void loadCurrent({ autoPlay: true });
    });

    playbackEngine.on('onError', (e) => {
      setIsLoading(false);
      setError(messageFor(e instanceof AppError ? e : toAppError(e, 'playback_failed')));
    });

    return () => {
      preloader.cancel();
      void playbackEngine.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await Promise.all([MusicService.init(), LibraryService.load()]);
        if (cancelled) return;

        const settings = LibraryService.getSettings();
        endpointSource.setEndpoints(settings.resolverEndpoints);

        playbackEngine.setVolume(settings.volume);
        setVolumeState(settings.volume);
        void playbackEngine.configure();

        const snapshot = await readJson<QueueSnapshot>(STORAGE_KEYS.queue, EMPTY_QUEUE);
        if (cancelled) return;

        if (snapshot.tracks?.length) {
          queueRef.current.restore(snapshot);
          bumpQueue();

          const restored = queueRef.current.current;
          if (restored) {
            const saved = await LibraryService.getSavedPlayback();
            if (cancelled) return;

            setCurrentTrack(restored);
            lastAttempt.current = {
              track: restored,
              position: saved.trackId === restored.id ? saved.position : 0,
            };
          }
        }
      } catch {
        // ignore corrupt restore
      } finally {
        if (!cancelled) setIsReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const positionSecond = Math.floor(status.position);

  useEffect(() => {
    if (!currentTrack) return;
    LibraryService.savePlayback(currentTrack.id, positionSecond);

    if (historyWrittenFor.current === loadId.current) return;

    const trackDuration = status.duration || currentTrack.duration || 0;
    const threshold = Math.min(
      HISTORY_MIN_SECONDS,
      trackDuration > 0 ? trackDuration * HISTORY_MIN_RATIO : HISTORY_MIN_SECONDS
    );

    if (positionSecond >= threshold && positionSecond > 0) {
      historyWrittenFor.current = loadId.current;
      LibraryService.recordListen(currentTrack);
    }
  }, [currentTrack, positionSecond, status.duration]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') void flushWrites();
    });

    let onHide: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      onHide = () => void flushWrites();
      window.addEventListener('pagehide', onHide);
    }

    return () => {
      sub.remove();
      if (onHide && typeof window !== 'undefined') {
        window.removeEventListener('pagehide', onHide);
      }
    };
  }, []);

  const playTrack = useCallback(
    (track: Track, context?: { tracks?: Track[]; label?: string }) => {
      const list = context?.tracks?.length ? context.tracks : [track];
      const startIndex = Math.max(
        0,
        list.findIndex((t) => t.id === track.id)
      );
      queueRef.current.setTracks(list, startIndex, context?.label ?? '');
      bumpQueue();
      persistQueue();
      void loadCurrent({ autoPlay: true });
    },
    [bumpQueue, loadCurrent, persistQueue]
  );

  const togglePlayPause = useCallback(() => {
    const track = queueRef.current.current ?? currentTrack;
    if (!track) return;

    if (playbackEngine.trackId !== track.id) {
      if (!queueRef.current.current) {
        queueRef.current.setTracks([track], 0, '');
        bumpQueue();
      }
      void loadCurrent({
        autoPlay: true,
        startPosition: lastAttempt.current?.position ?? 0,
      });
      return;
    }

    if (status.isPlaying) playbackEngine.pause();
    else playbackEngine.play();
  }, [bumpQueue, currentTrack, loadCurrent, status.isPlaying]);

  const next = useCallback(() => {
    const nextTrack = queueRef.current.next(false);
    bumpQueue();
    persistQueue();
    if (!nextTrack) {
      void extendWithRelated();
      return;
    }
    void loadCurrent({ autoPlay: true });
  }, [bumpQueue, extendWithRelated, loadCurrent, persistQueue]);

  const previous = useCallback(() => {
    if (statusRef.current.position > 3) {
      void playbackEngine.seekTo(0);
      return;
    }
    queueRef.current.previous();
    bumpQueue();
    persistQueue();
    void loadCurrent({ autoPlay: true });
  }, [bumpQueue, loadCurrent, persistQueue]);

  const seekTo = useCallback((seconds: number) => {
    void playbackEngine.seekTo(seconds);
  }, []);

  const seekBy = useCallback(
    (deltaSeconds: number) => {
      const { duration, position } = statusRef.current;
      const total = duration || currentTrack?.duration || 0;
      const target = position + deltaSeconds;
      const clamped = total > 0 ? Math.min(total, Math.max(0, target)) : Math.max(0, target);
      void playbackEngine.seekTo(clamped);
    },
    [currentTrack?.duration]
  );

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    playbackEngine.setVolume(clamped);
    setVolumeState(clamped);
    LibraryService.updateSettings({ volume: clamped });
  }, []);

  const retry = useCallback(() => {
    const attempt = lastAttempt.current;
    if (!attempt) return;
    setError(null);
    MusicService.invalidateStream(attempt.track);
    void loadCurrent({ autoPlay: true, startPosition: attempt.position });
  }, [loadCurrent]);

  const clearError = useCallback(() => setError(null), []);

  const addToQueue = useCallback(
    (tracks: Track | Track[]) => {
      const wasEmpty = queueRef.current.length === 0;
      queueRef.current.add(tracks);
      bumpQueue();
      persistQueue();
      if (wasEmpty) void loadCurrent({ autoPlay: true });
    },
    [bumpQueue, loadCurrent, persistQueue]
  );

  const playNextInQueue = useCallback(
    (tracks: Track | Track[]) => {
      const wasEmpty = queueRef.current.length === 0;
      queueRef.current.playNext(tracks);
      bumpQueue();
      persistQueue();
      if (wasEmpty) void loadCurrent({ autoPlay: true });
      else preloader.schedule(queueRef.current.peekNext());
    },
    [bumpQueue, loadCurrent, persistQueue]
  );

  const removeFromQueue = useCallback(
    (trackId: string) => {
      const removedCurrent = queueRef.current.remove(trackId);
      bumpQueue();
      persistQueue();
      if (removedCurrent) {
        if (queueRef.current.current) void loadCurrent({ autoPlay: true });
        else {
          playbackEngine.stop();
          setCurrentTrack(null);
        }
      }
    },
    [bumpQueue, loadCurrent, persistQueue]
  );

  const reorderQueue = useCallback(
    (from: number, to: number) => {
      queueRef.current.reorder(from, to);
      bumpQueue();
      persistQueue();
    },
    [bumpQueue, persistQueue]
  );

  const clearQueue = useCallback(() => {
    queueRef.current.clearUpcoming();
    bumpQueue();
    persistQueue();
  }, [bumpQueue, persistQueue]);

  const jumpTo = useCallback(
    (trackId: string) => {
      const track = queueRef.current.jumpTo(trackId);
      if (!track) return;
      bumpQueue();
      persistQueue();
      void loadCurrent({ autoPlay: true });
    },
    [bumpQueue, loadCurrent, persistQueue]
  );

  const toggleShuffle = useCallback(() => {
    queueRef.current.toggleShuffle();
    bumpQueue();
    persistQueue();
    preloader.schedule(queueRef.current.peekNext());
  }, [bumpQueue, persistQueue]);

  const cycleRepeat = useCallback(() => {
    queueRef.current.cycleRepeat();
    bumpQueue();
    persistQueue();
  }, [bumpQueue, persistQueue]);

  const queueSnapshot = useMemo(
    () => ({
      items: queueRef.current.items,
      upcoming: queueRef.current.upcoming,
      context: queueRef.current.context,
      shuffle: queueRef.current.shuffle,
      repeat: queueRef.current.repeat,
      hasNext: queueRef.current.hasNext,
      hasPrevious: queueRef.current.hasPrevious,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queueVersion]
  );

  const duration = status.duration || currentTrack?.duration || 0;

  const value = useMemo<PlayerContextType>(
    () => ({
      currentTrack,
      isPlaying: status.isPlaying,
      playTrack,
      togglePlayPause,
      isLoading,
      isBuffering: status.isBuffering,
      error,
      clearError,
      retry,
      duration,
      volume,
      setVolume,
      seekTo,
      seekBy,
      next,
      previous,
      hasNext: queueSnapshot.hasNext,
      hasPrevious: queueSnapshot.hasPrevious,
      queue: queueSnapshot.items,
      upcoming: queueSnapshot.upcoming,
      queueContext: queueSnapshot.context,
      addToQueue,
      playNext: playNextInQueue,
      removeFromQueue,
      reorderQueue,
      clearQueue,
      jumpTo,
      shuffle: queueSnapshot.shuffle,
      toggleShuffle,
      repeat: queueSnapshot.repeat,
      cycleRepeat,
      isReady,
      canPlayCurrent: currentTrack ? MusicService.canPlay(currentTrack) : false,
    }),
    [
      currentTrack,
      status.isPlaying,
      status.isBuffering,
      playTrack,
      togglePlayPause,
      isLoading,
      error,
      clearError,
      retry,
      duration,
      volume,
      setVolume,
      seekTo,
      seekBy,
      next,
      previous,
      queueSnapshot,
      addToQueue,
      playNextInQueue,
      removeFromQueue,
      reorderQueue,
      clearQueue,
      jumpTo,
      toggleShuffle,
      cycleRepeat,
      isReady,
    ]
  );

  const progressValue = useMemo(
    () => ({ position: status.position, duration }),
    [status.position, duration]
  );

  return (
    <PlayerContext.Provider value={value}>
      <ProgressContext.Provider value={progressValue}>{children}</ProgressContext.Provider>
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
};

export const useProgress = () => useContext(ProgressContext);
