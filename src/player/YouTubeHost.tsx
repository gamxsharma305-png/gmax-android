import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { youtubeController } from './youtubeController';

/**
 * Hidden 1×1 YouTube IFrame host. Must stay mounted while app runs.
 * Plays audio/video from YouTube for tracks with a video id.
 */
export function YouTubeHost() {
  const ref = useRef<WebView>(null);

  const html = useMemo(
    () => `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
<style>
  html,body{margin:0;padding:0;background:#000;overflow:hidden;width:100%;height:100%}
  #player{position:absolute;left:0;top:0;width:100%;height:100%}
</style>
</head>
<body>
<div id="player"></div>
<script>
  var player = null;
  var currentId = null;
  var poll = null;
  var wantPlay = false;

  function post(obj) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(obj));
    } catch (e) {}
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
          isLoaded: st === 1 || st === 2 || st === 3,
          position: player.getCurrentTime() || 0,
          duration: player.getDuration() || 0
        });
      } catch (e) {}
    }, 500);
  }

  function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 0,
        controls: 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        fs: 0,
        disablekb: 1,
        iv_load_policy: 3
      },
      events: {
        onReady: function () {
          post({ type: 'ready' });
          startPoll();
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
            position: player.getCurrentTime() || 0,
            duration: player.getDuration() || 0
          });
          if (st === 1 && !wantPlay) {
            try { player.pauseVideo(); } catch (err) {}
          }
        },
        onError: function (e) {
          post({ type: 'error', message: 'YouTube error ' + (e && e.data) });
        }
      }
    });
  }

  function handleCommand(cmd) {
    if (!cmd || !cmd.type) return;
    if (cmd.type === 'load') {
      currentId = cmd.videoId;
      wantPlay = !!cmd.autoPlay;
      if (!player || typeof player.loadVideoById !== 'function') {
        // API not ready yet — onReady will not auto-load; queue via RN retry
        return;
      }
      try {
        player.loadVideoById({ videoId: cmd.videoId, startSeconds: cmd.startAt || 0 });
        if (wantPlay) player.playVideo();
        else player.pauseVideo();
      } catch (e) {
        post({ type: 'error', message: String(e) });
      }
      return;
    }
    if (!player) return;
    try {
      if (cmd.type === 'play') { wantPlay = true; player.playVideo(); }
      if (cmd.type === 'pause') { wantPlay = false; player.pauseVideo(); }
      if (cmd.type === 'seek') player.seekTo(cmd.seconds || 0, true);
      if (cmd.type === 'stop') {
        wantPlay = false;
        currentId = null;
        player.stopVideo();
      }
    } catch (e) {}
  }

  document.addEventListener('message', function (e) {
    try { handleCommand(JSON.parse(e.data)); } catch (err) {}
  });
  window.addEventListener('message', function (e) {
    try { handleCommand(JSON.parse(e.data)); } catch (err) {}
  });

  // Load YT API
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
        source={{ html }}
        onMessage={onMessage}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        allowsFullscreenVideo={false}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        style={styles.webview}
        // Android: keep media playing related flags
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0.02,
    overflow: 'hidden',
    left: 0,
    top: 0,
    zIndex: -1,
  },
  webview: {
    width: 1,
    height: 1,
    backgroundColor: 'transparent',
  },
});
