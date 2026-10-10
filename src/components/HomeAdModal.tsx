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
  StatusBar,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { FONTS } from '../constants/theme';
import type { RemoteAdItem, RemoteAds } from '../services/RemoteConfigService';

type Props = {
  visible: boolean;
  ads: RemoteAds;
  onClose: () => void;
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/**
 * Full-screen ad — Google Play install-ad layout:
 * top thin progress bar · video fills screen · bottom brand + Install CTA
 */
export function HomeAdModal({ visible, ads, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const items = useMemo(
    () => (ads.items || []).filter((a) => a?.id && a.enabled !== false).slice(0, ads.maxAds || 2),
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
    if (!visible) {
      setIndex(0);
      return;
    }
  }, [visible]);

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
    }, 200);
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

  const brand = current.brandName || current.title || 'GMAX';
  const subtitle = current.subtitle || current.description || '';
  const cta = current.linkLabel || current.ctaLabel || 'Install';
  const iconUri = current.brandIcon || current.posterUrl;

  const videoHtml = current.videoUrl
    ? `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden}
video{width:100%;height:100%;object-fit:cover;background:#000}
</style></head>
<body>
<video id="v" playsinline webkit-playsinline autoplay muted
 src="${String(current.videoUrl).replace(/"/g, '')}"
 poster="${String(current.posterUrl || '').replace(/"/g, '')}"></video>
<script>
var v=document.getElementById('v');
function tryPlay(){v.play().catch(function(){v.muted=true;v.play().catch(function(){})})}
v.addEventListener('loadeddata',tryPlay);tryPlay();
</script></body></html>`
    : null;

  const skipLeft = Math.max(0, Math.ceil((skipRatio - progress) * durationGuess));

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={canSkip ? onClose : undefined}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.root}>
        {/* Full-bleed video */}
        <View style={styles.videoLayer}>
          {videoHtml ? (
            <WebView
              source={{ html: videoHtml }}
              style={styles.webview}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              scrollEnabled={false}
              allowsFullscreenVideo={false}
            />
          ) : current.posterUrl ? (
            <Image source={{ uri: current.posterUrl }} style={styles.poster} resizeMode="cover" />
          ) : (
            <View style={[styles.poster, styles.posterEmpty]}>
              <Text style={styles.posterEmptyText}>Ad</Text>
            </View>
          )}
        </View>

        {/* Top progress bar (Google-style yellow) */}
        <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          {canSkip ? (
            <TouchableOpacity style={styles.closeBtn} onPress={onSkip} hitSlop={12}>
              <X color="#fff" size={18} strokeWidth={2.5} />
            </TouchableOpacity>
          ) : (
            <View style={styles.skipTimer}>
              <Text style={styles.skipTimerText}>{skipLeft}s</Text>
            </View>
          )}
        </View>

        {/* Bottom gradient + install bar */}
        <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 14) + 8 }]}>
          {!!subtitle && (
            <Text style={styles.caption} numberOfLines={2}>
              {subtitle}
            </Text>
          )}

          <View style={styles.installRow}>
            <View style={styles.brandRow}>
              {iconUri ? (
                <Image source={{ uri: iconUri }} style={styles.brandIcon} />
              ) : (
                <View style={[styles.brandIcon, styles.brandIconFallback]}>
                  <Text style={styles.brandIconLetter}>{brand.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.brandText}>
                <Text style={styles.brandName} numberOfLines={1}>
                  {brand}
                </Text>
                <Text style={styles.brandMeta} numberOfLines={1}>
                  {current.storeLabel || 'Sponsored'}
                </Text>
              </View>
            </View>

            {!!current.linkUrl && (
              <TouchableOpacity style={styles.installBtn} onPress={() => void onOpenLink()} activeOpacity={0.88}>
                <Text style={styles.installText}>{cta}</Text>
              </TouchableOpacity>
            )}
          </View>

          {items.length > 1 && (
            <Text style={styles.counter}>
              {index + 1} / {items.length}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
    width: SCREEN_W,
    height: SCREEN_H,
  },
  videoLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
  },
  posterEmptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontFamily: FONTS.medium,
    fontSize: 16,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
    zIndex: 20,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#f5c518',
    borderRadius: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipTimer: {
    minWidth: 32,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  skipTimerText: {
    color: '#fff',
    fontFamily: FONTS.bold,
    fontSize: 12,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 48,
    backgroundColor: 'transparent',
    // soft fade over video
    borderTopWidth: 0,
    zIndex: 20,
  },
  caption: {
    color: '#fff',
    fontFamily: FONTS.medium,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  installRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(28,28,30,0.92)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 12,
  },
  brandRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  brandIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#2a2a2e',
  },
  brandIconFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandIconLetter: {
    color: '#fff',
    fontFamily: FONTS.bold,
    fontSize: 18,
  },
  brandText: {
    flex: 1,
    minWidth: 0,
  },
  brandName: {
    color: '#fff',
    fontFamily: FONTS.bold,
    fontSize: 15,
  },
  brandMeta: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: FONTS.regular,
    fontSize: 12,
    marginTop: 2,
  },
  installBtn: {
    backgroundColor: '#5b9cff',
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 22,
  },
  installText: {
    color: '#fff',
    fontFamily: FONTS.bold,
    fontSize: 14,
  },
  counter: {
    marginTop: 8,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.4)',
    fontFamily: FONTS.regular,
    fontSize: 11,
  },
});
