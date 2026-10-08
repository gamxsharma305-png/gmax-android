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
  openApkInBrowser,
  markUpdateApplied,
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
    try {
      await openApkInBrowser(remote.apkUrl);
      await markUpdateApplied(remote);
      setHint(
        'Browser me APK download ho raha hai.\nDownload khatam → Files/Downloads se open → Install.'
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Browser open nahi hua');
    } finally {
      setBusy(false);
    }
  }, [remote]);

  const onBrowser = useCallback(async () => {
    if (!remote.apkUrl) return;
    setErr(null);
    try {
      await openApkInBrowser(remote.apkUrl);
      await markUpdateApplied(remote);
      setHint('Browser me download → file open → Install.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not open link');
    }
  }, [remote]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { marginBottom: insets.bottom + 16 }]}>
          <Text style={styles.badge}>UPDATE</Text>
          <Text style={styles.title}>Naya update available</Text>
          <Text style={styles.sub}>
            {`Version ${remote.version} ready.\nAapka version: ${localVersion}`}
          </Text>
          {!!remote.notes && <Text style={styles.notes}>{remote.notes}</Text>}

          {busy && (
            <View style={styles.progressRow}>
              <ActivityIndicator color={COLORS.accent.green} />
              <Text style={styles.progressText}>Browser khol rahe hain…</Text>
            </View>
          )}

          {!!err && <Text style={styles.err}>{err}</Text>}
          {!!hint && <Text style={styles.hint}>{hint}</Text>}

          <TouchableOpacity
            style={[styles.primary, busy && styles.disabled]}
            disabled={busy}
            onPress={() => {
              void onUpdate();
            }}
          >
            <Text style={styles.primaryText}>
              {busy ? 'Opening…' : 'Update now'}
            </Text>
          </TouchableOpacity>

          {!!remote.apkUrl && (
            <TouchableOpacity
              style={styles.browserBtn}
              disabled={busy}
              onPress={() => {
                void onBrowser();
              }}
            >
              <Text style={styles.browserText}>Browser me open</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.secondary}
            disabled={busy}
            onPress={() => {
              void markUpdateApplied(remote).then(() => onClose());
            }}
          >
            <Text style={styles.secondaryText}>Pehle se update ho chuka hai</Text>
          </TouchableOpacity>
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
