/**
 * GMAX Voice Assistant — uses the user's own Gemini API key (stored only on device).
 * Never sends the key to GMAX servers.
 */
import { getGeminiApiKey } from './GeminiKeyStore';

export type VoiceAction =
  | { type: 'play_search'; query: string }
  | { type: 'play_pause' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'seek'; seconds: number }
  | { type: 'volume'; level: number }
  | { type: 'like' }
  | { type: 'search'; query: string }
  | { type: 'create_playlist'; name: string; query?: string }
  | { type: 'open_library' }
  | { type: 'open_home' }
  | { type: 'open_search' }
  | { type: 'open_settings' }
  | { type: 'what_playing' }
  | { type: 'help' }
  | { type: 'none' };

export type AssistantResult = {
  reply: string;
  actions: VoiceAction[];
  language: 'hi' | 'en' | 'auto';
};

const SYSTEM = `You are GMAX, a premium Hindi/English music voice assistant inside a music player app (YouTube Music style).
The user speaks or types commands. Reply briefly and naturally, then return structured actions.

Supported actions (JSON only in the actions array):
- play_search: { "type":"play_search", "query":"song or artist name" }
- play_pause: toggle play/pause
- pause | resume | next | previous
- seek: { "type":"seek", "seconds": 30 }
- volume: { "type":"volume", "level": 0.0-1.0 }
- like
- search: { "type":"search", "query":"..." }
- create_playlist: { "type":"create_playlist", "name":"...", "query":"optional seed songs" }
- open_library | open_home | open_search | open_settings
- what_playing | help | none

Rules:
1) Prefer play_search when user asks to play a song/artist.
2) reply: 1 short sentence the app will speak aloud (same language as user).
3) actions: 0-3 items max.
4) Output STRICT JSON only, no markdown:
{"reply":"...","actions":[...],"language":"hi"|"en"|"auto"}`;

function extractJson(text: string): any {
  const raw = text.trim();
  try {
    return JSON.parse(raw);
  } catch {
    /* fall through */
  }
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {
      /* ignore */
    }
  }
  return null;
}

function normalizeActions(arr: any): VoiceAction[] {
  if (!Array.isArray(arr)) return [];
  const out: VoiceAction[] = [];
  for (const a of arr) {
    if (!a || typeof a !== 'object') continue;
    const type = String(a.type || '').toLowerCase();
    switch (type) {
      case 'play_search':
        if (a.query) out.push({ type: 'play_search', query: String(a.query) });
        break;
      case 'play_pause':
      case 'toggle':
        out.push({ type: 'play_pause' });
        break;
      case 'pause':
        out.push({ type: 'pause' });
        break;
      case 'resume':
      case 'play':
        out.push({ type: 'resume' });
        break;
      case 'next':
        out.push({ type: 'next' });
        break;
      case 'previous':
      case 'prev':
        out.push({ type: 'previous' });
        break;
      case 'seek':
        out.push({ type: 'seek', seconds: Number(a.seconds) || 0 });
        break;
      case 'volume':
        out.push({ type: 'volume', level: Math.max(0, Math.min(1, Number(a.level) || 0.7)) });
        break;
      case 'like':
        out.push({ type: 'like' });
        break;
      case 'search':
        if (a.query) out.push({ type: 'search', query: String(a.query) });
        break;
      case 'create_playlist':
        if (a.name)
          out.push({
            type: 'create_playlist',
            name: String(a.name),
            query: a.query ? String(a.query) : undefined,
          });
        break;
      case 'open_library':
      case 'open_home':
      case 'open_search':
      case 'open_settings':
      case 'what_playing':
      case 'help':
        out.push({ type: type as any });
        break;
      default:
        break;
    }
  }
  return out;
}

export async function processUserCommand(
  userText: string,
  context?: { nowPlaying?: string; language?: string }
): Promise<AssistantResult> {
  const key = await getGeminiApiKey();
  if (!key) {
    return {
      reply:
        'Gemini API key set nahi hai. Settings → Voice Assistant mein apni key paste karo.',
      actions: [{ type: 'open_settings' }],
      language: 'hi',
    };
  }

  const text = userText.trim();
  if (!text) {
    return { reply: 'Bolo, main sun raha hoon.', actions: [], language: 'hi' };
  }

  const ctx = context?.nowPlaying
    ? `Currently playing: ${context.nowPlaying}`
    : 'Nothing playing right now.';
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `${SYSTEM}\n\nContext: ${ctx}\nUser said: ${text}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 400,
      responseMimeType: 'application/json',
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      reply: 'Network error. Internet check karo.',
      actions: [],
      language: 'hi',
    };
  }

  if (!res.ok) {
    if (res.status === 400 || res.status === 403) {
      return {
        reply: 'Gemini key invalid ya blocked hai. Settings mein nayi key try karo.',
        actions: [{ type: 'open_settings' }],
        language: 'hi',
      };
    }
    return {
      reply: `Gemini error ${res.status}. Thodi der baad try karo.`,
      actions: [],
      language: 'hi',
    };
  }

  const data = await res.json();
  const raw =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
  const parsed = extractJson(raw);
  if (!parsed) {
    return {
      reply: raw.slice(0, 160) || 'Samajh nahi aaya, dobara bolo.',
      actions: [],
      language: 'auto',
    };
  }

  return {
    reply: String(parsed.reply || 'OK'),
    actions: normalizeActions(parsed.actions),
    language: parsed.language === 'en' ? 'en' : parsed.language === 'hi' ? 'hi' : 'auto',
  };
}

/** Best-effort offline intent when Gemini fails or for quick commands */
export function localQuickIntent(text: string): AssistantResult | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  if (/^(pause|ruk|roko|band kar)/i.test(t)) {
    return { reply: 'Paused.', actions: [{ type: 'pause' }], language: 'en' };
  }
  if (/^(play|chalao|resume|continue)/i.test(t) && t.split(/\s+/).length <= 2) {
    return { reply: 'Playing.', actions: [{ type: 'resume' }], language: 'en' };
  }
  if (/^(next|aage|skip)/i.test(t)) {
    return { reply: 'Next track.', actions: [{ type: 'next' }], language: 'en' };
  }
  if (/^(previous|peeche|back)/i.test(t)) {
    return { reply: 'Previous track.', actions: [{ type: 'previous' }], language: 'en' };
  }
  const playM = t.match(/^(?:play|chalao|gaana)\s+(.+)/i);
  if (playM?.[1]) {
    return {
      reply: `Playing ${playM[1]}`,
      actions: [{ type: 'play_search', query: playM[1].trim() }],
      language: 'en',
    };
  }
  return null;
}

export async function speakReply(text: string, language: string = 'hi'): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Speech = require('expo-speech');
    const lang = language === 'en' ? 'en-IN' : 'hi-IN';
    await new Promise<void>((resolve) => {
      Speech.stop();
      Speech.speak(text, {
        language: lang,
        pitch: 1.0,
        rate: 0.95,
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: () => resolve(),
      });
    });
  } catch {
    /* TTS optional */
  }
}

export function stopSpeaking(): void {
  try {
    const Speech = require('expo-speech');
    Speech.stop();
  } catch {
    /* ignore */
  }
}
