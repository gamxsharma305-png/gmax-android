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

export type GetKeyResult = {
  ok: boolean;
  shortUrl?: string;
  fallbackUrl?: string;
  days?: number;
  error?: string;
};

export type VerifyKeyResult = {
  ok: boolean;
  until?: number;
  days?: number;
  hours?: number;
  plan?: string;
  error?: string;
};

/** AroLinks Get Key — returns shortUrl only (code after ads). Always open in system browser. */
export async function getAroKey(deviceId: string): Promise<GetKeyResult> {
  const root = baseUrl();
  if (!root) return { ok: false, error: 'Premium API not configured' };
  try {
    const res = await fetch(`${root}/api/get-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    });
    const text = await res.text();
    let data: GetKeyResult = {};
    try {
      data = JSON.parse(text) as GetKeyResult;
    } catch {
      /* HTML 404 page from Vercel */
    }
    if (res.status === 404) {
      return {
        ok: false,
        error:
          'Get Key API missing (404). Vercel pe api/get-key.js + api/verify.js deploy karo + AROLINKS_TOKEN set karo.',
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: data.error || `HTTP ${res.status}`,
        fallbackUrl: data.fallbackUrl,
      };
    }
    return {
      ok: !!data.ok || !!(data.shortUrl || data.fallbackUrl),
      shortUrl: data.shortUrl,
      fallbackUrl: data.fallbackUrl,
      days: data.days ?? 15,
      error: data.error,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

/** Verify 12-digit AroLinks code → 15 days device unlock. */
export async function verifyAroKey(code: string, deviceId: string): Promise<VerifyKeyResult> {
  const root = baseUrl();
  if (!root) return { ok: false, error: 'Premium API not configured' };
  const digits = code.replace(/\D/g, '');
  if (!/^\d{12}$/.test(digits)) {
    return { ok: false, error: '12-digit code chahiye' };
  }
  try {
    const res = await fetch(`${root}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: digits, deviceId }),
    });
    const text = await res.text();
    let data: VerifyKeyResult = {};
    try {
      data = JSON.parse(text) as VerifyKeyResult;
    } catch {
      /* non-JSON */
    }
    if (res.status === 404) {
      return {
        ok: false,
        error: 'Verify API missing (404). Vercel pe api/verify.js deploy karo.',
      };
    }
    if (res.status === 429) return { ok: false, error: data.error || 'Too many requests' };
    if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` };
    return {
      ok: !!data.ok,
      until: data.until,
      days: data.days ?? 15,
      hours: data.hours,
      plan: data.plan,
      error: data.error,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}
