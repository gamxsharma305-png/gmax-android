import { Platform } from 'react-native';
import {
  AudioPlayer,
  createAudioPlayer,
  setAudioModeAsync,
  setIsAudioActiveAsync,
} from 'expo-audio';
import { appError, toAppError } from '../core/errors';
import { ResolvedStream, Track } from '../core/types';

export type PlaybackStatus = {
  isPlaying: boolean;
  isBuffering: boolean;
  isLoaded: boolean;
  position: number;
  duration: number;
  volume: number;
};

export const IDLE_STATUS: PlaybackStatus = {
  isPlaying: false,
  isBuffering: false,
  isLoaded: false,
  position: 0,
  duration: 0,
  volume: 1,
};

type EngineEvents = {
  onStatus: (status: PlaybackStatus) => void;
  onComplete: () => void;
  onError: (error: unknown) => void;
};

export class PlaybackEngine {
  private player: AudioPlayer | null = null;
  private subscription: { remove: () => void } | null = null;
  private listeners: Partial<EngineEvents> = {};

  private status: PlaybackStatus = { ...IDLE_STATUS };
  private currentTrackId: string | null = null;
  private desiredVolume = 1;

  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private loadToken = 0;
  private completionFired = false;

  private configured = false;
  private lockScreenActive = false;
  private lockScreenTrack: Track | null = null;
  private lockScreenSynced = false;

  on<K extends keyof EngineEvents>(event: K, handler: EngineEvents[K]): void {
    this.listeners[event] = handler;
  }

  getStatus(): PlaybackStatus {
    return this.status;
  }

