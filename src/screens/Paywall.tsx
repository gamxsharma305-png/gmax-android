import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  StyleSheet,
  Text,
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

/**
 * Best-effort success URL detect. Without a custom redirect on the
 * Payment Link, Razorpay often stays on its own thank-you page — user
 * taps "Payment done — Unlock" in the WebView bar.
 */
function looksLikePaymentSuccess(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes('payment_id=') ||
    u.includes('razorpay_payment_id') ||
    u.includes('/success') ||
    u.includes('status=captured') ||
    u.includes('status=authorized') ||
    u.includes('payment-success') ||
    u.includes('payments.razorpay.com') && u.includes('success') ||
    u.includes('thank') ||
    u.includes('paid=true')
  );
}

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { isPremium, plans, features, daysLeft, activate, state } = useSubscription();

  const [selected, setSelected] = useState<PlanId>('monthly');
  const [paying, setPaying] = useState(false);
  const [webUrl, setWebUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const pendingPlan = useRef<PlanId | null>(null);

  const selectedPlan = plans.find((p) => p.id === selected) ?? plans[0];

  const unlock = useCallback(
    async (planId: PlanId, paymentId?: string) => {
      await activate(planId, paymentId);
      setWebUrl(null);
      setPaying(false);
      setMsg('Premium unlocked!');
      setTimeout(() => navigation.goBack(), 900);
    },
    [activate, navigation]
  );

  const openPayment = useCallback(async (plan: Plan) => {
    pendingPlan.current = plan.id;
    setMsg(null);
    const link = (plan.paymentLink || '').trim();
    if (!link) {
      setMsg('Payment link missing');
      return;
    }
    // In-app WebView — Razorpay page stays inside GMAX
    setWebUrl(link);
    setPaying(true);
  }, []);

  const openInBrowser = useCallback(async () => {
    if (!selectedPlan?.paymentLink) return;
    pendingPlan.current = selectedPlan.id;
    try {
      await Linking.openURL(selectedPlan.paymentLink);
      setMsg('Pay on Razorpay, then tap "I\'ve paid — unlock now".');
    } catch {
      setMsg('Could not open payment page.');
    }
  }, [selectedPlan]);

  const onManualPaid = useCallback(async () => {
    const planId = pendingPlan.current ?? selected;
    setPaying(true);
    setMsg('Unlocking…');
    await unlock(planId);
  }, [selected, unlock]);

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
              ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left · plan ${state.planId ?? ''}`
              : 'Download, Auto Playlists & more playlists'}
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
            <Text style={styles.sectionLabel}>CHOOSE PLAN</Text>
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
                    <Text style={styles.planMeta}>{p.days} days access</Text>
                  </View>
                  <Text style={styles.planPrice}>₹{p.priceInr}</Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={styles.payBtn}
              onPress={() => selectedPlan && void openPayment(selectedPlan)}
              disabled={paying && !!webUrl}
              activeOpacity={0.85}
            >
              {paying && !webUrl ? (
                <ActivityIndicator color={COLORS.background} />
              ) : (
                <Text style={styles.payBtnText}>
                  Pay ₹{selectedPlan?.priceInr} with Razorpay
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => void openInBrowser()} style={styles.linkBtn}>
              <Text style={styles.linkText}>Open payment page in browser</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => void onManualPaid()} style={styles.unlockBtn}>
              <Text style={styles.unlockBtnText}>I've paid — unlock now</Text>
            </TouchableOpacity>
          </>
        )}

        {msg ? <Text style={styles.msg}>{msg}</Text> : null}

        <Text style={styles.footnote}>
          Pay on Razorpay (UPI / card). After payment success, tap "I've paid — unlock now"
          or the green Unlock button on the payment screen. Premium stays on this device for
          the plan period.
        </Text>
      </View>

      <Modal visible={!!webUrl} animationType="slide" onRequestClose={() => setWebUrl(null)}>
        <View style={[styles.webWrap, { paddingTop: insets.top }]}>
          <View style={styles.webBar}>
            <TouchableOpacity
              onPress={() => {
                setWebUrl(null);
                setPaying(false);
              }}
            >
              <Text style={styles.webClose}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.webTitle}>Razorpay</Text>
            <View style={{ width: 48 }} />
          </View>

          {webUrl ? (
            <WebView
              source={{ uri: webUrl }}
              onNavigationStateChange={(nav) => {
                if (looksLikePaymentSuccess(nav.url) && pendingPlan.current) {
                  void unlock(pendingPlan.current);
                }
              }}
              startInLoadingState
              style={{ flex: 1, backgroundColor: '#fff' }}
            />
          ) : null}

          {/* Always visible — no redirect needed on Payment Link */}
          <View style={[styles.webFooter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Text style={styles.webFooterHint}>
              Payment complete ho gayi? Neeche Unlock dabao.
            </Text>
            <TouchableOpacity style={styles.webUnlockBtn} onPress={() => void onManualPaid()}>
              <Text style={styles.webUnlockText}>Payment done — Unlock Premium</Text>
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
  unlockBtn: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.accent.green,
    borderRadius: SIZES.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  unlockBtnText: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.accent.green },
  msg: {
    textAlign: 'center',
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.accent.green,
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
