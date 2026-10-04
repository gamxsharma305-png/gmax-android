import { readJson, writeJson, STORAGE_KEYS } from '../core/storage';
import { claimPremium, fetchPremiumStatus, getAroKey, verifyAroKey } from './PremiumApi';

export type PlanId = 'monthly' | 'bimonthly';

export type Plan = {
  id: PlanId;
  title: string;
  priceInr: number;
  days: number;
  label: string;
  paymentLink: string;
};

export type SubscriptionState = {
  active: boolean;
  planId: PlanId | null;
  expiresAt: number;
  paymentId?: string;
  activatedAt?: number;
  deviceId?: string;
  promoRedemptions?: number[];
};

const STORAGE_KEY = 'subscription';
const DEVICE_KEY = 'device-id';

export const PLANS: Plan[] = [
  {
    id: 'monthly',
    title: '1 Month',
    priceInr: 19,
    days: 30,
    label: '₹19 / month',
    paymentLink: 'https://rzp.io/rzp/CXGmrGhC',
  },
  {
    id: 'bimonthly',
    title: '2 Months',
    priceInr: 39,
    days: 60,
    label: '₹39 / 2 months',
    paymentLink: 'https://rzp.io/rzp/bNWwvel',
  },
];

export const PREMIUM_FEATURES = [
  'Offline download (Musify-style)',
  'Spotify playlist import',
  'All Auto Playlists',
  'Unlimited playlists',
  'Premium support',
] as const;

export const PROMO_DAYS = 15;
export const PROMO_MAX_PER_MONTH = 2;
export const PROMO_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const DEFAULT_STATE: SubscriptionState = {
  active: false,
  planId: null,
  expiresAt: 0,
};

