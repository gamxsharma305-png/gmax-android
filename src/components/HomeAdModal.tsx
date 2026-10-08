import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
  Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, SIZES } from '../constants/theme';
import type { RemoteAdItem, RemoteAds } from '../services/RemoteConfigService';

type Props = {
  visible: boolean;
  ads: RemoteAds;
  onClose: () => void;
};

const { height: SCREEN_H } = Dimensions.get('window');

export function HomeAdModal({ visible, ads, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const items = useMemo(
    () => (ads.items || []).filter((a) => a?.id).slice(0, ads.maxAds || 2),
    [ads.items, ads.maxAds]
  );
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [canSkip, setCanSkip] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationGuess = 30;

  const current: RemoteAdItem | undefined = items[index];
  const skipRatio = typeof ads.skipAfterRatio === 'number' ? ads.skipAfterRatio : 0.5;

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    if (!visible || !current) return;
    setProgress(0);
    setCanSkip(false);
    clearTimer();
    const start = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const ratio = Math.min(1, elapsed / durationGuess);
      setProgress(ratio);
      if (ratio >= skipRatio) setCanSkip(true);
      if (ratio >= 1) {
        clearTimer();
        setCanSkip(true);
      }
    }, 250);
    return clearTimer;
  }, [visible, current?.id, skipRatio]);

  const goNextOrClose = useCallback(() => {
    if (index + 1 < items.length) {
      setIndex((i) => i + 1);
    } else {
      onClose();
    }
  }, [index, items.length, onClose]);

  const onSkip = useCallback(() => {
    if (!canSkip) return;
    goNextOrClose();
  }, [canSkip, goNextOrClose]);

  const onOpenLink = useCallback(async () => {
    const url = current?.linkUrl;
    if (!url || !url.startsWith('http')) return;
    try {
      await Linking.openURL(url);
    } catch {
      /* ok */
    }
  }, [current?.linkUrl]);

  if (!current) return null;

  const videoHtml = current.videoUrl
    ? `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<style>*{margin:0;padding:0;background:#000}html,body{width:100%;height:100%;overflow:hidden}
video{width:100%;height:100%;object-fit:contain;background:#000}</style></head>
<body><video id="v" playsinline autoplay muted controls
 src="${String(current.videoUrl).replace(/"/g, '')}"
 poster="${String(current.posterUrl || '').replace(/"/g, '')}"></video>
<script>
var v=document.getElementById('v');
v.muted=false;
v.play().catch(function(){v.muted=true;v.play().catch(function(){})});
</script></body></html>`
    : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12, maxHeight: SCREEN_H * 0.72 }]}>
          <Text style={styles.badge}>SPONSORED</Text>
          {!!current.title && <Text style={styles.title}>{current.title}</Text>}

          <View style={styles.videoBox}>
            {videoHtml ? (
              <WebView
                source={{ html: videoHtml }}
                style={styles.webview}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                scrollEnabled={false}
              />
            ) : current.posterUrl ? (
              <Image source={{ uri: current.posterUrl }} style={styles.poster} resizeMode="cover" />
            ) : (
              <View style={[styles.poster, styles.posterEmpty]}>
                <Text style={styles.posterEmptyText}>Ad</Text>
              </View>
            )}
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>

          {!!current.linkUrl && (
            <TouchableOpacity style={styles.linkBtn} onPress={() => void onOpenLink()} activeOpacity={0.85}>
              <Text style={styles.linkText}>{current.linkLabel || 'Link kholo'}</Text>
            </TouchableOpacity>
          )}

          <View style={styles.row}>
            <Text style={styles.counter}>
              {index + 1} / {items.length}
            </Text>
            <TouchableOpacity
              style={[styles.skipBtn, !canSkip && styles.skipDisabled]}
              onPress={onSkip}
              disabled={!canSkip}
              activeOpacity={0.85}
            >
              <Text style={styles.skipText}>
                {canSkip
                  ? index + 1 < items.length
                    ? 'Agla ad →'
                    : 'Band karo'
                  : `Cut ${Math.max(0, Math.ceil((skipRatio - progress) * durationGuess))}s`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surfaceRaised,
    borderTopLeftRadius: SIZES.radius.lg,
    borderTopRightRadius: SIZES.radius.lg,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingHorizontal: SIZES.lg,
    paddingTop: SIZES.md,
  },
  badge: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    letterSpacing: 1.5,
    color: COLORS.text.muted,
    marginBottom: 4,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.text.primary,
    marginBottom: 8,
  },
  videoBox: {
    width: '100%',
    height: SCREEN_H * 0.38,
    borderRadius: SIZES.radius.md,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  webview: { flex: 1, backgroundColor: '#000' },
  poster: { width: '100%', height: '100%' },
  posterEmpty: { alignItems: 'center', justifyContent: 'center' },
  posterEmptyText: { color: COLORS.text.muted, fontFamily: FONTS.medium },
  progressTrack: {
    height: 3,
    backgroundColor: COLORS.glassBorder,
    borderRadius: 2,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.accent.green,
  },
  linkBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: SIZES.radius.md,
    borderWidth: 1,
    borderColor: COLORS.accent.green,
    alignItems: 'center',
  },
  linkText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.accent.green,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  counter: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.muted,
  },
  skipBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: SIZES.radius.md,
    backgroundColor: COLORS.accent.green,
  },
  skipDisabled: { opacity: 0.45 },
  skipText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.background,
  },
});
