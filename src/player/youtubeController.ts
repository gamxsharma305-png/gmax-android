/**
 * Singleton controller for the hidden YouTube IFrame player (WebView).
 * Used when a track has a YouTube videoId / sourceId so songs play from YouTube itself.
 */

export type YtStatus = {
  videoId: string | null;
  isPlaying: boolean;
  isBuffering: boolean;
  isLoaded: boolean;
  position: number;
  duration: number;
  error: string | null;
};

type Handlers = {
  onStatus?: (s: YtStatus) => void;
  onEnded?: () => void;
  onError?: (message: string) => void;
};

type Command =
  | { type: 'load'; videoId: string; autoPlay: boolean; startAt?: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; seconds: number }
  | { type: 'stop' };

const IDLE: YtStatus = {
  videoId: null,
  isPlaying: false,
  isBuffering: false,
  isLoaded: false,
  position: 0,
  duration: 0,
  error: null,
};

class YouTubeControllerImpl {
  private handlers: Handlers = {};
  private status: YtStatus = { ...IDLE };
  private sendToWeb: ((cmd: Command) => void) | null = null;
  private ready = false;
  private pending: Command | null = null;

  attachSender(fn: (cmd: Command) => void): void {
    this.sendToWeb = fn;
    this.ready = true;
    if (this.pending) {
      fn(this.pending);
      this.pending = null;
    }
  }

  detachSender(): void {
    this.sendToWeb = null;
    this.ready = false;
  }

  on(handlers: Handlers): void {
    this.handlers = handlers;
  }

  getStatus(): YtStatus {
    return this.status;
  }

  private emit(): void {
    this.handlers.onStatus?.(this.status);
  }

  private dispatch(cmd: Command): void {
    if (this.sendToWeb && this.ready) {
      this.sendToWeb(cmd);
    } else {
      this.pending = cmd;
    }
  }

  /** Called from WebView bridge messages */
  handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw);
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'ready') {
        this.ready = true;
        if (this.pending && this.sendToWeb) {
          this.sendToWeb(this.pending);
          this.pending = null;
        }
        return;
      }

      if (msg.type === 'status') {
        this.status = {
          videoId: msg.videoId ?? this.status.videoId,
          isPlaying: Boolean(msg.isPlaying),
          isBuffering: Boolean(msg.isBuffering),
          isLoaded: Boolean(msg.isLoaded),
          position: Number(msg.position) || 0,
          duration: Number(msg.duration) || 0,
          error: null,
        };
        this.emit();
        return;
      }

      if (msg.type === 'ended') {
        this.status = { ...this.status, isPlaying: false, isBuffering: false };
        this.emit();
        this.handlers.onEnded?.();
        return;
      }

      if (msg.type === 'error') {
        const message = String(msg.message || 'YouTube playback failed');
        this.status = { ...this.status, isPlaying: false, isBuffering: false, error: message };
        this.emit();
        this.handlers.onError?.(message);
      }
    } catch {
      /* ignore bad messages */
    }
  }

  load(videoId: string, options: { autoPlay?: boolean; startAt?: number } = {}): void {
    const { autoPlay = true, startAt = 0 } = options;
    this.status = {
      videoId,
      isPlaying: false,
      isBuffering: true,
      isLoaded: false,
      position: startAt,
      duration: 0,
      error: null,
    };
    this.emit();
    this.dispatch({ type: 'load', videoId, autoPlay, startAt });
  }

  play(): void {
    this.dispatch({ type: 'play' });
  }

  pause(): void {
    this.dispatch({ type: 'pause' });
  }

  seek(seconds: number): void {
    this.dispatch({ type: 'seek', seconds });
  }

  stop(): void {
    this.dispatch({ type: 'stop' });
    this.status = { ...IDLE };
    this.emit();
  }

  get active(): boolean {
    return Boolean(this.status.videoId);
  }
}

export const youtubeController = new YouTubeControllerImpl();
