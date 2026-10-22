import { useCallback, useEffect, useState } from 'react';
import {
  PLANS,
  PREMIUM_FEATURES,
  SubscriptionService,
  SubscriptionState,
} from '../services/SubscriptionService';
import {
  getRewardedProgress,
  showRewardedAd,
  REWARDED_ADS_FOR_ONE_DAY,
} from '../services/AdMobService';

export function useSubscription() {
  const [state, setState] = useState<SubscriptionState>(SubscriptionService.getState());
  const [ready, setReady] = useState(false);
  const [rewardedCount, setRewardedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await SubscriptionService.load();
      if (cancelled) return;
      setState(SubscriptionService.getState());
      setReady(true);
      const p = await getRewardedProgress();
      if (!cancelled) setRewardedCount(p.count);
    })();
    return SubscriptionService.subscribe(() => {
      setState(SubscriptionService.getState());
    });
  }, []);

  const claimWithPaymentId = useCallback(async (paymentId: string) => {
    const result = await SubscriptionService.claimWithPaymentId(paymentId);
    setState(SubscriptionService.getState());
    return result;
  }, []);

  const refresh = useCallback(async () => {
    await SubscriptionService.refreshFromServer();
    await SubscriptionService.refreshReferral();
    setState(SubscriptionService.getState());
    const p = await getRewardedProgress();
    setRewardedCount(p.count);
  }, []);

  const clear = useCallback(async () => {
    await SubscriptionService.clear();
    setState(SubscriptionService.getState());
  }, []);

  const redeemPromoCode = useCallback(async (code: string) => {
    const result = await SubscriptionService.redeemPromoCode(code);
    setState(SubscriptionService.getState());
    return result;
  }, []);

  const requestAroKey = useCallback(async () => {
    return SubscriptionService.requestAroKey();
  }, []);

  const claimFriendCode = useCallback(async (code: string) => {
    const result = await SubscriptionService.claimFriendCode(code);
    setState(SubscriptionService.getState());
    return result;
  }, []);

  const useFreeGeneration = useCallback(async () => {
    const result = await SubscriptionService.useFreeGeneration();
    setState(SubscriptionService.getState());
    return result;
  }, []);

  /** Watch 1 rewarded ad. At 5 complete → +1 day premium. */
  const watchRewardedForPremium = useCallback(async () => {
    const result = await showRewardedAd();
    if (!result.ok) return result;
    setRewardedCount(result.count);
    if (result.unlockedDay && result.daysGranted) {
      await SubscriptionService.grantDaysFromAds(result.daysGranted);
      setState(SubscriptionService.getState());
    }
    return result;
  }, []);

  return {
    ready,
    isPremium: state.active && state.expiresAt > Date.now(),
    state,
    plans: PLANS,
    features: PREMIUM_FEATURES,
    daysLeft: SubscriptionService.daysLeft(),
    promoLeft: SubscriptionService.promoRedemptionsLeft(),
    deviceId: SubscriptionService.getDeviceId(),
    referralCode: state.referralCode || '',
    freeGens: Number(state.freeGens) || 0,
    referralCount: Number(state.referralCount) || 0,
    shareUrl: state.shareUrl || '',
    rewardedCount,
    rewardedNeed: REWARDED_ADS_FOR_ONE_DAY,
    canDownload: () => SubscriptionService.canDownload(),
    canUseAutoPlaylist: () => SubscriptionService.canUseAutoPlaylist(),
    canCreatePlaylist: (count: number) => SubscriptionService.canCreatePlaylist(count),
    claimWithPaymentId,
    redeemPromoCode,
    requestAroKey,
    claimFriendCode,
    useFreeGeneration,
    watchRewardedForPremium,
    refresh,
    clear,
  };
}
