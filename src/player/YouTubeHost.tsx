import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { youtubeController } from './youtubeController';

/**
 * Off-screen YouTube IFrame host.
 * Sized ≥ 200px (1×1 triggers error 153 on many Android WebViews).
 */
export function YouTubeHost() {
  const ref = useRef<WebView>(null);

  const html = useMemo(
    () => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
<style>
  html,body{margin:0;padding:0;background:#000;width:100%;height:100%;overflow:hidden}
  #player{width:100%;height:100%}
</style>
</head>
<body>
<div id="player"></div>
<script>
  var player = null;
  var currentId = null;
  var poll = null;
  var wantPlay = false;
  var apiReady = false;
  var pendingCmd = null;

  function post(obj) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(obj)); } catch (e) {}
  }

  function startPoll() {
    if (poll) return;
    poll = setInterval(function () {
      if (!player || typeof player.getPlayerState !== 'function') return;
      try {
        var st = player.getPlayerState();
        post({
          type: 'status',
          videoId: currentId,
          isPlaying: st === 1,
          isBuffering: st === 3,
          isLoaded: st === 1 || st === 2 || st === 3 || st === 5,
          position: player.getCurrentTime() || 0,
          duration: player.getDuration() || 0
        });
      } catch (e) {}
    }, 400);
  }

  function mapError(code) {
    // 2 invalid param, 5 HTML5, 100 not found, 101/150 embed blocked, 153 config/webview
    if (code === 101 || code === 150) return 'This video cannot be embedded.';
    if (code === 100) return 'Video not found on YouTube.';
    if (code === 153) return 'YouTube player blocked in WebView (153). Trying another source…';
    return 'YouTube error ' + code;
  }

  function onYouTubeIframeAPIReady() {
    apiReady = true;
    player = new YT.Player('player', {
      width: '100%',
      height: '100%',
      host: 'https://www.youtube-nocookie.com',
      playerVars: {
        autoplay: 0,
        controls: 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        fs: 0,
        disablekb: 1,
        iv_load_policy: 3,
        origin: 'https://www.youtube.com',
        enablejsapi: 1
      },
      events: {
        onReady: function () {
          post({ type: 'ready' });
          startPoll();
          if (pendingCmd) { handleCommand(pendingCmd); pendingCmd = null; }
        },
        onStateChange: function (e) {
          var st = e.data;
          if (st === 0) post({ type: 'ended' });
          post({
            type: 'status',
            videoId: currentId,
            isPlaying: st === 1,
            isBuffering: st === 3,
            isLoaded: true,
            position: (player && player.getCurrentTime) ? player.getCurrentTime() : 0,
            duration: (player && player.getDuration) ? player.getDuration() : 0
          });
        },
        onError: function (e) {
          var code = e && e.data;
          post({ type: 'error', code: code, message: mapError(code) });
        }
      }
    });
  }

  function handleCommand(cmd) {
    if (!cmd || !cmd.type) return;
    if (!apiReady || !player) {
      pendingCmd = cmd;
      return;
    }
    try {
      if (cmd.type === 'load') {
        currentId = cmd.videoId;
        wantPlay = !!cmd.autoPlay;
        if (typeof player.loadVideoById === 'function') {
          player.loadVideoById({ videoId: cmd.videoId, startSeconds: cmd.startAt || 0 });
          if (wantPlay) {
            setTimeout(function(){ try { player.playVideo(); } catch(e){} }, 300);
          }
        } else if (typeof player.cueVideoById === 'function') {
          player.cueVideoById({ videoId: cmd.videoId, startSeconds: cmd.startAt || 0 });
          if (wantPlay) setTimeout(function(){ try { player.playVideo(); } catch(e){} }, 400);
        }
        return;
      }
      if (cmd.type === 'play') { wantPlay = true; player.playVideo(); }
      if (cmd.type === 'pause') { wantPlay = false; player.pauseVideo(); }
      if (cmd.type === 'seek') player.seekTo(cmd.seconds || 0, true);
      if (cmd.type === 'stop') {
        wantPlay = false;
        currentId = null;
        try { player.stopVideo(); } catch (e) {}
      }
    } catch (e) {
      post({ type: 'error', message: String(e) });
    }
  }

  document.addEventListener('message', function (e) {
    try { handleCommand(JSON.parse(e.data)); } catch (err) {}
  });
  window.addEventListener('message', function (e) {
    try { handleCommand(JSON.parse(e.data)); } catch (err) {}
  });

  var tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
  window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
</script>
</body>
</html>`,
    []
  );

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    youtubeController.handleMessage(e.nativeEvent.data);
  }, []);

  useEffect(() => {
    youtubeController.attachSender((cmd) => {
      const js = `handleCommand(${JSON.stringify(cmd)}); true;`;
      ref.current?.injectJavaScript(js);
    });
    return () => youtubeController.detachSender();
  }, []);

  return (
    <View style={styles.host} pointerEvents="none">
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{
          html,
          baseUrl: 'https://www.youtube.com',
        }}
        onMessage={onMessage}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        allowsFullscreenVideo={false}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        userAgent={
          Platform.OS === 'android'
            ? 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
            : undefined
        }
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Must be large enough — 1×1 causes YouTube error 153 on Android WebView
  host: {
    position: 'absolute',
    width: 240,
    height: 135,
    left: -400,
    top: 0,
    opacity: 0.01,
    overflow: 'hidden',
    zIndex: -1,
  },
  webview: {
    width: 240,
    height: 135,
    backgroundColor: '#000',
  },
});
