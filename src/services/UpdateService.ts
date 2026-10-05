/**
 * Self-hosted in-app updates (sideload APK).
 * Download APK, verify size, open system installer.
 * On parse failure → open browser (most reliable on MIUI/realme).
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

const UPDATE_MANIFEST_URL =
  'https://raw.githubusercontent.com/gamxsharma305-png/gmax-android/main/update.json';

/** Reject tiny/corrupt files (real GMAX APK is ~80–120 MB) */
const MIN_APK_BYTES = 20 * 1024 * 1024;

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

export async function checkForUpdate(_legacyVersionArg?: string): Promise<{
  available: boolean;
  /** @deprecated use `available` — kept so older App.tsx still works if any */
  updateAvailable: boolean;
  remote?: UpdateInfo;
  localVersion: string;
  localCode: number;
}> {
  const localCode = currentVersionCode();
  const localVersion = currentVersionName();

  try {
    const res = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    if (!res.ok) {
      return { available: false, updateAvailable: false, localVersion, localCode };
    }
    const remote = (await res.json()) as UpdateInfo;
    const remoteCode = Number(remote.versionCode) || 0;
    const hasApk = typeof remote.apkUrl === 'string' && remote.apkUrl.startsWith('http');
    const available = remoteCode > localCode && hasApk;
    return { available, updateAvailable: available, remote, localVersion, localCode };
  } catch {
    return { available: false, updateAvailable: false, localVersion, localCode };
  }
}

/** Alias for older imports */
export type RemoteUpdate = UpdateInfo;

export type DownloadProgress = {
  percent: number;
  written: number;
  total: number;
};

/**
 * Reliable path for most Android OEMs:
 * open the APK URL in the system browser / download manager.
 * Avoids "problem parsing the package" from broken content:// installs.
 */
export async function openApkInBrowser(apkUrl: string): Promise<void> {
  await Linking.openURL(apkUrl);
}

/**
 * Download APK to cache, verify size, try installer; else browser.
 */
export async function downloadAndInstallApk(
  apkUrl: string,
  onProgress?: (p: DownloadProgress) => void
): Promise<{ ok: boolean; error?: string; usedBrowser?: boolean }> {
  if (Platform.OS !== 'android') {
    await Linking.openURL(apkUrl);
    return { ok: true, usedBrowser: true };
  }

  // Primary reliable path for MIUI / realme / Oppo: system download
  // (in-app content:// install often shows "problem parsing the package")
  try {
    if (!FileSystem?.cacheDirectory) {
      await Linking.openURL(apkUrl);
      return { ok: true, usedBrowser: true };
    }

    const dest = `${FileSystem.cacheDirectory}gmax-update.apk`;
    try {
      await FileSystem.deleteAsync(dest, { idempotent: true });
    } catch {
      /* ok */
    }

    let downloaded = false;

    if (FileSystem.createDownloadResumable) {
      const task = FileSystem.createDownloadResumable(
        apkUrl,
        dest,
        {
          headers: {
            Accept: 'application/vnd.android.package-archive,*/*',
          },
        },
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
      downloaded = !!result?.uri;
    } else {
      const result = await FileSystem.downloadAsync(apkUrl, dest, {
        headers: { Accept: 'application/vnd.android.package-archive,*/*' },
      });
      downloaded = result.status >= 200 && result.status < 300;
      onProgress?.({ percent: 100, written: 1, total: 1 });
    }

    if (downloaded) {
      const info = await FileSystem.getInfoAsync(dest);
      const size = info.size ?? 0;

      // Corrupt / HTML error page / truncated
      if (!info.exists || size < MIN_APK_BYTES) {
        try {
          await FileSystem.deleteAsync(dest, { idempotent: true });
        } catch {
          /* ok */
        }
        await Linking.openURL(apkUrl);
        return {
          ok: true,
          usedBrowser: true,
          error:
            'Downloaded file too small — opened browser. Install from Downloads.',
        };
      }

      // Try content URI install
      if (FileSystem.getContentUriAsync) {
        try {
          const contentUri = await FileSystem.getContentUriAsync(dest);
          await Linking.openURL(contentUri);
          return { ok: true };
        } catch {
          /* fall through to browser */
        }
      }
    }

    await Linking.openURL(apkUrl);
    return { ok: true, usedBrowser: true };
  } catch (e) {
    try {
      await Linking.openURL(apkUrl);
      return { ok: true, usedBrowser: true };
    } catch {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'Update failed',
      };
    }
  }
}

export function getLocalVersionLabel(): string {
  return `${currentVersionName()} (${currentVersionCode()})`;
}