function randomId(): string {
  return `gmax_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

class SubscriptionServiceImpl {
  private state: SubscriptionState = { ...DEFAULT_STATE };
  private deviceId = '';
  private listeners = new Set<() => void>();
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    this.deviceId = await readJson<string>(DEVICE_KEY, '');
    if (!this.deviceId) {
      this.deviceId = randomId();
      await writeJson(DEVICE_KEY, this.deviceId);
    }
    const stored = await readJson<Partial<SubscriptionState>>(STORAGE_KEY, {});
    this.state = { ...DEFAULT_STATE, ...stored, deviceId: this.deviceId };
    this.recompute();
    this.loaded = true;
    void this.refreshFromServer();
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  private recompute(): void {
    const now = Date.now();
    if (this.state.expiresAt > 0 && this.state.expiresAt <= now) {
      this.state = { ...DEFAULT_STATE, deviceId: this.deviceId, promoRedemptions: this.state.promoRedemptions };
      void writeJson(STORAGE_KEY, this.state);
    } else if (this.state.expiresAt > now) {
      this.state = { ...this.state, active: true, deviceId: this.deviceId };
    } else {
      this.state = { ...this.state, active: false, deviceId: this.deviceId };
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  getState(): SubscriptionState {
    this.recompute();
    return { ...this.state };
  }

  isPremium(): boolean {
    this.recompute();
    return this.state.active && this.state.expiresAt > Date.now();
  }

  canCreatePlaylist(currentUserPlaylistCount: number): boolean {
    if (this.isPremium()) return true;
    return currentUserPlaylistCount < 1;
  }

  canDownload(): boolean {
    return this.isPremium();
  }

  canUseAutoPlaylist(): boolean {
    return this.isPremium();
  }

  getPlan(id: PlanId): Plan | undefined {
    return PLANS.find((p) => p.id === id);
  }

  async applyServerEntitlement(opts: {
    planId: string;
    expiresAt: number;
    paymentId?: string;
  }): Promise<SubscriptionState> {
    const planId = (opts.planId === 'bimonthly' ? 'bimonthly' : 'monthly') as PlanId;
    this.state = {
      active: opts.expiresAt > Date.now(),
      planId,
      expiresAt: opts.expiresAt,
      paymentId: opts.paymentId,
      activatedAt: Date.now(),
      deviceId: this.deviceId,
      promoRedemptions: this.state.promoRedemptions,
    };
    await writeJson(STORAGE_KEY, this.state);
    this.notify();
    return this.getState();
  }

  async claimWithPaymentId(paymentId: string): Promise<{ ok: boolean; error?: string }> {
    const id = paymentId.trim();
    if (id.length < 10) {
      return { ok: false, error: 'Enter full Razorpay Payment ID (pay_…)' };
    }
    const result = await claimPremium(id, this.deviceId || (await this.ensureDevice()));
    if (!result.ok || !result.active || !result.expiresAt) {
      return { ok: false, error: result.error || 'Payment not verified' };
    }
    await this.applyServerEntitlement({
      planId: result.planId || 'monthly',
      expiresAt: result.expiresAt,
      paymentId: id,
    });
    return { ok: true };
  }

  private async ensureDevice(): Promise<string> {
    if (this.deviceId) return this.deviceId;
    this.deviceId = randomId();
    await writeJson(DEVICE_KEY, this.deviceId);
    return this.deviceId;
  }

  async refreshFromServer(): Promise<void> {
    try {
      if (!this.deviceId) return;
      const s = await fetchPremiumStatus(this.deviceId);
      if (s.active && s.expiresAt && s.expiresAt > Date.now()) {
        await this.applyServerEntitlement({
          planId: (s.planId as string) || 'monthly',
          expiresAt: s.expiresAt,
          paymentId: this.state.paymentId,
        });
      }
    } catch {
      /* offline */
    }
  }

  async clear(): Promise<void> {
    this.state = { ...DEFAULT_STATE, deviceId: this.deviceId, promoRedemptions: this.state.promoRedemptions };
    await writeJson(STORAGE_KEY, this.state);
    this.notify();
  }

  /** AroLinks: 15 days/key, max 2 per 30 days, device-bound 12-digit. */
  async redeemPromoCode(raw: string): Promise<{ ok: boolean; error?: string; daysAdded?: number }> {
    const code = raw.trim().replace(/\D/g, '');
    if (code.length !== 12) {
      return { ok: false, error: '12-digit code daalo (AroLinks se copy)' };
    }
    const now = Date.now();
    const recent = (this.state.promoRedemptions || []).filter((t) => now - t < PROMO_WINDOW_MS);
    if (recent.length >= PROMO_MAX_PER_MONTH) {
      const oldest = Math.min(...recent);
      const waitDays = Math.ceil((PROMO_WINDOW_MS - (now - oldest)) / (24 * 60 * 60 * 1000));
      return { ok: false, error: `Limit: 2 keys / 30 days. ~${waitDays} din baad try karo` };
    }
    const deviceId = this.deviceId || (await this.ensureDevice());
    const result = await verifyAroKey(code, deviceId);
    if (!result.ok || !result.until) {
      return { ok: false, error: result.error || 'Invalid code' };
    }
    const localBase = Math.max(this.state.expiresAt || 0, now);
    const until = Math.max(result.until, localBase + PROMO_DAYS * 24 * 60 * 60 * 1000);
    await this.applyServerEntitlement({
      planId: 'monthly',
      expiresAt: until,
      paymentId: `arolinks:${code.slice(0, 6)}`,
    });
    this.state.promoRedemptions = [...recent, now];
    await writeJson(STORAGE_KEY, this.state);
    this.notify();
    return { ok: true, daysAdded: result.days || PROMO_DAYS };
  }

  async requestAroKey(): Promise<{ ok: boolean; shortUrl?: string; fallbackUrl?: string; error?: string }> {
    const deviceId = this.deviceId || (await this.ensureDevice());
    return getAroKey(deviceId);
  }

  promoRedemptionsLeft(): number {
    const now = Date.now();
    const recent = (this.state.promoRedemptions || []).filter((t) => now - t < PROMO_WINDOW_MS);
    return Math.max(0, PROMO_MAX_PER_MONTH - recent.length);
  }

  daysLeft(): number {
    if (!this.isPremium()) return 0;
    return Math.max(0, Math.ceil((this.state.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
  }
}

export const SubscriptionService = new SubscriptionServiceImpl();

void STORAGE_KEYS;
