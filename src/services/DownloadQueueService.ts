/**
 * Background download queue — continues even if user leaves Now Playing / Home.
 */
import { Track } from '../core/types';
import { LibraryService } from './LibraryService';

type Job = {
  track: Track;
  status: 'queued' | 'downloading' | 'done' | 'error';
  error?: string;
};

type Listener = (jobs: Job[]) => void;

class DownloadQueueServiceImpl {
  private jobs: Job[] = [];
  private running = false;
  private listeners = new Set<Listener>();

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    cb(this.snapshot());
    return () => this.listeners.delete(cb);
  }

  private snapshot(): Job[] {
    return this.jobs.map((j) => ({ ...j }));
  }

  private notify(): void {
    const s = this.snapshot();
    for (const l of this.listeners) {
      try {
        l(s);
      } catch {
        /* ok */
      }
    }
  }

  isQueuedOrDownloading(trackId: string): boolean {
    return this.jobs.some(
      (j) => j.track.id === trackId && (j.status === 'queued' || j.status === 'downloading')
    );
  }

  getStatus(trackId: string): Job['status'] | null {
    const j = this.jobs.find((x) => x.track.id === trackId);
    return j?.status ?? null;
  }

  /** Enqueue — returns immediately; download runs in background. */
  enqueue(track: Track): { ok: boolean; already?: boolean; message: string } {
    if (LibraryService.isOffline(track.id)) {
      return { ok: true, already: true, message: 'Already offline' };
    }
    if (this.isQueuedOrDownloading(track.id)) {
      return { ok: true, already: true, message: 'Download already in progress' };
    }
    this.jobs.push({ track, status: 'queued' });
    this.notify();
    void this.pump();
    return { ok: true, message: 'Download started' };
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (true) {
        const next = this.jobs.find((j) => j.status === 'queued');
        if (!next) break;
        next.status = 'downloading';
        this.notify();
        try {
          await LibraryService.downloadAndRegister(next.track);
          next.status = 'done';
          this.notify();
          // prune done after short delay so UI can show check
          setTimeout(() => {
            this.jobs = this.jobs.filter((j) => j !== next || j.status !== 'done');
            this.notify();
          }, 4000);
        } catch (e) {
          next.status = 'error';
          next.error = e instanceof Error ? e.message : 'Download failed';
          this.notify();
        }
      }
    } finally {
      this.running = false;
    }
  }
}

export const DownloadQueue = new DownloadQueueServiceImpl();
