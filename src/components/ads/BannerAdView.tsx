import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { AD_UNIT_BANNER } from '../../services/AdMobConfig';
import { initAdMob, isAdMobAvailable } from '../../services/AdMobService';
import { useSubscription } from '../../hooks/useSubscription';

/**
 * Bottom banner — premium users pe hide.
 */
export function BannerAdView() {
  const { isPremium } = useSubscription();
  const [ready, setReady] = useState(false);
  const [BannerAd, setBannerAd] = useState<any>(null);
  const [BannerAdSize, setBannerAdSize] = useState<any>(null);

  useEffect(() => {
    if (isPremium || !isAdMobAvailable()) return;
    let cancelled = false;
    void (async () => {
      const ok = await initAdMob();
      if (!ok || cancelled) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const ads = require('react-native-google-mobile-ads');
        if (cancelled) return;
        setBannerAd(() => ads.BannerAd);
        setBannerAdSize(ads.BannerAdSize);
        setReady(true);
      } catch {
        /* native missing */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPremium]);

  if (isPremium || !ready || !BannerAd || !BannerAdSize) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <BannerAd
        unitId={AD_UNIT_BANNER}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdFailedToLoad={() => {
          /* silent */
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    minHeight: Platform.OS === 'android' ? 50 : 50,
  },
});
