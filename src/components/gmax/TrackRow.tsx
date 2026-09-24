import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { Track } from "../../lib/gmax/types";
import { colors } from "./theme";

type Props = {
  track: Track;
  active?: boolean;
  onPress: () => void;
};

export function TrackRow({ track, active, onPress }: Props) {
  return (
    <Pressable style={[styles.row, active && styles.active]} onPress={onPress}>
      {track.albumImageUrl ? (
        <Image source={{ uri: track.albumImageUrl }} style={styles.art} />
      ) : (
        <View style={[styles.art, styles.placeholder]} />
      )}
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={1}>{track.title}</Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artist.name} · {track.provider.toUpperCase()}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  active: { backgroundColor: colors.card },
  art: { width: 48, height: 48, borderRadius: 6 },
  placeholder: { backgroundColor: colors.border },
  meta: { flex: 1 },
  title: { color: colors.fg, fontSize: 15, fontWeight: "600" },
  artist: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
