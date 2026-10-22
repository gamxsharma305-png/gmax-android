import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  initAdMob,
  isAdMobAvailable,
  loadAppOpenAd,
  showAppOpenAdIfReady,
} from '../../services/AdMobService';
import { useSubscription } from '../../hooks/useSubscription';

/**
 * Cold start + resume pe app-open ad (premium pe skip).
 * Splash ke baad ~1s delay.
 */
export function AppOpenAdController({ enabled }: { enabled: boolean }) {
  const { isPremium } = useSubscription();
  const shownCold = useRef(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (!enabled || isPremium || !isAdMobAvailable()) return;

    let cancelled = false;
    void (async () => {
      await initAdMob();
      if (cancelled) return;
      await loadAppOpenAd();
      if (cancelled || shownCold.current) return;
      // splash ke baad
      setTimeout(() => {
        if (cancelled || shownCold.current || isPremium) return;
        shownCold.current = true;
        void showAppOpenAdIfReady();
      }, 4500);
    })();

    const onChange = (next: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        next === 'active' &&
        !isPremium
      ) {
        void showAppOpenAdIfReady();
      }
      appState.current = next;
    };
    const sub = AppState.addEventListener('change', onChange);

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [enabled, isPremium]);

  return null;
}
