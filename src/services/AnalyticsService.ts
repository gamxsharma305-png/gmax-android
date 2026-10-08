/**
 * Anonymous usage analytics → gmax-premium-api
 * Events: open (install counted server-side), page, song_play
 */
import Constants from 'expo-constants';
import { PREMIUM_API_BASE } from './PremiumApi';
import { SubscriptionService } from './SubscriptionService';

type AnalyticsEvent = {
  type: 'install' | 'open' | 'page' | 'song_play';
  deviceId: string;
  page?: string;
  version?: string;
  trackId?: string;
};

const QUEUE_KEY_FLUSH_MS = 4000;
let queue: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function root(): string {
  return (PREMIUM_API_BASE || '').replace(/\/$/, '');
}

function appVersion(): string {
  return (
    Constants.expoConfig?.version ||
    Constants.nativeAppVersion ||
    '0'
  );
}

function enqueue(ev: Omit<AnalyticsEvent, 'deviceId' | 'version'>) {
  try {
    const deviceId = SubscriptionService.getDeviceId();
    if (!deviceId) return;
    queue.push({
      ...ev,
      deviceId,
      version: appVersion(),
    });
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        void flush();
      }, QUEUE_KEY_FLUSH_MS);
    }
  } catch {
    /* ignore */
  }
}

async function flush(): Promise<void> {
  if (!queue.length) return;
  const batch = queue.splice(0, 40);
  const base = root();
  if (!base) return;
  try {
    await fetch(`${base}/api/analytics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
    });
  } catch {
    // analytics must not block app
  }
}

/** Call once after SubscriptionService is available */
export async function trackAppOpen(): Promise<void> {
  try {
    await SubscriptionService.load();
  } catch {
    /* ok */
  }
  // Server marks first-seen deviceId as install automatically
  enqueue({ type: 'open' });
  void flush();
}

export function trackPage(page: string): void {
  if (!page) return;
  enqueue({ type: 'page', page: String(page).slice(0, 48) });
}

export function trackSongPlay(trackId?: string): void {
  enqueue({
    type: 'song_play',
    trackId: trackId ? String(trackId).slice(0, 64) : undefined,
  });
}

export function trackFlushNow(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  void flush();
}
