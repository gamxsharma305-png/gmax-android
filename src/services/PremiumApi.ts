/**
 * Secure Premium API (Vercel).
 * Deployed: https://gmax-premium-api.vercel.app
 */
export const PREMIUM_API_BASE = 'https://gmax-premium-api.vercel.app';

export type ClaimResult = {
  ok: boolean;
  active: boolean;
  planId?: string;
  expiresAt?: number;
  days?: number;
  label?: string;
  alreadyClaimed?: boolean;
  error?: string;
};

export type StatusResult = {
  active: boolean;
  planId?: string | null;
  expiresAt?: number;
  daysLeft?: number;
  error?: string;
};

function baseUrl(): string {
  return (PREMIUM_API_BASE || '').replace(/\/$/, '');
}

export async function claimPremium(paymentId: string, deviceId: string): Promise<ClaimResult> {
  const root = baseUrl();
  if (!root) {
    return {
      ok: false,
      active: false,
      error: 'Premium API URL not set. Deploy gmax-premium-api on Vercel and set PREMIUM_API_BASE.',
    };
  }

  try {
    const res = await fetch(`${root}/api/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId: paymentId.trim(), deviceId }),
    });
    const data = (await res.json().catch(() => ({}))) as ClaimResult & { error?: string };
    if (!res.ok) {
      return { ok: false, active: false, error: data.error || `HTTP ${res.status}` };
    }
    return {
      ok: true,
      active: !!data.active,
      planId: data.planId,
      expiresAt: data.expiresAt,
      days: data.days,
      label: data.label,
      alreadyClaimed: data.alreadyClaimed,
    };
  } catch (e) {
    return {
      ok: false,
      active: false,
      error: e instanceof Error ? e.message : 'Network error',
    };
  }
}

export async function fetchPremiumStatus(deviceId: string): Promise<StatusResult> {
  const root = baseUrl();
  if (!root) return { active: false };

  try {
    const res = await fetch(`${root}/api/status?deviceId=${encodeURIComponent(deviceId)}`);
    const data = (await res.json().catch(() => ({}))) as StatusResult & { error?: string };
    if (!res.ok) return { active: false, error: data.error || `HTTP ${res.status}` };
    return {
      active: !!data.active,
      planId: data.planId,
      expiresAt: data.expiresAt,
      daysLeft: data.daysLeft,
    };
  } catch (e) {
    return { active: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}
