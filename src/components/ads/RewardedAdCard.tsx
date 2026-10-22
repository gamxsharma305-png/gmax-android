import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS, SIZES } from '../../constants/theme';
import { useSubscription } from '../../hooks/useSubscription';
import { isAdMobAvailable } from '../../services/AdMobService';

/** Paywall / Settings — 5 rewarded ads = 1 day premium */
export function RewardedAdCard() {
  const { isPremium, rewardedCount, rewardedNeed, watchRewardedForPremium } = useSubscription();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (isPremium) return null;

  const onWatch = async () => {
    if (!isAdMobAvailable()) {
      setMsg('AdMob real APK build me chalta hai (EAS build). Expo Go me nahi.');
      return;
    }
    setBusy(true);
    setMsg(null);
    const r = await watchRewardedForPremium();
    setBusy(false);
    if (!r.ok) {
      setMsg(('error' in r && r.error) || 'Ad fail');
      return;
    }
    if (!r.earned) {
      setMsg('Ad poora dekhna hoga reward ke liye');
      return;
    }
    if (r.unlockedDay) {
      setMsg(`+${r.daysGranted || 1} din Premium unlock!`);
    } else {
      setMsg(`Progress: ${r.count}/${rewardedNeed} — aur ${rewardedNeed - r.count} ads`);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Watch ads → free Premium</Text>
      <Text style={styles.hint}>
        {rewardedNeed} rewarded ads complete = 1 din Premium. Abhi: {rewardedCount}/{rewardedNeed}
      </Text>
      <View style={styles.barBg}>
        <View
          style={[
            styles.barFill,
            { width: `${Math.min(100, (rewardedCount / rewardedNeed) * 100)}%` },
          ]}
        />
      </View>
      <TouchableOpacity
        style={[styles.btn, busy && { opacity: 0.6 }]}
        disabled={busy}
        onPress={() => void onWatch()}
        activeOpacity={0.85}
      >
        {busy ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.btnText}>Watch rewarded ad</Text>
        )}
      </TouchableOpacity>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: SIZES.md,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.4)',
    gap: 10,
  },
  title: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.text.primary },
  hint: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
    lineHeight: 17,
  },
  barBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.surfaceLight,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
  },
  btn: {
    backgroundColor: '#3b82f6',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnText: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
  msg: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.accent.green },
});
