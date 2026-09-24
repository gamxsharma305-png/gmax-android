import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { searchAll } from "../../lib/gmax/search";
import type { Track } from "../../lib/gmax/types";
import { usePlayer } from "../../store/player";
import { TrackRow } from "./TrackRow";
import { colors } from "./theme";

export function SearchView() {
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playTrack = usePlayer((s) => s.playTrack);
  const current = usePlayer((s) => s.current);

  const onSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const res = await searchAll(q);
      setTracks(res.tracks);
      if (!res.tracks.length) setError("No tracks found.");
    } catch {
      setError("Search failed. Check network.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Search</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="Songs, artists…"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={onSearch}
          returnKeyType="search"
        />
        <Pressable style={styles.btn} onPress={onSearch}>
          <Text style={styles.btnText}>Go</Text>
        </Pressable>
      </View>
      {loading ? <ActivityIndicator color={colors.fg} style={{ marginTop: 16 }} /> : null}
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <FlatList
        data={tracks}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <TrackRow
            track={item}
            active={current?.id === item.id}
            onPress={() => void playTrack(item, { tracks, label: "Search" })}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  heading: {
    color: colors.fg,
    fontSize: 24,
    fontWeight: "800",
    paddingHorizontal: 16,
    paddingTop: 8,
    marginBottom: 12,
  },
  row: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    color: colors.fg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btn: {
    backgroundColor: colors.fg,
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  btnText: { color: colors.bg, fontWeight: "700" },
  err: { color: colors.danger, paddingHorizontal: 16, marginBottom: 8 },
});
