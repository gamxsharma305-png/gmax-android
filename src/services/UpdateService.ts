/**
 * Self-hosted in-app updates (sideload APK).
 * Version name/code stay frozen at 1.2.4 / 39 for install safety.
 * New builds are detected via buildId / apkUrl + versionCode.
 */
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type UpdateInfo = {
  version: string;
  versionCode: number;
  apkUrl: string;
  force?: boolean;
  notes?: string;
  /** Unique per release APK — used when versionCode stays frozen at 39 */
  buildId?: string;
};

const UPDATE_MANIFEST_URL =
  'https://raw.githubusercontent.com/gamxsharma305-png/gmax-android/main/update.json';

const STORAGE_APPLIED = 'gmax_update_applied_key';

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
  const fromConfig = Number(android?.versionCode) || 0;
  if (fromConfig > 0) return fromConfig;
  const native = Number(Constants.nativeBuildVersion) || 0;
  return native > 0 ? native : 0;
}

function currentVersionName(): string {
  return (
    Constants.expoConfig?.version ||
    Constants.nativeAppVersion ||
    '0.0.0'
  );
}

export function updateKey(remote: Pick<UpdateInfo, 'buildId' | 'apkUrl'>): string {
  if (remote.buildId && String(remote.buildId).trim()) return String(remote.buildId).trim();
  if (remote.apkUrl && remote.apkUrl.startsWith('http')) return remote.apkUrl.trim();
  return '';
}

export async function getAppliedUpdateKey(): Promise<string | null> {
  try {
    return (await AsyncStorage.getItem(STORAGE_APPLIED)) || null;
  } catch {
    return null;
  }
}

/** Call after user opens the APK link — stops popup for this release. */
export async function markUpdateApplied(
  remote: Pick<UpdateInfo, 'buildId' | 'apkUrl'>
): Promise<void> {
  const key = updateKey(remote);
  if (!key) return;
  try {
    await AsyncStorage.setItem(STORAGE_APPLIED, key);
  } catch {
    /* ok */
  }
}

export async function checkForUpdate(_legacyVersionArg?: string): Promise<{
  available: boolean;
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
    const hasApk =
      typeof remote.apkUrl === 'string' && remote.apkUrl.startsWith('http');
    if (!hasApk) {
      return {
        available: false,
        updateAvailable: false,
        remote,
        localVersion,
        localCode,
      };
    }

    const key = updateKey(remote);
    const applied = await getAppliedUpdateKey();
    if (key && applied && applied === key) {
      return {
        available: false,
        updateAvailable: false,
        remote,
        localVersion,
        localCode,
      };
    }

    // Higher versionCode (all existing app builds understand this)
    const codeNewer = remoteCode > localCode;
    // Same frozen code + new release key (next builds with this UpdateService)
    const sameCodeNewBuild = !codeNewer && !!key;
    const available = codeNewer || sameCodeNewBuild;

    return {
      available,
      updateAvailable: available,
      remote,
      localVersion,
      localCode,
    };
  } catch {
    return { available: false, updateAvailable: false, localVersion, localCode };
  }
}

export type RemoteUpdate = UpdateInfo;

export type DownloadProgress = {
  percent: number;
  written: number;
  total: number;
};

export async function openApkInBrowser(apkUrl: string): Promise<void> {
  await Linking.openURL(apkUrl);
}

export async function downloadAndInstallApk(
  apkUrl: string,
  _onProgress?: (p: DownloadProgress) => void
): Promise<{ ok: boolean; error?: string; usedBrowser?: boolean }> {
  try {
    await Linking.openURL(apkUrl);
    return { ok: true, usedBrowser: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Update failed',
    };
  }
}

export function getLocalVersionLabel(): string {
  return `${currentVersionName()} (${currentVersionCode()})`;
}
