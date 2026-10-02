import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { ChevronLeft, Check, Crown, Lock } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS, FONTS, SIZES } from '../constants/theme';
import { useSubscription } from '../hooks/useSubscription';
import { Plan, PlanId } from '../services/SubscriptionService';
import { PREMIUM_API_BASE } from '../services/PremiumApi';

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { isPremium, plans, features, daysLeft, state, claimWithPaymentId } = useSubscription();

  const [selected, setSelected] = useState<PlanId>('monthly');
  const [webUrl, setWebUrl] = useState<string | null>(null);
  const [paymentIdInput, setPaymentIdInput] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const pendingPlan = useRef<PlanId | null>(null);

  const selectedPlan = plans.find((p) => p.id === selected) ?? plans[0];

  const openPayment = useCallback((plan: Plan) => {
    pendingPlan.current = plan.id;
    setMsg(null);
    setErr(null);
    setWebUrl(plan.paymentLink);
  }, []);

  const openInBrowser = useCallback(async () => {
    if (!selectedPlan?.paymentLink) return;
    pendingPlan.current = selectedPlan.id;
    try {
      await Linking.openURL(selectedPlan.paymentLink);
    } catch {
      setErr('Could not open payment page');
    }
  }, [selectedPlan]);

  const onClaim = useCallback(async () => {
    const id = paymentIdInput.trim();
    if (!id) {
      setErr('Razorpay Payment ID (pay_…) daalo');
      return;
    }
    setClaiming(true);
    setErr(null);
    setMsg('Verifying with Razorpay…');
    const result = await claimWithPaymentId(id);
    setClaiming(false);
    if (!result.ok) {
      setMsg(null);
      setErr(result.error || 'Verify failed');
      return;
    }
    setMsg('Premium unlocked!');
    setWebUrl(null);
    setTimeout(() => navigation.goBack(), 900);
  }, [paymentIdInput, claimWithPaymentId, navigation]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + SIZES.sm }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <ChevronLeft color={COLORS.text.primary} size={26} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>GMAX Premium</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.hero}>
          <Crown color={COLORS.accent.green} size={36} />
          <Text style={styles.heroTitle}>
            {isPremium ? 'You are Premium' : 'Unlock Premium'}
          </Text>
          <Text style={styles.heroSub}>
            {isPremium
              ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left · ${state.planId ?? ''}`
              : 'Pay → enter Payment ID → server verifies → unlock'}
          </Text>
        </View>

        <View style={styles.featureCard}>
          {features.map((f) => (
            <View key={f} style={styles.featureRow}>
              {isPremium ? (
                <Check color={COLORS.accent.green} size={18} />
              ) : (
                <Lock color={COLORS.text.muted} size={16} />
              )}
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>

        {!isPremium && (
          <>
            <Text style={styles.sectionLabel}>1. CHOOSE PLAN & PAY</Text>
            {plans.map((p) => {
              const active = selected === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.planCard, active && styles.planCardActive]}
                  onPress={() => setSelected(p.id)}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planTitle}>{p.title}</Text>
                    <Text style={styles.planMeta}>{p.days} days</Text>
                  </View>
                  <Text style={styles.planPrice}>₹{p.priceInr}</Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={styles.payBtn}
              onPress={() => selectedPlan && openPayment(selectedPlan)}
              activeOpacity={0.85}
            >
              <Text style={styles.payBtnText}>Pay ₹{selectedPlan?.priceInr} with Razorpay</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => void openInBrowser()} style={styles.linkBtn}>
              <Text style={styles.linkText}>Open in browser</Text>
            </TouchableOpacity>

            <Text style={[styles.sectionLabel, { marginTop: SIZES.lg }]}>2. CLAIM (SECURE)</Text>
            <Text style={styles.claimHint}>
              Payment ke baad Razorpay Payment ID (pay_…) daalo. Server Razorpay se check karega —
              tabhi Premium on hoga. Fake ID se unlock nahi hoga.
            </Text>
            <TextInput
              style={styles.input}
              value={paymentIdInput}
              onChangeText={setPaymentIdInput}
              placeholder="pay_xxxxxxxxxxxx"
              placeholderTextColor={COLORS.text.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.unlockBtn}
              onPress={() => void onClaim()}
              disabled={claiming}
            >
              {claiming ? (
                <ActivityIndicator color={COLORS.accent.green} />
              ) : (
                <Text style={styles.unlockBtnText}>Verify & Unlock</Text>
              )}
            </TouchableOpacity>

            {!PREMIUM_API_BASE ? (
              <Text style={styles.warn}>
                PREMIUM_API_BASE empty — pehle Vercel pe gmax-premium-api deploy karke URL set karo.
              </Text>
            ) : null}
          </>
        )}

        {msg ? <Text style={styles.msg}>{msg}</Text> : null}
        {err ? <Text style={styles.err}>{err}</Text> : null}

        <Text style={styles.footnote}>
          Unlock only after Razorpay confirms payment on our server. Key Secret never leaves the
          server.
        </Text>
      </View>

      <Modal visible={!!webUrl} animationType="slide" onRequestClose={() => setWebUrl(null)}>
        <View style={[styles.webWrap, { paddingTop: insets.top }]}>
          <View style={styles.webBar}>
            <TouchableOpacity onPress={() => setWebUrl(null)}>
              <Text style={styles.webClose}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.webTitle}>Razorpay</Text>
            <View style={{ width: 48 }} />
          </View>
          {webUrl ? (
            <WebView
              source={{ uri: webUrl }}
              onNavigationStateChange={(nav) => {
                const u = nav.url || '';
                const m = u.match(/[?&](?:razorpay_)?payment_id=([^&]+)/i);
                if (m?.[1]) setPaymentIdInput(decodeURIComponent(m[1]));
              }}
              startInLoadingState
              style={{ flex: 1, backgroundColor: '#fff' }}
            />
          ) : null}
          <View style={[styles.webFooter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Text style={styles.webFooterHint}>
              Pay complete ke baad Payment ID neeche claim box me aana chahiye. Phir Close karke
              Verify & Unlock dabao.
            </Text>
            <TouchableOpacity style={styles.webUnlockBtn} onPress={() => setWebUrl(null)}>
              <Text style={styles.webUnlockText}>Close & enter Payment ID</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.md,
    paddingBottom: SIZES.md,
  },
  headerTitle: { fontFamily: FONTS.bold, fontSize: 18, color: COLORS.text.primary },
  body: { flex: 1, paddingHorizontal: SIZES.md },
  hero: { alignItems: 'center', marginBottom: SIZES.lg, gap: 8 },
  heroTitle: { fontFamily: FONTS.bold, fontSize: 24, color: COLORS.text.primary },
  heroSub: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.secondary,
    textAlign: 'center',
  },
  featureCard: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: SIZES.radius.md,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    padding: SIZES.md,
    marginBottom: SIZES.lg,
    gap: 12,
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontFamily: FONTS.medium, fontSize: 15, color: COLORS.text.primary },
  sectionLabel: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    letterSpacing: 2,
    color: COLORS.text.muted,
    marginBottom: SIZES.sm,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: SIZES.radius.md,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    padding: SIZES.md,
    marginBottom: SIZES.sm,
  },
  planCardActive: {
    borderColor: COLORS.accent.green,
    backgroundColor: COLORS.surfaceLight,
  },
  planTitle: { fontFamily: FONTS.medium, fontSize: 16, color: COLORS.text.primary },
  planMeta: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.text.secondary, marginTop: 2 },
  planPrice: { fontFamily: FONTS.bold, fontSize: 22, color: COLORS.text.primary },
  payBtn: {
    marginTop: SIZES.md,
    backgroundColor: COLORS.accent.green,
    borderRadius: SIZES.radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  payBtnText: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.background },
  linkBtn: { alignItems: 'center', paddingVertical: 10 },
  linkText: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.text.secondary },
  claimHint: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
    marginBottom: 8,
    lineHeight: 18,
  },
  input: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: SIZES.radius.sm,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingHorizontal: SIZES.md,
    paddingVertical: 12,
    color: COLORS.text.primary,
    fontFamily: FONTS.regular,
    fontSize: 14,
    marginBottom: 10,
  },
  unlockBtn: {
    borderWidth: 1,
    borderColor: COLORS.accent.green,
    borderRadius: SIZES.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  unlockBtnText: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.accent.green },
  warn: {
    marginTop: 10,
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#e07a5f',
    textAlign: 'center',
  },
  msg: {
    textAlign: 'center',
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.accent.green,
    marginTop: 8,
  },
  err: {
    textAlign: 'center',
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: '#e07a5f',
    marginTop: 8,
  },
  footnote: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.text.muted,
    textAlign: 'center',
    marginTop: SIZES.lg,
    lineHeight: 16,
  },
  webWrap: { flex: 1, backgroundColor: COLORS.background },
  webBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
  },
  webClose: { fontFamily: FONTS.medium, fontSize: 15, color: COLORS.text.secondary },
  webTitle: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.text.primary },
  webFooter: {
    paddingHorizontal: SIZES.md,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.glassBorder,
    backgroundColor: COLORS.surfaceRaised,
  },
  webFooterHint: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  webUnlockBtn: {
    backgroundColor: COLORS.accent.green,
    borderRadius: SIZES.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  webUnlockText: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.background },
});
