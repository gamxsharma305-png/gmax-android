/**
 * Self-hosted in-app updates (sideload APK).
 * Host update.json + APK URL; app checks on launch and shows popup.
 */
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';

export type UpdateInfo = {
  version: string;
  versionCode: number;
  apkUrl: string;
  force?: boolean;
  notes?: string;
};

/** Raw GitHub JSON — update this file when you release a new APK */
const UPDATE_MANIFEST_URL =
  'https://raw.githubusercontent.com/gamxsharma305-png/gmax-android/main/update.json';

type FSModule = {
  cacheDirectory: string | null;
  documentDirectory: string | null;
  getInfoAsync: (uri: string) => Promise<{ exists: boolean; size?: number }>;
  downloadAsync: (
    url: string,
    fileUri: string,
    opts?: { headers?: Record<string, string> }
  ) => Promise<{ uri: string; status: number }>;
  createDownloadResumable?: (
    url: string,
    fileUri: string,
    options?: { headers?: Record<string, string> },
    callback?: (progress: {
      totalBytesWritten: number;
      totalBytesExpectedToWrite: number;
    }) => void
  ) => {
    downloadAsync: () => Promise<{ uri: string; status?: number } | undefined>;
  };
  getContentUriAsync?: (uri: string) => Promise<string>;
  deleteAsync: (uri: string, opts?: { idempotent?: boolean }) => Promise<void>;
};

let FileSystem: FSModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  FileSystem = require('expo-file-system/legacy') as FSModule;
} catch {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    FileSystem = require('expo-file-system') as FSModule;
  } catch {
    FileSystem = null;
  }
}

function currentVersionCode(): number {
  const android = Constants.expoConfig?.android as { versionCode?: number } | undefined;
  return Number(android?.versionCode) || 0;
}

function currentVersionName(): string {
  return Constants.expoConfig?.version || '0.0.0';
}

export async function checkForUpdate(): Promise<{
  available: boolean;
  remote?: UpdateInfo;
  localVersion: string;
  localCode: number;
}> {
  const localCode = currentVersionCode();
  const localVersion = currentVersionName();

  try {
    const res = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) {
      return { available: false, localVersion, localCode };
    }
    const remote = (await res.json()) as UpdateInfo;
    const remoteCode = Number(remote.versionCode) || 0;
    const hasApk = typeof remote.apkUrl === 'string' && remote.apkUrl.startsWith('http');
    const available = remoteCode > localCode && hasApk;
    return { available, remote, localVersion, localCode };
  } catch {
    return { available: false, localVersion, localCode };
  }
}

export type DownloadProgress = {
  percent: number;
  written: number;
  total: number;
};

/**
 * Download APK then open Android package installer.
 * User must allow "Install unknown apps" for GMAX once.
 */
export async function downloadAndInstallApk(
  apkUrl: string,
  onProgress?: (p: DownloadProgress) => void
): Promise<{ ok: boolean; error?: string }> {
  if (Platform.OS !== 'android') {
    await Linking.openURL(apkUrl);
    return { ok: true };
  }

  if (!FileSystem?.cacheDirectory) {
    await Linking.openURL(apkUrl);
    return { ok: true };
  }

  const dest = `${FileSystem.cacheDirectory}gmax-update.apk`;
  try {
    await FileSystem.deleteAsync(dest, { idempotent: true });
  } catch {
    /* ok */
  }

  try {
    if (FileSystem.createDownloadResumable) {
      const task = FileSystem.createDownloadResumable(
        apkUrl,
        dest,
        {},
        (p) => {
          const total = p.totalBytesExpectedToWrite || 1;
          const written = p.totalBytesWritten || 0;
          onProgress?.({
            percent: Math.min(100, Math.round((written / total) * 100)),
            written,
            total,
          });
        }
      );
      const result = await task.downloadAsync();
      if (!result?.uri) {
        await Linking.openURL(apkUrl);
        return { ok: true };
      }
    } else {
      const result = await FileSystem.downloadAsync(apkUrl, dest);
      if (result.status < 200 || result.status >= 300) {
        await Linking.openURL(apkUrl);
        return { ok: true };
      }
      onProgress?.({ percent: 100, written: 1, total: 1 });
    }

    // Open system installer via content:// URI
    if (FileSystem.getContentUriAsync) {
      try {
        const contentUri = await FileSystem.getContentUriAsync(dest);
        // Intent via Linking (works on many devices)
        const can = await Linking.canOpenURL(contentUri);
        if (can) {
          await Linking.openURL(contentUri);
          return { ok: true };
        }
      } catch {
        /* fall through */
      }
    }

    // Fallback: open APK URL in browser
    await Linking.openURL(apkUrl);
    return { ok: true };
  } catch (e) {
    try {
      await Linking.openURL(apkUrl);
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'Update download failed',
      };
    }
  }
}

export function getLocalVersionLabel(): string {
  return `${currentVersionName()} (${currentVersionCode()})`;
}
