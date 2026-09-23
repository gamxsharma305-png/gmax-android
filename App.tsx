import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { searchMusic, type Track } from "./src/api/music";
import { playTrack, setupAudioMode, togglePlayPause, stopPlayback } from "./src/player/audio";

export default function App() {
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void setupAudioMode();
    return () => {
      void stopPlayback();
    };
  }, []);

  const onSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const list = await searchMusic(q);
      setTracks(list);
      if (!list.length) setError("No tracks found. Try another query.");
    } catch {
      setError("Search failed. Check network.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  const onPlay = useCallback(async (track: Track) => {
    setError(null);
    setCurrent(track);
    setPlaying(true);
    try {
      await playTrack(track, (st) => {
        if (!st.isLoaded) return;
        setPlaying(st.isPlaying);
        if (st.didJustFinish) setPlaying(false);
      });
    } catch {
      setPlaying(false);
      setError("Could not play this track.");
    }
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <Text style={styles.logo}>GMAX</Text>
      <Text style={styles.sub}>Native · Saavn + Audius · Background audio</Text>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Search songs…"
          placeholderTextColor="#6b7280"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={onSearch}
          returnKeyType="search"
        />
        <Pressable style={styles.btn} onPress={onSearch}>
          <Text style={styles.btnText}>Go</Text>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator color="#fff" style={{ marginTop: 24 }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={tracks}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingBottom: 120 }}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => void onPlay(item)}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={styles.art} />
            ) : (
              <View style={[styles.art, styles.artFallback]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {item.artist} · {item.provider}
              </Text>
            </View>
          </Pressable>
        )}
      />

      {current ? (
        <View style={styles.bar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {current.title}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {current.artist}
            </Text>
          </View>
          <Pressable
            style={styles.playBtn}
            onPress={() => void togglePlayPause().then(() => setPlaying((p) => !p))}
          >
            <Text style={styles.btnText}>{playing ? "Pause" : "Play"}</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050707", paddingHorizontal: 16 },
  logo: {
    marginTop: 12,
    fontSize: 28,
    fontWeight: "700",
    color: "#f0f0f0",
    letterSpacing: 4,
  },
  sub: { color: "#6b7280", fontSize: 12, marginBottom: 16 },
  searchRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  input: {
    flex: 1,
    backgroundColor: "#121212",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#222",
  },
  btn: {
    backgroundColor: "#f0f0f0",
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  btnText: { color: "#050707", fontWeight: "700" },
  error: { color: "#f87171", marginVertical: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1f1f1f",
  },
  art: { width: 48, height: 48, borderRadius: 6, backgroundColor: "#1a1a1a" },
  artFallback: { backgroundColor: "#222" },
  title: { color: "#f0f0f0", fontSize: 15, fontWeight: "600" },
  artist: { color: "#9ca3af", fontSize: 12, marginTop: 2 },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    paddingBottom: 28,
    backgroundColor: "#121212",
    borderTopWidth: 1,
    borderTopColor: "#222",
  },
  playBtn: {
    backgroundColor: "#f0f0f0",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
});
