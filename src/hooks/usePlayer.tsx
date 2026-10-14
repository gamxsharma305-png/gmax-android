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

// TEMP: full file will be restored - if you see this, pull failed partially
export const PlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

export function usePlayer(): any {
  throw new Error('usePlayer: file needs restore from commit 30be5bb');
}

export function useProgress() {
  return { position: 0, duration: 0 };
}
