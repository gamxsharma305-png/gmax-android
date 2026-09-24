import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { usePlayer } from "../../store/player";
import { useUi } from "../../store/ui";
import { colors } from "./theme";

export function MiniPlayer() {
  const current = usePlayer((s) => s.current);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const toggle = usePlayer((s) => s.toggle);
  const openNowPlaying = useUi((s) => s.openNowPlaying);

  if (!current) return null;

  return (
    <Pressable style={styles.bar} onPress={openNowPlaying}>
      {current.albumImageUrl ? (
        <Image source={{ uri: current.albumImageUrl }} style={styles.art} />
      ) : (
        <View style={[styles.art, { backgroundColor: colors.border }]} />
      )}
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={1}>{current.title}</Text>
        <Text style={styles.artist} numberOfLines={1}>{current.artist.name}</Text>
      </View>
      <Pressable style={styles.btn} onPress={() => toggle()} hitSlop={12}>
        <Text style={styles.btnText}>{isPlaying ? "⏸" : "▶"}</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#0a0c0e",
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  art: { width: 44, height: 44, borderRadius: 6 },
  meta: { flex: 1 },
  title: { color: colors.fg, fontWeight: "700", fontSize: 14 },
  artist: { color: colors.muted, fontSize: 11, marginTop: 2 },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.fg,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: colors.bg, fontSize: 16 },
});
