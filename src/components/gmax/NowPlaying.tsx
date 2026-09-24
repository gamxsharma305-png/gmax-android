import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { usePlayer } from "../../store/player";
import { useUi } from "../../store/ui";
import { colors } from "./theme";

function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function NowPlaying() {
  const current = usePlayer((s) => s.current);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const error = usePlayer((s) => s.error);
  const toggle = usePlayer((s) => s.toggle);
  const next = usePlayer((s) => s.next);
  const previous = usePlayer((s) => s.previous);
  const seek = usePlayer((s) => s.seek);
  const closeOverlay = useUi((s) => s.closeOverlay);

  if (!current) {
    return (
      <View style={styles.root}>
        <Pressable onPress={closeOverlay}><Text style={styles.back}>← Back</Text></Pressable>
        <Text style={styles.empty}>Nothing playing</Text>
      </View>
    );
  }

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <View style={styles.root}>
      <Pressable onPress={closeOverlay} style={styles.top}>
        <Text style={styles.back}>←</Text>
        <Text style={styles.topLabel}>Now Playing</Text>
        <View style={{ width: 24 }} />
      </Pressable>

      {current.albumImageUrl ? (
        <Image source={{ uri: current.albumImageUrl }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, { backgroundColor: colors.border }]} />
      )}

      <Text style={styles.title} numberOfLines={2}>{current.title}</Text>
      <Text style={styles.artist}>{current.artist.name}</Text>
      <Text style={styles.provider}>{current.provider.toUpperCase()}</Text>

      {error ? <Text style={styles.err}>{error}</Text> : null}

      <View style={styles.progressRow}>
        <Text style={styles.time}>{fmt(position)}</Text>
        <Pressable
          style={styles.bar}
          onPress={(e) => {
            const ratio = Math.min(1, Math.max(0, e.nativeEvent.locationX / 240));
            seek(ratio * duration);
          }}
        >
          <View style={[styles.fill, { width: `${progress * 100}%` as `${number}%` }]} />
        </Pressable>
        <Text style={styles.time}>{fmt(duration)}</Text>
      </View>

      <View style={styles.controls}>
        <Pressable onPress={previous}><Text style={styles.ctrl}>⏮</Text></Pressable>
        <Pressable style={styles.play} onPress={toggle}>
          <Text style={styles.playText}>{isPlaying ? "⏸" : "▶"}</Text>
        </Pressable>
        <Pressable onPress={next}><Text style={styles.ctrl}>⏭</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg, zIndex: 40, padding: 16 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  back: { color: colors.fg, fontSize: 22 },
  topLabel: { color: colors.muted, fontSize: 12, letterSpacing: 2 },
  cover: { width: "100%", aspectRatio: 1, borderRadius: 12, marginBottom: 20 },
  title: { color: colors.fg, fontSize: 22, fontWeight: "800", textAlign: "center" },
  artist: { color: colors.muted, fontSize: 15, textAlign: "center", marginTop: 6 },
  provider: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 4 },
  err: { color: colors.danger, textAlign: "center", marginTop: 8 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 24 },
  time: { color: colors.muted, fontSize: 11, width: 36 },
  bar: { flex: 1, height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: "hidden" },
  fill: { height: 4, backgroundColor: colors.fg },
  controls: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 36, marginTop: 28 },
  ctrl: { color: colors.fg, fontSize: 28 },
  play: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.fg,
    alignItems: "center", justifyContent: "center",
  },
  playText: { color: colors.bg, fontSize: 26 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 40 },
});
