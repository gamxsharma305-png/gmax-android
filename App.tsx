import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { resolveYouTubeStream, searchMusic, type Track } from "./src/api/music";
import {
  getPosition,
  playStreamTrack,
  seekTo,
  setupAudioMode,
  stopPlayback,
  togglePlayPause,
} from "./src/player/audio";
import { YouTubeEmbed } from "./src/player/YouTubeEmbed";

function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function App() {
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  /** true = using expo-av stream (background OK); false = iframe fallback */
  const [ytStreamMode, setYtStreamMode] = useState(true);
  const queueRef = useRef<Track[]>([]);

  useEffect(() => {
    void setupAudioMode();
    return () => {
      void stopPlayback();
    };
  }, []);

  // Progress for any expo-av track (including YouTube audio stream)
  useEffect(() => {
    if (!current || !playing) return;
    if (current.provider === "youtube" && !ytStreamMode) return;
    const id = setInterval(() => {
      void getPosition().then((p) => {
        setPosition(p.position);
        if (p.duration > 0) setDuration(p.duration);
        setPlaying(p.playing);
      });
    }, 500);
    return () => clearInterval(id);
  }, [current, playing, ytStreamMode]);

  const onSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const list = await searchMusic(q);
      setTracks(list);
      queueRef.current = list;
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
    setPosition(0);
    setDuration(track.duration || 0);
    setPlaying(true);
    setYtStreamMode(true);

    await stopPlayback();

    // YouTube: resolve audio URL → expo-av (background). Embed only if resolve fails.
    if (track.provider === "youtube" && track.videoId) {
      try {
        const url = await resolveYouTubeStream(track.videoId);
        if (url) {
          setYtStreamMode(true);
          await playStreamTrack(
            { ...track, streamUrl: url },
            (st) => {
              if (!st.isLoaded) return;
              setPlaying(st.isPlaying);
              if (st.durationMillis) setDuration(st.durationMillis / 1000);
              if (st.positionMillis != null) setPosition(st.positionMillis / 1000);
              if (st.didJustFinish) {
                setPlaying(false);
                const q = queueRef.current;
                const i = q.findIndex((x) => x.id === track.id);
                if (i >= 0 && i < q.length - 1) void onPlay(q[i + 1]);
              }
            },
          );
          return;
        }
      } catch {
        /* fall through to embed */
      }
      setYtStreamMode(false);
      setPlaying(true);
      return;
    }

    try {
      await playStreamTrack(track, (st) => {
        if (!st.isLoaded) return;
        setPlaying(st.isPlaying);
        if (st.durationMillis) setDuration(st.durationMillis / 1000);
        if (st.positionMillis != null) setPosition(st.positionMillis / 1000);
        if (st.didJustFinish) {
          setPlaying(false);
          const q = queueRef.current;
          const i = q.findIndex((x) => x.id === track.id);
          if (i >= 0 && i < q.length - 1) void onPlay(q[i + 1]);
        }
      });
    } catch {
      setPlaying(false);
      setError("Could not play this track.");
    }
  }, []);

  const playNext = useCallback(() => {
    if (!current) return;
    const q = queueRef.current;
    const i = q.findIndex((t) => t.id === current.id);
    if (i >= 0 && i < q.length - 1) void onPlay(q[i + 1]);
  }, [current, onPlay]);

  const playPrev = useCallback(() => {
    if (!current) return;
    const q = queueRef.current;
    const i = q.findIndex((t) => t.id === current.id);
    if (i > 0) void onPlay(q[i - 1]);
  }, [current, onPlay]);

  const onToggle = useCallback(async () => {
    if (!current) return;
    if (current.provider === "youtube" && !ytStreamMode) {
      setPlaying((p) => !p);
      return;
    }
    try {
      const nowPlaying = await togglePlayPause();
      setPlaying(nowPlaying);
    } catch {
      setError("Playback control failed.");
    }
  }, [current, ytStreamMode]);

  const progress = useMemo(() => {
    if (!duration || duration <= 0) return 0;
    return Math.min(1, position / duration);
  }, [position, duration]);

  const providerBadge = (p: Track["provider"]) => {
    if (p === "youtube") return "YT";
    if (p === "saavn") return "SV";
    return "AU";
  };

  const showYtEmbed = current?.provider === "youtube" && current.videoId && !ytStreamMode;
  const showProgress =
    current && (current.provider !== "youtube" || ytStreamMode);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#050707" />
      <Text style={styles.logo}>GMAX</Text>
      <Text style={styles.sub}>Native · Saavn + Audius + YouTube BG · Lock-screen audio</Text>

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

      {loading ? <ActivityIndicator color="#fff" style={{ marginTop: 20 }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {showYtEmbed ? (
        <View style={styles.ytBox}>
          <YouTubeEmbed
            videoId={current!.videoId!}
            playing={playing}
            onEnded={() => {
              setPlaying(false);
              playNext();
            }}
            onPlayingChange={setPlaying}
            height={180}
          />
          <Text style={styles.ytHint}>Stream unavailable — embed mode (keep app open)</Text>
        </View>
      ) : null}

      <FlatList
        data={tracks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: current ? 160 : 24 }}
        style={{ flex: 1, marginTop: 8 }}
        renderItem={({ item }) => {
          const active = current?.id === item.id;
          return (
            <Pressable
              style={[styles.row, active && styles.rowActive]}
              onPress={() => void onPlay(item)}
            >
              {item.image ? (
                <Image source={{ uri: item.image }} style={styles.art} />
              ) : (
                <View style={[styles.art, styles.artPlaceholder]} />
              )}
              <View style={styles.meta}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.artist} numberOfLines={1}>
                  {item.artist}
                </Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{providerBadge(item.provider)}</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>Search Saavn, Audius & YouTube (YT plays in background).</Text>
          ) : null
        }
      />

      {current ? (
        <View style={styles.player}>
          <View style={styles.playerTop}>
            {current.image ? (
              <Image source={{ uri: current.image }} style={styles.playerArt} />
            ) : (
              <View style={[styles.playerArt, styles.artPlaceholder]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.playerTitle} numberOfLines={1}>
                {current.title}
              </Text>
              <Text style={styles.playerArtist} numberOfLines={1}>
                {current.artist} · {providerBadge(current.provider)}
                {current.provider === "youtube" && ytStreamMode ? " · BG" : ""}
              </Text>
            </View>
          </View>

          {showProgress ? (
            <View style={styles.progressRow}>
              <Text style={styles.time}>{fmt(position)}</Text>
              <Pressable
                style={styles.barTrack}
                onPress={(e) => {
                  const w = e.nativeEvent.locationX;
                  const ratio = Math.min(1, Math.max(0, w / 220));
                  const t = ratio * duration;
                  void seekTo(t);
                  setPosition(t);
                }}
              >
                <View style={[styles.barFill, { width: `${progress * 100}%` as `${number}%` }]} />
              </Pressable>
              <Text style={styles.time}>{fmt(duration)}</Text>
            </View>
          ) : (
            <Text style={styles.ytHint}>Embed mode — background limited</Text>
          )}

          <View style={styles.controls}>
            <Pressable style={styles.ctrlBtn} onPress={playPrev}>
              <Text style={styles.ctrlText}>⏮</Text>
            </Pressable>
            <Pressable style={styles.playBtn} onPress={() => void onToggle()}>
              <Text style={styles.playText}>{playing ? "⏸" : "▶"}</Text>
            </Pressable>
            <Pressable style={styles.ctrlBtn} onPress={playNext}>
              <Text style={styles.ctrlText}>⏭</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050707", paddingHorizontal: 16 },
  logo: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: 8,
  },
  sub: { color: "#6b7280", fontSize: 12, marginBottom: 12 },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    flex: 1,
    backgroundColor: "#121416",
    color: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  btn: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  btnText: { color: "#050707", fontWeight: "700" },
  error: { color: "#f87171", marginTop: 10, fontSize: 13 },
  empty: { color: "#6b7280", textAlign: "center", marginTop: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1f2937",
    gap: 12,
  },
  rowActive: { backgroundColor: "#0c1014" },
  art: { width: 48, height: 48, borderRadius: 8 },
  artPlaceholder: { backgroundColor: "#1f2937" },
  meta: { flex: 1 },
  title: { color: "#fff", fontSize: 15, fontWeight: "600" },
  artist: { color: "#9ca3af", fontSize: 12, marginTop: 2 },
  badge: {
    backgroundColor: "#1f2937",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: { color: "#9ca3af", fontSize: 10, fontWeight: "700" },
  ytBox: { marginTop: 12, marginBottom: 4 },
  player: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0a0c0e",
    borderTopWidth: 1,
    borderTopColor: "#1f2937",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
  },
  playerTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  playerArt: { width: 52, height: 52, borderRadius: 8 },
  playerTitle: { color: "#fff", fontWeight: "700", fontSize: 15 },
  playerArtist: { color: "#9ca3af", fontSize: 12, marginTop: 2 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  time: { color: "#6b7280", fontSize: 11, width: 36 },
  barTrack: {
    flex: 1,
    height: 4,
    backgroundColor: "#1f2937",
    borderRadius: 2,
    overflow: "hidden",
  },
  barFill: { height: 4, backgroundColor: "#fff" },
  ytHint: { color: "#6b7280", fontSize: 11, marginBottom: 8 },
  controls: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 28,
  },
  ctrlBtn: { padding: 8 },
  ctrlText: { color: "#fff", fontSize: 22 },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  playText: { color: "#050707", fontSize: 22 },
});
