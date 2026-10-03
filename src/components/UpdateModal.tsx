import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, SIZES } from '../constants/theme';
import {
  UpdateInfo,
  downloadAndInstallApk,
  openApkInBrowser,
} from '../services/UpdateService';

type Props = {
  visible: boolean;
  remote: UpdateInfo;
  localVersion: string;
  onClose: () => void;
};

export function UpdateModal({ visible, remote, localVersion, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const onUpdate = useCallback(async () => {
    if (!remote.apkUrl) {
      setErr('APK link missing');
      return;
    }
    setBusy(true);
    setErr(null);
    setHint(null);
    setPercent(0);
    const result = await downloadAndInstallApk(remote.apkUrl, (p) => setPercent(p.percent));
    setBusy(false);
    if (!result.ok) {
      setErr(result.error || 'Update failed');
      return;
    }
    if (result.usedBrowser) {
      setHint(
        'Browser/Downloads me APK open hua. Install → Allow unknown apps → Install.'
      );
    } else {
      setHint('Install screen open hona chahiye. Agar error aaye to neeche Browser use karo.');
    }
  }, [remote.apkUrl]);

  const onBrowser = useCallback(async () => {
    if (!remote.apkUrl) return;
    setErr(null);
    try {
      await openApkInBrowser(remote.apkUrl);
      setHint('Browser me download → file open → Install.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not open link');
    }
  }, [remote.apkUrl]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { marginBottom: insets.bottom + 16 }]}>
          <Text style={styles.badge}>UPDATE</Text>
          <Text style={styles.title}>Please update</Text>
          <Text style={styles.sub}>
            {`New version ${remote.version} available.\nYou have ${localVersion}.`}
          </Text>
          {!!remote.notes && <Text style={styles.notes}>{remote.notes}</Text>}

          {busy && (
            <View style={styles.progressRow}>
              <ActivityIndicator color={COLORS.accent.green} />
              <Text style={styles.progressText}>Downloading… {percent}%</Text>
            </View>
          )}

          {err ? <Text style={styles.err}>{err}</Text> : null}
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}

          <TouchableOpacity
            style={[styles.primary, busy && styles.disabled]}
            onPress={() => void onUpdate()}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryText}>{busy ? 'Please wait…' : 'Update now'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.browserBtn, busy && styles.disabled]}
            onPress={() => void onBrowser()}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Text style={styles.browserText}>Open in browser (if install fails)</Text>
          </TouchableOpacity>

          {!remote.force && (
            <TouchableOpacity style={styles.secondary} onPress={onClose} disabled={busy}>
              <Text style={styles.secondaryText}>Later</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    paddingHorizontal: SIZES.lg,
  },
  card: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: SIZES.radius.lg,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    padding: SIZES.lg,
  },
  badge: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    letterSpacing: 2,
    color: COLORS.accent.green,
    marginBottom: 8,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.text.primary,
    marginBottom: 8,
  },
  sub: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.secondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  notes: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.text.muted,
    marginBottom: 12,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  progressText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.text.secondary,
  },
  err: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#e07a5f',
    marginBottom: 10,
  },
  hint: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.accent.green,
    marginBottom: 10,
    lineHeight: 18,
  },
  primary: {
    backgroundColor: COLORS.accent.green,
    borderRadius: SIZES.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  disabled: { opacity: 0.7 },
  primaryText: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.background,
  },
  browserBtn: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: SIZES.radius.md,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  browserText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.text.secondary,
  },
  secondary: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.text.secondary,
  },
});
