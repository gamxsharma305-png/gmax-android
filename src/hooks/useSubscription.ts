import { useCallback, useEffect, useState } from 'react';
import {
  PLANS,
  PREMIUM_FEATURES,
  SubscriptionService,
  SubscriptionState,
} from '../services/SubscriptionService';

export function useSubscription() {
  const [state, setState] = useState<SubscriptionState>(SubscriptionService.getState());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await SubscriptionService.load();
      if (cancelled) return;
      setState(SubscriptionService.getState());
      setReady(true);
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
    setState(SubscriptionService.getState());
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

  return {
    ready,
    isPremium: state.active && state.expiresAt > Date.now(),
    state,
    plans: PLANS,
    features: PREMIUM_FEATURES,
    daysLeft: SubscriptionService.daysLeft(),
    promoLeft: SubscriptionService.promoRedemptionsLeft(),
    deviceId: SubscriptionService.getDeviceId(),
    canDownload: () => SubscriptionService.canDownload(),
    canUseAutoPlaylist: () => SubscriptionService.canUseAutoPlaylist(),
    canCreatePlaylist: (count: number) => SubscriptionService.canCreatePlaylist(count),
    claimWithPaymentId,
    redeemPromoCode,
    refresh,
    clear,
  };
}
