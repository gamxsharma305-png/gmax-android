import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { fetchRemoteConfig } from '../services/RemoteConfigService';
import { RewardedAdCard } from '../components/ads/RewardedAdCard';

const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function extractPaymentId(url: string): string | null {
  const m = url.match(/[?&](?:razorpay_)?payment_id=([^&]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const {
    isPremium,
    plans,
    features,
    daysLeft,
    state,
    claimWithPaymentId,
    redeemPromoCode,
    requestAroKey,
    promoLeft,
  } = useSubscription();

  const [selected, setSelected] = useState<PlanId>('monthly');
  const [webUrl, setWebUrl] = useState<string | null>(null);
  const [paymentIdInput, setPaymentIdInput] = useState('');
  const [keyCodeInput, setKeyCodeInput] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [keyLoading, setKeyLoading] = useState(false);
  const [keyVerifying, setKeyVerifying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [keyErr, setKeyErr] = useState<string | null>(null);
  const [payErr, setPayErr] = useState<string | null>(null);
  const [howToUrl, setHowToUrl] = useState<string | null>(null);
  const [howToVisible, setHowToVisible] = useState(false);
  const pendingPlan = useRef<PlanId | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await fetchRemoteConfig(true);
        const url = (cfg as any).guides?.howToGenerateKeyYoutubeUrl as string | undefined;
        if (!cancelled && url && url.startsWith('http')) setHowToUrl(url);
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedPlan = plans.find((p) => p.id === selected) ?? plans[0];

  const openInBrowser = useCallback(
    async (plan?: Plan) => {
      const p = plan ?? selectedPlan;
      if (!p?.paymentLink) return;
      pendingPlan.current = p.id;
      setMsg(null);
      setPayErr(null);
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

  const openInWebView = useCallback(() => {
    if (!selectedPlan?.paymentLink) return;
    pendingPlan.current = selectedPlan.id;
    setMsg(null);
    setPayErr(null);
    setWebUrl(selectedPlan.paymentLink);
  }, [selectedPlan]);

  const onClaim = useCallback(async () => {
    const id = paymentIdInput.trim();
    if (!id) {
      setPayErr('Razorpay Payment ID (pay_…) daalo');
      return;
    }
    setClaiming(true);
    setPayErr(null);
    setMsg('Verifying…');
    const result = await claimWithPaymentId(id);
    setClaiming(false);
    if (!result.ok) {
      setMsg(null);
      setPayErr(result.error || 'Verify failed');
      return;
    }
    setMsg('Premium unlocked!');
    setWebUrl(null);
    setTimeout(() => navigation.goBack(), 900);
  }, [paymentIdInput, claimWithPaymentId, navigation]);

  const onGetKey = useCallback(async () => {
    setKeyErr(null);
    setMsg(null);
    setKeyLoading(true);
    try {
      const result = await requestAroKey();
      if (result.ok && result.shortUrl) {
        setMsg('AroLinks open hua — steps complete karke 12-digit code copy karo');
        await Linking.openURL(result.shortUrl);
      } else if (result.fallbackUrl) {
        setMsg('Fallback link open…');
        await Linking.openURL(result.fallbackUrl);
      } else {
        setKeyErr(result.error || 'Get Key fail — Vercel AROLINKS_TOKEN check karo');
      }
    } catch (e) {
      setKeyErr(e instanceof Error ? e.message : 'Get Key failed');
    } finally {
      setKeyLoading(false);
    }
  }, [requestAroKey]);

  const onVerifyKey = useCallback(async () => {
    const code = keyCodeInput.trim().replace(/\s+/g, '');
    if (!code || code.length < 8) {
      setKeyErr('12-digit code daalo (AroLinks se)');
      return;
    }
    setKeyErr(null);
    setMsg(null);
    setKeyVerifying(true);
    try {
      const result = await redeemPromoCode(code);
      if (result.ok) {
        setMsg(`Unlocked! +${result.daysAdded || 15} days premium`);
        setKeyCodeInput('');
        setTimeout(() => navigation.goBack(), 1200);
      } else {
        setKeyErr(result.error || 'Invalid / expired code');
      }
    } catch (e) {
      setKeyErr(e instanceof Error ? e.message : 'Verify failed');
    } finally {
      setKeyVerifying(false);
    }
  }, [keyCodeInput, redeemPromoCode, navigation]);

  const onNavChange = useCallback((nav: WebViewNavigation) => {
    const u = nav.url || '';
    const pid = extractPaymentId(u);
    if (pid) setPaymentIdInput(pid);
    if (u.includes('payment-success') || u.includes('gmax-premium-api')) {
      const fromHash = u.match(/pay_[A-Za-z0-9]+/);
      if (fromHash) setPaymentIdInput(fromHash[0]);
    }
  }, []);

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
        const fb = url.match(/browser_fallback_url=([^;]+)/);
        if (fb?.[1]) void Linking.openURL(decodeURIComponent(fb[1]));
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
              : 'Ads / AroLinks key / paid plan'}
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

        <RewardedAdCard />

        {!isPremium && (
          <>
            <Text style={styles.sectionLabel}>FREE KEY (AroLinks)</Text>
            <View style={styles.keyCard}>
              <Text style={styles.keyTitle}>Free unlock (AroLinks)</Text>
              <Text style={styles.keyHint}>
                Get Key → ads/steps complete → 12-digit code copy → Verify. 15 din / key · max 2
                keys / 30 din
                {typeof promoLeft === 'number' ? ` · ${promoLeft} left` : ''}
              </Text>
              <TouchableOpacity
                style={styles.getKeyBtn}
                onPress={() => void onGetKey()}
                disabled={keyLoading}
                activeOpacity={0.85}
              >
                {keyLoading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.getKeyBtnText}>Get Key</Text>
                )}
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                value={keyCodeInput}
                onChangeText={setKeyCodeInput}
                placeholder="12-digit code"
                placeholderTextColor={COLORS.text.muted}
                keyboardType="number-pad"
                maxLength={14}
              />
              <TouchableOpacity
                style={styles.unlockBtn}
                onPress={() => void onVerifyKey()}
                disabled={keyVerifying}
                activeOpacity={0.85}
              >
                {keyVerifying ? (
                  <ActivityIndicator color={COLORS.accent.green} />
                ) : (
                  <Text style={styles.unlockBtnText}>Verify Key</Text>
                )}
              </TouchableOpacity>
              {keyErr ? <Text style={styles.err}>{keyErr}</Text> : null}
              {howToUrl ? (
                <TouchableOpacity
                  style={styles.howToBtn}
                  onPress={() => setHowToVisible(true)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.howToBtnText}>How to generate key (video)</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <Text style={[styles.sectionLabel, { marginTop: SIZES.md }]}>OR PAY</Text>
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
              Tip: Browser me UPI / PhonePe / GPay sab dikhte hain.
            </Text>

            <Text style={[styles.sectionLabel, { marginTop: SIZES.lg }]}>2. CLAIM (paid)</Text>
            <Text style={styles.claimHint}>
              Payment ke baad Razorpay Payment ID (pay_…) paste karke Verify & Unlock.
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

            {payErr ? <Text style={styles.err}>{payErr}</Text> : null}
            {!PREMIUM_API_BASE ? (
              <Text style={styles.warn}>PREMIUM_API_BASE empty — Vercel URL set karo.</Text>
            ) : null}
          </>
        )}

        {msg ? <Text style={styles.msg}>{msg}</Text> : null}

        <Text style={styles.footnote}>
          Free: 5 rewarded ads = 1 day · AroLinks key · Paid: Razorpay
        </Text>
      </ScrollView>

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
              originWhitelist={['*']}
              onNavigationStateChange={onNavChange}
              onShouldStartLoadWithRequest={onShouldStart}
            />
          ) : null}
          <View style={{ height: Math.max(insets.bottom, 8), backgroundColor: '#fff' }} />
        </View>
      </Modal>

      <Modal
        visible={howToVisible && !!howToUrl}
        animationType="slide"
        onRequestClose={() => setHowToVisible(false)}
      >
        <View style={[styles.webWrap, { paddingTop: insets.top, backgroundColor: '#000' }]}>
          <View style={[styles.webBar, { backgroundColor: '#111' }]}>
            <TouchableOpacity onPress={() => setHowToVisible(false)}>
              <Text style={styles.webClose}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.webTitle}>How to generate key</Text>
            <View style={{ width: 48 }} />
          </View>
          {howToUrl ? (
            <WebView
              source={{ uri: howToUrl }}
              style={{ flex: 1, backgroundColor: '#000' }}
              allowsFullscreenVideo
              allowsInlineMediaPlayback
              javaScriptEnabled
              domStorageEnabled
            />
          ) : null}
          <View style={{ height: Math.max(insets.bottom, 8), backgroundColor: '#000' }} />
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
  keyCard: {
    marginBottom: SIZES.md,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(29,185,84,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(29,185,84,0.35)',
    gap: 10,
  },
  keyTitle: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.text.primary },
  keyHint: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
    lineHeight: 17,
  },
  getKeyBtn: {
    backgroundColor: COLORS.accent.green,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  getKeyBtnText: { fontFamily: FONTS.bold, fontSize: 15, color: '#000' },
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
    lineHeight: 17,
    marginTop: 4,
  },
  claimHint: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text.primary,
    fontFamily: FONTS.medium,
    marginBottom: 10,
  },
  unlockBtn: {
    borderWidth: 1,
    borderColor: COLORS.accent.green,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  unlockBtnText: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.accent.green },
  howToBtn: { paddingVertical: 8 },
  howToBtnText: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.text.secondary },
  err: { fontFamily: FONTS.medium, fontSize: 12, color: '#ef4444', marginTop: 6 },
  warn: { fontFamily: FONTS.regular, fontSize: 12, color: '#f59e0b', marginTop: 8 },
  msg: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.accent.green,
    textAlign: 'center',
    marginTop: 12,
  },
  footnote: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.text.muted,
    textAlign: 'center',
    marginTop: 20,
  },
  webWrap: { flex: 1, backgroundColor: '#fff' },
  webBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#111',
  },
  webClose: { fontFamily: FONTS.medium, color: COLORS.accent.green, fontSize: 15 },
  webTitle: { fontFamily: FONTS.bold, color: '#fff', fontSize: 15 },
  webBrowser: { fontFamily: FONTS.medium, color: COLORS.text.secondary, fontSize: 13 },
});
