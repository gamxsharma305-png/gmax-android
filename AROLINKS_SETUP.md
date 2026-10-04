# AroLinks Free Key (15 days × 2)

Paid Razorpay se **alag** free unlock.

## Flow
1. App → Paywall → **Get Key**
2. Backend device-bound 12-digit code banata hai
3. AroLinks short link open → ads/steps
4. End par 12-digit code dikhta hai
5. App me paste → **Verify Key** → **15 din** unlock
6. 30 din me max **2 baar** (15+15=30)

## Vercel env
```
AROLINKS_TOKEN=...
KEY_SECRET=long-random-hex
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
CODE_REVEAL_BASE=https://auth.pwasmultiverse.workers.dev/generate?code=
```

## Deploy
`api/` + `lib/` ko gmax-premium-api Vercel project me deploy karo.

App calls:
- POST /api/get-key `{ deviceId }`
- POST /api/verify `{ code, deviceId }`
