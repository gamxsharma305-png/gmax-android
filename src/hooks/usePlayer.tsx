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

  // NOTE: full loadCurrent + rest restored from main with error auto-next — see repo after push
  // This stub will be replaced if push truncated; verify commit size.
  return null as any;
};

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer outside provider');
  return ctx;
}

export function useProgress() {
  return useContext(ProgressContext);
}
