/**
 * Fetches update + ads from gmax-premium-api (no APK rebuild to change content).
 */
import { PREMIUM_API_BASE } from './PremiumApi';

export type RemoteUpdate = {
  enabled: boolean;
  version: string;
  versionCode: number;
  buildId: string;
  apkUrl: string;
  force: boolean;
  notes: string;
};

export type RemoteAdItem = {
  id: string;
  enabled?: boolean;
  videoUrl?: string;
  posterUrl?: string;
  title?: string;
  /** Bottom caption under video */
  subtitle?: string;
  description?: string;
  /** Brand / app name in install bar */
  brandName?: string;
  brandIcon?: string;
  storeLabel?: string;
  linkUrl?: string;
  linkLabel?: string;
  ctaLabel?: string;
};

export type RemoteAds = {
  enabled: boolean;
  delaySeconds: number;
  maxAds: number;
  skipAfterRatio: number;
  oncePerDay: boolean;
  items: RemoteAdItem[];
};

export type RemoteConfig = {
  ok: boolean;
  fetchedAt?: number;
  update: RemoteUpdate;
  ads: RemoteAds;
};

const EMPTY_UPDATE: RemoteUpdate = {
  enabled: false,
  version: '1.2.4',
  versionCode: 0,
  buildId: '',
  apkUrl: '',
  force: false,
  notes: '',
};

const EMPTY_ADS: RemoteAds = {
  enabled: false,
  delaySeconds: 10,
  maxAds: 2,
  skipAfterRatio: 0.5,
  oncePerDay: true,
  items: [],
};

function root(): string {
  return (PREMIUM_API_BASE || '').replace(/\/$/, '');
}

let cache: RemoteConfig | null = null;
let cacheAt = 0;
const CACHE_MS = 60_000;

export async function fetchRemoteConfig(force = false): Promise<RemoteConfig> {
  if (!force && cache && Date.now() - cacheAt < CACHE_MS) return cache;

  const base = root();
  if (!base) {
    return { ok: false, update: EMPTY_UPDATE, ads: EMPTY_ADS };
  }

  try {
    const res = await fetch(`${base}/api/remote-config?t=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) {
      return { ok: false, update: EMPTY_UPDATE, ads: EMPTY_ADS };
    }
    const data = (await res.json()) as RemoteConfig;
    const normalized: RemoteConfig = {
      ok: true,
      fetchedAt: data.fetchedAt || Date.now(),
      update: {
        enabled: data.update?.enabled !== false,
        version: data.update?.version || '1.2.4',
        versionCode: Number(data.update?.versionCode) || 0,
        buildId: data.update?.buildId || '',
        apkUrl: data.update?.apkUrl || '',
        force: !!data.update?.force,
        notes: data.update?.notes || '',
      },
      ads: {
        enabled: !!data.ads?.enabled,
        delaySeconds:
          typeof data.ads?.delaySeconds === 'number' ? data.ads.delaySeconds : 10,
        maxAds: Math.min(2, Number(data.ads?.maxAds) || 2),
        skipAfterRatio:
          typeof data.ads?.skipAfterRatio === 'number' ? data.ads.skipAfterRatio : 0.5,
        oncePerDay: data.ads?.oncePerDay !== false,
        items: Array.isArray(data.ads?.items)
          ? data.ads.items.filter((i) => i && i.id).slice(0, 2)
          : [],
      },
    };
    cache = normalized;
    cacheAt = Date.now();
    return normalized;
  } catch {
    return { ok: false, update: EMPTY_UPDATE, ads: EMPTY_ADS };
  }
}

export async function fetchRemoteAds(): Promise<RemoteAds> {
  const cfg = await fetchRemoteConfig();
  return cfg.ads;
}
