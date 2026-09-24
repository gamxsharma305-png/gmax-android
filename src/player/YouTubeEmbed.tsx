import { useCallback, useRef } from "react";
import { StyleSheet, View } from "react-native";
import YoutubePlayer, { YoutubeIframeRef } from "react-native-youtube-iframe";

type Props = {
  videoId: string;
  playing: boolean;
  onEnded?: () => void;
  onPlayingChange?: (playing: boolean) => void;
  height?: number;
};

/**
 * Official YouTube embed. Works in-app; Android may pause when fully backgrounded
 * (YouTube policy). Saavn/Audius streams use expo-av for true lock-screen audio.
 */
export function YouTubeEmbed({
  videoId,
  playing,
  onEnded,
  onPlayingChange,
  height = 200,
}: Props) {
  const ref = useRef<YoutubeIframeRef>(null);

  const onStateChange = useCallback(
    (state: string) => {
      if (state === "ended") onEnded?.();
      if (state === "playing") onPlayingChange?.(true);
      if (state === "paused") onPlayingChange?.(false);
    },
    [onEnded, onPlayingChange],
  );

  return (
    <View style={[styles.wrap, { height }]}>
      <YoutubePlayer
        ref={ref}
        height={height}
        play={playing}
        videoId={videoId}
        onChangeState={onStateChange}
        webViewProps={{
          allowsInlineMediaPlayback: true,
          mediaPlaybackRequiresUserAction: false,
        }}
        initialPlayerParams={{
          controls: true,
          modestbranding: true,
          rel: false,
          preventFullScreen: false,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
  },
});
