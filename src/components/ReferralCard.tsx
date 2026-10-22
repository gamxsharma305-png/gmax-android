import React, { useCallback, useState } from 'react';
import {
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { useSubscription } from '../hooks/useSubscription';

/**
 * Referral card — share your code, enter friend's code, redeem free gen (7d premium).
 */
export default function ReferralCard() {
  const {
    referralCode,
    freeGens,
    referralCount,
    shareUrl,
    claimFriendCode,
    useFreeGeneration,
    refresh,
  } = useSubscription();

  const [friendCode, setFriendCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shareCode = useCallback(async () => {
    const url = shareUrl || 'https://gmaxmusify.edgeone.dev/';
    const code = referralCode || '';
    const message = code
      ? `GMAX Music try karo! Mera referral code: ${code}\n${url}`
      : `GMAX — free music\n${url}`;
    try {
      await Share.share({ message, url, title: 'GMAX Music' });
    } catch {
      /* cancelled */
    }
  }, [shareUrl, referralCode]);

  const onClaim = useCallback(async () => {
    const code = friendCode.trim();
    if (!code) {
      setMsg('Friend ka code daalo');
      return;
    }
    setBusy(true);
    setMsg(null);
    const r = await claimFriendCode(code);
    setBusy(false);
    if (r.ok) {
      setFriendCode('');
      setMsg('Done! Referral lag gaya.');
      void refresh();
    } else {
      setMsg(r.error || 'Failed');
    }
  }, [friendCode, claimFriendCode, refresh]);

  const onUse = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    const r = await useFreeGeneration();
    setBusy(false);
    if (r.ok) {
      setMsg(`Unlocked! ${r.days || 7} din premium mil gaya.`);
      void refresh();
    } else {
      setMsg(r.error || 'Koi free generation nahi');
    }
  }, [useFreeGeneration, refresh]);

  return (
    <View style={styles.card}>
      <Text style={styles.hint}>
        Dost ko apna code do. Jab woh app me code lagaye, tumhe 1 free generation milti hai
        (7 din Premium).
      </Text>

      <Text style={styles.label}>YOUR CODE</Text>
      <Text style={styles.code}>{referralCode || 'Loading…'}</Text>
      <Text style={styles.hint}>
        Free left: {freeGens} · Successful refs: {referralCount}
      </Text>

      <View style={styles.row}>
        <TouchableOpacity style={styles.btnPrimary} onPress={() => void shareCode()} activeOpacity={0.85}>
          <Text style={styles.btnPrimaryText}>Share code</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnSecondary, (freeGens < 1 || busy) && styles.disabled]}
          disabled={freeGens < 1 || busy}
          onPress={() => void onUse()}
          activeOpacity={0.85}
        >
          <Text style={styles.btnSecondaryText}>Use free ({freeGens})</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.label, { marginTop: 16 }]}>FRIEND CODE</Text>
      <TextInput
        style={styles.input}
        value={friendCode}
        onChangeText={setFriendCode}
        placeholder="GMAX-XXXXXX"
        placeholderTextColor={COLORS.text.muted}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <TouchableOpacity
        style={[styles.btnGhost, busy && styles.disabled]}
        disabled={busy}
        onPress={() => void onClaim()}
        activeOpacity={0.85}
      >
        <Text style={styles.btnGhostText}>Apply friend code</Text>
      </TouchableOpacity>

      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SIZES.md,
    padding: SIZES.md,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  label: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    letterSpacing: 1.5,
    color: COLORS.text.muted,
    marginTop: 12,
    marginBottom: 6,
  },
  code: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: COLORS.accent.green,
    letterSpacing: 1,
  },
  hint: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
    lineHeight: 18,
    marginTop: 4,
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btnPrimary: {
    flex: 1,
    backgroundColor: COLORS.accent.green,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnPrimaryText: { fontFamily: FONTS.bold, color: '#000' },
  btnSecondary: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  btnSecondaryText: { fontFamily: FONTS.medium, color: COLORS.text.primary },
  btnGhost: {
    marginTop: 12,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
  },
  btnGhostText: { fontFamily: FONTS.bold, color: COLORS.text.primary },
  input: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.surfaceLight,
    color: COLORS.text.primary,
    fontFamily: FONTS.medium,
    fontSize: 15,
  },
  msg: {
    marginTop: 10,
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.accent.green,
  },
  disabled: { opacity: 0.45 },
});
