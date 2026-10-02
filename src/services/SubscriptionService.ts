import { readJson, writeJson, STORAGE_KEYS } from '../core/storage';

/**
 * GMAX Premium — Razorpay Payment Links.
 *
 * Live links (no custom redirect configured):
 *  ₹19 / 1 month  → https://rzp.io/rzp/CXGmrGhC
 *  ₹39 / 2 months → https://rzp.io/rzp/bNWwvel
 *
 * After pay, user taps Done / "I've paid" in the app to unlock
 * (Razorpay default thank-you page; auto URL detect is best-effort).
 *
 * Production tip: verify on a backend with Razorpay signature + webhook.
 */

export type PlanId = 'monthly' | 'bimonthly';

export type Plan = {
  id: PlanId;
  title: string;
  priceInr: number;
  days: number;
  label: string;
  /** Razorpay Payment Link short URL */
  paymentLink: string;
};

export type SubscriptionState = {
  active: boolean;
  planId: PlanId | null;
  /** epoch ms when premium ends */
  expiresAt: number;
  paymentId?: string;
  activatedAt?: number;
};

const STORAGE_KEY = 'subscription';

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

/** Optional public Key ID only — never put Key Secret in the app. */
export const RAZORPAY_KEY_ID = '';

export const PREMIUM_FEATURES = [
  'Offline download',
  'All Auto Playlists',
  'Unlimited playlists',
  'Premium support',
] as const;

const DEFAULT_STATE: SubscriptionState = {
  active: false,
  planId: null,
  expiresAt: 0,
};

class SubscriptionServiceImpl {
  private state: SubscriptionState = { ...DEFAULT_STATE };
  private listeners = new Set<() => void>();
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    const stored = await readJson<Partial<SubscriptionState>>(STORAGE_KEY, {});
    this.state = { ...DEFAULT_STATE, ...stored };
    this.recompute();
    this.loaded = true;
  }

  private recompute(): void {
    const now = Date.now();
    if (this.state.expiresAt > 0 && this.state.expiresAt <= now) {
      this.state = { ...DEFAULT_STATE };
      void writeJson(STORAGE_KEY, this.state);
    } else if (this.state.expiresAt > now) {
      this.state = { ...this.state, active: true };
    } else {
      this.state = { ...this.state, active: false };
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

  async activate(planId: PlanId, paymentId?: string): Promise<SubscriptionState> {
    const plan = this.getPlan(planId);
    if (!plan) throw new Error('Unknown plan');

    const now = Date.now();
    const base = Math.max(now, this.state.expiresAt || 0);
    const expiresAt = base + plan.days * 24 * 60 * 60 * 1000;

    this.state = {
      active: true,
      planId,
      expiresAt,
      paymentId: paymentId ?? this.state.paymentId,
      activatedAt: now,
    };
    await writeJson(STORAGE_KEY, this.state);
    this.notify();
    return this.getState();
  }

  async clear(): Promise<void> {
    this.state = { ...DEFAULT_STATE };
    await writeJson(STORAGE_KEY, this.state);
    this.notify();
  }

  daysLeft(): number {
    if (!this.isPremium()) return 0;
    return Math.max(0, Math.ceil((this.state.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
  }
}

export const SubscriptionService = new SubscriptionServiceImpl();

void STORAGE_KEYS;
