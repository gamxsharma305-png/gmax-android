import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { useEffect } from "react";

/** Production GMAX website — same UI, search, player, settings as the web app. */
const SITE_URL = "https://gmax-website-seven.vercel.app";

/** Keep media alive hints for the in-page player (website already has MediaSession). */
const INJECT = `
(function () {
  try {
    document.documentElement.style.background = '#050707';
    document.body && (document.body.style.background = '#050707');
    // Prefer autoplay policies for music
    var meta = document.createElement('meta');
    meta.name = 'mobile-web-app-capable';
    meta.content = 'yes';
    document.head && document.head.appendChild(meta);
  } catch (e) {}
  true;
})();
`;

export default function App() {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canGoBack = useRef(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack.current && webRef.current) {
        webRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  const onNav = useCallback((nav: WebViewNavigation) => {
    canGoBack.current = nav.canGoBack;
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor="#050707" />
      {error ? (
        <View style={styles.center}>
          <Text style={styles.err}>{error}</Text>
          <Text
            style={styles.retry}
            onPress={() => {
              setError(null);
              setLoading(true);
              webRef.current?.reload();
            }}
          >
            Tap to retry
          </Text>
        </View>
      ) : null}
      <WebView
        ref={webRef}
        source={{ uri: SITE_URL }}
        style={styles.web}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        mixedContentMode="always"
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        cacheEnabled
        startInLoadingState
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
        applicationNameForUserAgent="GMAX-Android"
        userAgent={
          Platform.OS === "android"
            ? "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 GMAX-Android"
            : undefined
        }
        injectedJavaScript={INJECT}
        onNavigationStateChange={onNav}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError("Could not load GMAX. Check internet and try again.");
        }}
        onHttpError={() => {
          setLoading(false);
          setError("Server error loading GMAX.");
        }}
        // Android: allow media in background as much as the system permits
        androidLayerType="hardware"
      />
      {loading && !error ? (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.loadingText}>Loading GMAX…</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050707" },
  web: { flex: 1, backgroundColor: "#050707" },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#050707",
  },
  loadingText: { color: "#9ca3af", marginTop: 12, fontSize: 14 },
  center: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#050707",
    padding: 24,
  },
  err: { color: "#f87171", textAlign: "center", marginBottom: 12 },
  retry: { color: "#fff", fontWeight: "700", textDecorationLine: "underline" },
});
