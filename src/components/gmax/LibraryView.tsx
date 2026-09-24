import { StyleSheet, Text, View } from "react-native";
import { colors } from "./theme";

export function LibraryView() {
  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Library</Text>
      <Text style={styles.sub}>Playlists & likes — structure matches the website.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  heading: { color: colors.fg, fontSize: 24, fontWeight: "800" },
  sub: { color: colors.muted, marginTop: 12 },
});
