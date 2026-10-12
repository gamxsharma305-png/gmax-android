import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@gmax/gemini_api_key_v1';

export async function getGeminiApiKey(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    const t = (v || '').trim();
    return t.length > 10 ? t : null;
  } catch {
    return null;
  }
}

export async function setGeminiApiKey(key: string): Promise<void> {
  const t = key.trim();
  if (!t) {
    await AsyncStorage.removeItem(KEY);
    return;
  }
  await AsyncStorage.setItem(KEY, t);
}

export async function clearGeminiApiKey(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

export function maskGeminiKey(key: string): string {
  const t = key.trim();
  if (t.length < 12) return '••••';
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}
