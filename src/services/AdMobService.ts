/**
 * AdMob — rewarded progress (5 = 1 day premium), app-open helper.
 * Native module only exists in a real build (not Expo Go).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AD_UNIT_REWARDED,
  AD_UNIT_APP_OPEN,
  REWARDED_ADS_FOR_ONE_DAY,
  REWARD_PREMIUM_DAYS,
} from './AdMobConfig';

const PROGRESS_KEY = 'gmax_rewarded_progress';

type Progress = { count: number; day: string };

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadAdsModule(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-google-mobile-ads');
  } catch {
    return null;
  }
}

export function isAdMobAvailable(): boolean {
  return loadAdsModule() != null;
}

let initialized = false;

export async function initAdMob(): Promise<boolean> {
  const ads = loadAdsModule();
  if (!ads) return false;
  if (initialized) return true;
  try {
    await ads.mobileAds().initialize();
    initialized = true;
    return true;
  } catch {
    return false;
  }
}

export async function getRewardedProgress(): Promise<{ count: number; need: number }> {
  try {
    const raw = await AsyncStorage.getItem(PROGRESS_KEY);
    if (!raw) return { count: 0, need: REWARDED_ADS_FOR_ONE_DAY };
    const p = JSON.parse(raw) as Progress;
    if (p.day !== todayKey()) return { count: 0, need: REWARDED_ADS_FOR_ONE_DAY };
    return {
      count: Math.min(REWARDED_ADS_FOR_ONE_DAY, Number(p.count) || 0),
      need: REWARDED_ADS_FOR_ONE_DAY,
    };
  } catch {
    return { count: 0, need: REWARDED_ADS_FOR_ONE_DAY };
  }
}

async function setProgress(count: number): Promise<void> {
  const p: Progress = { count, day: todayKey() };
  await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
}

export type RewardedResult =
  | { ok: true; earned: boolean; count: number; unlockedDay: boolean; daysGranted?: number }
  | { ok: false; error: string };

/**
 * Show one rewarded ad. On full watch → progress +1.
 * At 5/5 → caller should grant 1 day premium and reset progress.
 */
export async function showRewardedAd(): Promise<RewardedResult> {
  const ads = loadAdsModule();
  if (!ads) {
    return { ok: false, error: 'AdMob sirf real APK build me chalta hai (Expo Go me nahi)' };
  }
  await initAdMob();

  try {
    const { RewardedAd, RewardedAdEventType, AdEventType } = ads;
    const rewarded = RewardedAd.createForAdRequest(AD_UNIT_REWARDED, {
      requestNonPersonalizedAdsOnly: true,
    });

    const result = await new Promise<RewardedResult>((resolve) => {
      let earned = false;
      let settled = false;

      const finish = (r: RewardedResult) => {
        if (settled) return;
        settled = true;
        resolve(r);
      };

      const unsubLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
        rewarded.show().catch((e: Error) => {
          finish({ ok: false, error: e.message || 'Show failed' });
        });
      });

      const unsubEarned = rewarded.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        () => {
          earned = true;
        }
      );

      const unsubClosed = rewarded.addAdEventListener(AdEventType.CLOSED, () => {
        void (async () => {
          unsubLoaded();
          unsubEarned();
          unsubClosed();
          unsubError();
          if (!earned) {
            const prog = await getRewardedProgress();
            finish({ ok: true, earned: false, count: prog.count, unlockedDay: false });
            return;
          }
          const prog = await getRewardedProgress();
          let next = prog.count + 1;
          let unlockedDay = false;
          let daysGranted = 0;
          if (next >= REWARDED_ADS_FOR_ONE_DAY) {
            unlockedDay = true;
            daysGranted = REWARD_PREMIUM_DAYS;
            next = 0;
          }
          await setProgress(next);
          finish({
            ok: true,
            earned: true,
            count: next,
            unlockedDay,
            daysGranted: unlockedDay ? daysGranted : undefined,
          });
        })();
      });

      const unsubError = rewarded.addAdEventListener(AdEventType.ERROR, (err: any) => {
        unsubLoaded();
        unsubEarned();
        unsubClosed();
        unsubError();
        finish({
          ok: false,
          error: err?.message || 'Ad load error — network / fill check karo',
        });
      });

      rewarded.load();
    });

    return result;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Rewarded ad failed',
    };
  }
}

let appOpenAd: any = null;
let appOpenLoading = false;

export async function loadAppOpenAd(): Promise<boolean> {
  const ads = loadAdsModule();
  if (!ads) return false;
  await initAdMob();
  if (appOpenLoading) return false;
  appOpenLoading = true;
  try {
    const { AppOpenAd, AdEventType } = ads;
    const ad = AppOpenAd.createForAdRequest(AD_UNIT_APP_OPEN, {
      requestNonPersonalizedAdsOnly: true,
    });
    await new Promise<void>((resolve, reject) => {
      const unsubL = ad.addAdEventListener(AdEventType.LOADED, () => {
        unsubL();
        unsubE();
        appOpenAd = ad;
        resolve();
      });
      const unsubE = ad.addAdEventListener(AdEventType.ERROR, (err: any) => {
        unsubL();
        unsubE();
        reject(err);
      });
      ad.load();
    });
    return true;
  } catch {
    appOpenAd = null;
    return false;
  } finally {
    appOpenLoading = false;
  }
}

export async function showAppOpenAdIfReady(): Promise<boolean> {
  if (!appOpenAd) {
    await loadAppOpenAd();
  }
  if (!appOpenAd) return false;
  try {
    await appOpenAd.show();
    appOpenAd = null;
    // preload next
    void loadAppOpenAd();
    return true;
  } catch {
    appOpenAd = null;
    return false;
  }
}

export { REWARDED_ADS_FOR_ONE_DAY, REWARD_PREMIUM_DAYS };
