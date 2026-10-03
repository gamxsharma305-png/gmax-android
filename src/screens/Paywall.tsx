import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { ChevronLeft, Check, Crown, Lock } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS, FONTS, SIZES } from '../constants/theme';
import { useSubscription } from '../hooks/useSubscription';
import { Plan, PlanId } from '../services/SubscriptionService';
import { PREMIUM_API_BASE } from '../services/PremiumApi';

/** Chrome mobile UA — Razorpay shows UPI / PhonePe / GPay properly */
const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function extractPaymentId(url: string): string | null {
  const m = url.match(/[?&](?:razorpay_)?payment_id=([^&]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

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

  /** Preferred: system browser — full UPI apps + scroll works */
  const openInBrowser = useCallback(
    async (plan?: Plan) => {
      const p = plan ?? selectedPlan;
      if (!p?.paymentLink) return;
      pendingPlan.current = p.id;
      setMsg(null);
      setErr(null);
      try {
        const can = await Linking.canOpenURL(p.paymentLink);
        if (can) {
          await Linking.openURL(p.paymentLink);
          setMsg('Browser me pay karo → wapas aao → Payment ID (pay_…) daalo → Unlock');
        } else {
          setWebUrl(p.paymentLink);
        }
      } catch {
        setWebUrl(p.paymentLink);
      }
    },
    [selectedPlan]
  );

  /** In-app WebView fallback (full screen, UPI intent support) */
  const openInWebView = useCallback(() => {
    if (!selectedPlan?.paymentLink) return;
    pendingPlan.current = selectedPlan.id;
    setMsg(null);
    setErr(null);
    setWebUrl(selectedPlan.paymentLink);
  }, [selectedPlan]);

  const onClaim = useCallback(async () => {
    const id = paymentIdInput.trim();
    if (!id) {
      setErr('Razorpay Payment ID (pay_…) daalo');
      return;
    }
    setClaiming(true);
    setErr(null);
    setMsg('Verifying…');
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

  const onNavChange = useCallback((nav: WebViewNavigation) => {
    const u = nav.url || '';
    const pid = extractPaymentId(u);
    if (pid) setPaymentIdInput(pid);
    if (u.includes('payment-success') || u.includes('gmax-premium-api')) {
      const fromHash = u.match(/pay_[A-Za-z0-9]+/);
      if (fromHash) setPaymentIdInput(fromHash[0]);
    }
  }, []);

  /** Open UPI / PhonePe / GPay intents outside WebView */
  const onShouldStart = useCallback((req: { url: string }) => {
    const url = req.url || '';
    if (
      url.startsWith('upi://') ||
      url.startsWith('phonepe://') ||
      url.startsWith('paytmmp://') ||
      url.startsWith('gpay://') ||
      url.startsWith('tez://') ||
      url.startsWith('intent://') ||
      url.startsWith('market://')
    ) {
      Linking.openURL(url).catch(() => {
        // intent:// fallback: try extracting browser_fallback_url
        const fb = url.match(/browser_fallback_url=([^;]+)/);
        if (fb?.[1]) {
          void Linking.openURL(decodeURIComponent(fb[1]));
        }
      });
      return false;
    }
    return true;
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + SIZES.sm }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <ChevronLeft color={COLORS.text.primary} size={26} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>GMAX Premium</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: SIZES.md,
          paddingBottom: insets.bottom + 40,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <View style={styles.hero}>
          <Crown color={COLORS.accent.green} size={36} />
          <Text style={styles.heroTitle}>
            {isPremium ? 'You are Premium' : 'Unlock Premium'}
          </Text>
          <Text style={styles.heroSub}>
            {isPremium
              ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left · ${state.planId ?? ''}`
              : 'Pay in browser (UPI) → enter Payment ID → unlock'}
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

            {/* Primary: browser — UPI always works */}
            <TouchableOpacity
              style={styles.payBtn}
              onPress={() => void openInBrowser()}
              activeOpacity={0.85}
            >
              <Text style={styles.payBtnText}>
                Pay ₹{selectedPlan?.priceInr} (Browser · UPI)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={openInWebView} style={styles.linkBtn}>
              <Text style={styles.linkText}>Open inside app (WebView)</Text>
            </TouchableOpacity>

            <Text style={styles.tip}>
              Tip: Browser me UPI / PhonePe / GPay sab dikhte hain. App WebView me kabhi-kabhi UPI
              hide ho jata hai — isliye Browser button recommended.
            </Text>

            <Text style={[styles.sectionLabel, { marginTop: SIZES.lg }]}>2. CLAIM</Text>
            <Text style={styles.claimHint}>
              Payment ke baad Razorpay se Payment ID (pay_…) copy karke yahan paste karo, phir
              Verify & Unlock.
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
                PREMIUM_API_BASE empty — Vercel deploy + URL set karo.
              </Text>
            ) : null}
          </>
        )}

        {msg ? <Text style={styles.msg}>{msg}</Text> : null}
        {err ? <Text style={styles.err}>{err}</Text> : null}

        <Text style={styles.footnote}>
          Unlock only after server confirms payment (webhook). Fake ID se unlock nahi hoga.
        </Text>
      </ScrollView>

      {/* Full-screen WebView — no bottom bar blocking Pay button */}
      <Modal visible={!!webUrl} animationType="slide" onRequestClose={() => setWebUrl(null)}>
        <View style={[styles.webWrap, { paddingTop: insets.top }]}>
          <View style={styles.webBar}>
            <TouchableOpacity onPress={() => setWebUrl(null)}>
              <Text style={styles.webClose}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.webTitle}>Razorpay</Text>
            <TouchableOpacity
              onPress={() => {
                if (webUrl) void Linking.openURL(webUrl);
              }}
            >
              <Text style={styles.webBrowser}>Browser</Text>
            </TouchableOpacity>
          </View>
          {webUrl ? (
            <WebView
              source={{ uri: webUrl }}
              style={{ flex: 1, backgroundColor: '#fff' }}
              userAgent={CHROME_UA}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              scalesPageToFit
              setSupportMultipleWindows={false}
              originWhitelist={['*']}
              mixedContentMode="always"
              thirdPartyCookiesEnabled
              sharedCookiesEnabled
              allowsInlineMediaPlayback
              onNavigationStateChange={onNavChange}
              onShouldStartLoadWithRequest={onShouldStart}
              {...(Platform.OS === 'android'
                ? { nestedScrollEnabled: true, overScrollMode: 'always' as const }
                : {})}
            />
          ) : null}
          {/* Thin safe bar only — does NOT cover payment methods */}
          <View style={{ height: Math.max(insets.bottom, 8), backgroundColor: '#fff' }} />
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
  tip: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.muted,
    lineHeight: 18,
    marginTop: 4,
  },
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
  webWrap: { flex: 1, backgroundColor: '#fff' },
  webBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: COLORS.background,
  },
  webClose: { fontFamily: FONTS.medium, fontSize: 15, color: COLORS.text.secondary },
  webTitle: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.text.primary },
  webBrowser: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.accent.green },
});
