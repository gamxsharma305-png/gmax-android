import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useUi } from "../../store/ui";
import { colors } from "./theme";

export function SettingsView() {
  const closeOverlay = useUi((s) => s.closeOverlay);

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable onPress={closeOverlay}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.heading}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={styles.section}>GMAX Native</Text>
        <Text style={styles.body}>
          Native Android port of the GMAX music app — Saavn, Audius, and YouTube
          with background audio via expo-av.
        </Text>
        <Text style={styles.section}>Playback</Text>
        <Text style={styles.body}>
          Streams play with lock-screen support. Set battery usage to Unrestricted
          for best background results.
        </Text>
        <Text style={styles.section}>Sources</Text>
        <Text style={styles.body}>JioSaavn · Audius · YouTube (audio stream)</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg, zIndex: 40 },
  top: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: { color: colors.fg, fontSize: 22 },
  heading: { color: colors.fg, fontSize: 18, fontWeight: "700" },
  section: { color: colors.fg, fontWeight: "700", fontSize: 14, marginTop: 8 },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
});
