/**
 * Self-hosted in-app updates (sideload APK).
 * Version name/code stay frozen at 1.2.4 / 39 for install safety.
 * Primary: gmax-premium-api /api/app-update (no APK rebuild to change link).
 * Fallback: GitHub update.json
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
  buildId?: string;
};

const UPDATE_MANIFEST_URL =
  'https://raw.githubusercontent.com/gamxsharma305-png/gmax-android/main/update.json';

const UPDATE_API_URL = 'https://gmax-premium-api.vercel.app/api/app-update';

const STORAGE_APPLIED = 'gmax_update_applied_key';

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
    let remote: UpdateInfo | null = null;

    try {
      const apiRes = await fetch(`${UPDATE_API_URL}?t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (apiRes.ok) {
        remote = (await apiRes.json()) as UpdateInfo;
      }
    } catch {
      /* fall through */
    }

    if (!remote || !(remote.apkUrl && String(remote.apkUrl).startsWith('http'))) {
      const res = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });
      if (!res.ok) {
        return { available: false, updateAvailable: false, localVersion, localCode };
      }
      remote = (await res.json()) as UpdateInfo;
    }

    if (!remote) {
      return { available: false, updateAvailable: false, localVersion, localCode };
    }

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

    const codeNewer = remoteCode > localCode;
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
