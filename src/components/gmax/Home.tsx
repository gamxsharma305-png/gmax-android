import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { searchAll } from "../../lib/gmax/search";
import type { Track } from "../../lib/gmax/types";
import { usePlayer } from "../../store/player";
import { useUi } from "../../store/ui";
import { TrackRow } from "./TrackRow";
import { colors } from "./theme";

const CHIPS = [
  "Punjabi",
  "Bollywood",
  "Phonk",
  "Lo-fi",
  "Hip Hop",
  "Sidhu Moose Wala",
  "Arijit Singh",
];

export function Home() {
  const playTrack = usePlayer((s) => s.playTrack);
  const current = usePlayer((s) => s.current);
  const openSettings = useUi((s) => s.openSettings);
  const setTab = useUi((s) => s.setTab);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await searchAll(q);
      setTracks(res.tracks);
    } catch {
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.logo}>GMAX</Text>
        <Pressable onPress={openSettings} hitSlop={12}>
          <Text style={styles.gear}>⚙</Text>
        </Pressable>
      </View>
      <Text style={styles.sub}>Search · Queue · Background audio</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        {CHIPS.map((c) => (
          <Pressable key={c} style={styles.chip} onPress={() => void load(c)}>
            <Text style={styles.chipText}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Pressable style={styles.searchHint} onPress={() => setTab("search")}>
        <Text style={styles.searchHintText}>Search songs, artists…</Text>
      </Pressable>

      {loading ? <ActivityIndicator color={colors.fg} style={{ marginTop: 24 }} /> : null}

      <ScrollView style={{ flex: 1 }}>
        {tracks.map((t) => (
          <TrackRow
            key={t.id}
            track={t}
            active={current?.id === t.id}
            onPress={() => void playTrack(t, { tracks, label: "Home" })}
          />
        ))}
        {!loading && !tracks.length ? (
          <Text style={styles.empty}>Tap a mood chip or open Search.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  logo: { color: colors.fg, fontSize: 28, fontWeight: "800", letterSpacing: 3 },
  gear: { color: colors.fg, fontSize: 22 },
  sub: { color: colors.muted, fontSize: 11, paddingHorizontal: 16, marginBottom: 12 },
  chips: { maxHeight: 44, marginBottom: 8 },
  chip: {
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { color: colors.fg, fontSize: 13 },
  searchHint: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchHintText: { color: colors.muted },
  empty: { color: colors.muted, textAlign: "center", marginTop: 40 },
});
