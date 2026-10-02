import { useCallback, useEffect, useState } from 'react';
import {
  PlanId,
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

  const activate = useCallback(async (planId: PlanId, paymentId?: string) => {
    const next = await SubscriptionService.activate(planId, paymentId);
    setState(next);
    return next;
  }, []);

  const clear = useCallback(async () => {
    await SubscriptionService.clear();
    setState(SubscriptionService.getState());
  }, []);

  return {
    ready,
    isPremium: state.active && state.expiresAt > Date.now(),
    state,
    plans: PLANS,
    features: PREMIUM_FEATURES,
    daysLeft: SubscriptionService.daysLeft(),
    canDownload: () => SubscriptionService.canDownload(),
    canUseAutoPlaylist: () => SubscriptionService.canUseAutoPlaylist(),
    canCreatePlaylist: (count: number) => SubscriptionService.canCreatePlaylist(count),
    activate,
    clear,
  };
}