  async configure(): Promise<void> {
    if (this.configured) return;
    this.configured = true;

    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      });
      await setIsAudioActiveAsync(true);
    } catch {
      // best effort
    }
  }

  private ensurePlayer(): AudioPlayer {
    if (this.player) return this.player;

    const player = createAudioPlayer(null, { updateInterval: 250 });
    player.volume = this.desiredVolume;

    this.subscription = player.addListener('playbackStatusUpdate', (s) => {
      this.handleStatus(s);
    });

    this.player = player;
    return player;
  }

  private handleStatus(s: any): void {
    const duration = Number.isFinite(s?.duration) && s.duration > 0 ? s.duration : 0;
    const position = Number.isFinite(s?.currentTime) ? Math.max(0, s.currentTime) : 0;

    if (s?.isLoaded && this.loadTimer) {
      clearTimeout(this.loadTimer);
      this.loadTimer = null;
    }

    if (s?.error) {
      this.clearLoadTimer();
      this.listeners.onError?.(appError('playback_failed', String(s.error)));
      return;
    }

    this.status = {
      isPlaying: Boolean(s?.playing),
      isBuffering: Boolean(s?.isBuffering),
      isLoaded: Boolean(s?.isLoaded),
      position,
      duration,
      volume: Number.isFinite(s?.volume) ? s.volume : this.desiredVolume,
    };

    this.listeners.onStatus?.(this.status);

    if (s?.isLoaded && s?.playing) this.syncLockScreenOnce();

    if (s?.didJustFinish && !this.completionFired) {
      this.completionFired = true;
      this.listeners.onComplete?.();
    }
  }

  private clearLoadTimer(): void {
    if (this.loadTimer) {
      clearTimeout(this.loadTimer);
      this.loadTimer = null;
    }
  }

  async load(
    track: Track,
    stream: ResolvedStream,
    options: { autoPlay?: boolean; startPosition?: number } = {}
  ): Promise<void> {
    const { autoPlay = true, startPosition = 0 } = options;
    const token = ++this.loadToken;

    try {
      const player = this.ensurePlayer();
      await this.configure();

      this.currentTrackId = track.id;
      this.completionFired = false;

      this.status = { ...IDLE_STATUS, isBuffering: true, volume: this.desiredVolume };
      this.listeners.onStatus?.(this.status);

      player.replace({ uri: stream.url, headers: stream.headers });
      player.volume = this.desiredVolume;

      this.clearLoadTimer();
      this.loadTimer = setTimeout(() => {
        if (token !== this.loadToken) return;
        if (this.status.isLoaded) return;
        this.listeners.onError?.(appError('playback_failed', 'Stream did not start'));
      }, 20_000);

      if (startPosition > 0) {
        try {
          await player.seekTo(startPosition);
        } catch {
          // non-fatal
        }
      }

      if (autoPlay) player.play();

      this.setLockScreenMetadata(track);
    } catch (e) {
      this.clearLoadTimer();
      throw toAppError(e, 'playback_failed');
    }
  }

  play(): void {
    try {
      this.player?.play();
    } catch (e) {
      this.listeners.onError?.(toAppError(e, 'playback_failed'));
    }
  }

  pause(): void {
    try {
      this.player?.pause();
    } catch {
      /* ok */
    }
  }

  async seekTo(seconds: number): Promise<void> {
    if (!this.player) return;
    if (!Number.isFinite(seconds)) return;

    const duration = this.status.duration;
    const target = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds);

    try {
      this.completionFired = false;
      await this.player.seekTo(target);
      this.status = { ...this.status, position: target };
      this.listeners.onStatus?.(this.status);
    } catch (e) {
      this.listeners.onError?.(toAppError(e, 'playback_failed'));
    }
  }

  setVolume(volume: number): void {
    this.desiredVolume = Math.max(0, Math.min(1, volume));
    if (this.player) this.player.volume = this.desiredVolume;
    this.status = { ...this.status, volume: this.desiredVolume };
    this.listeners.onStatus?.(this.status);
  }

  getVolume(): number {
    return this.desiredVolume;
  }

  stop(): void {
    this.clearLoadTimer();
    this.loadToken++;
    this.currentTrackId = null;
    this.completionFired = false;

    try {
      this.player?.pause();
      this.player?.replace(null);
    } catch {
      /* ok */
    }

    this.clearLockScreen();

    this.status = { ...IDLE_STATUS, volume: this.desiredVolume };
    this.listeners.onStatus?.(this.status);
  }

  private setLockScreenMetadata(track: Track): void {
    if (Platform.OS === 'web') return;

    this.lockScreenTrack = track;
    this.lockScreenSynced = false;

    const metadata = this.metadataFor(track);

    try {
      if (this.lockScreenActive) {
        this.player?.updateLockScreenMetadata(metadata);
        return;
      }

      this.player?.setActiveForLockScreen(true, metadata, {
        showSeekForward: true,
        showSeekBackward: true,
      });
      this.lockScreenActive = true;
    } catch {
      // optional
    }
  }

  private metadataFor(track: Track) {
    return {
      title: track.title,
      artist: track.artist.name,
      albumTitle: track.album,
      artworkUrl: track.albumImageUrl || undefined,
    };
  }

  private syncLockScreenOnce(): void {
    if (Platform.OS === 'web') return;
    if (this.lockScreenSynced || !this.lockScreenActive) return;

    const track = this.lockScreenTrack;
    if (!track) return;

    this.lockScreenSynced = true;
    try {
      this.player?.updateLockScreenMetadata(this.metadataFor(track));
    } catch {
      /* best effort */
    }
  }

  private clearLockScreen(): void {
    if (Platform.OS === 'web' || !this.lockScreenActive) return;

    try {
      this.player?.clearLockScreenControls();
    } catch {
      /* best effort */
    }
    this.lockScreenActive = false;
    this.lockScreenTrack = null;
    this.lockScreenSynced = false;
  }

  get trackId(): string | null {
    return this.currentTrackId;
  }

  async release(): Promise<void> {
    this.clearLoadTimer();
    this.clearLockScreen();

    this.configured = false;
    this.subscription?.remove();
    this.subscription = null;

    try {
      this.player?.remove();
    } catch {
      /* best effort */
    }
    this.player = null;

    try {
      await setIsAudioActiveAsync(false);
    } catch {
      /* best effort */
    }
  }
}

export const playbackEngine = new PlaybackEngine();
