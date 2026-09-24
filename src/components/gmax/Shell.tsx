import { Pressable, StyleSheet, Text, View } from "react-native";
import { useUi, type TabId } from "../../store/ui";
import { Home } from "./Home";
import { SearchView } from "./SearchView";
import { HistoryView } from "./HistoryView";
import { LibraryView } from "./LibraryView";
import { MiniPlayer } from "./MiniPlayer";
import { NowPlaying } from "./NowPlaying";
import { SettingsView } from "./SettingsView";
import { colors } from "./theme";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "search", label: "Search", icon: "⌕" },
  { id: "history", label: "History", icon: "◷" },
  { id: "library", label: "Library", icon: "☰" },
];

export function Shell() {
  const tab = useUi((s) => s.tab);
  const overlay = useUi((s) => s.overlay);
  const setTab = useUi((s) => s.setTab);

  return (
    <View style={styles.root}>
      <View style={styles.body}>
        {tab === "home" ? <Home /> : null}
        {tab === "search" ? <SearchView /> : null}
        {tab === "history" ? <HistoryView /> : null}
        {tab === "library" ? <LibraryView /> : null}
      </View>

      <MiniPlayer />

      <View style={styles.tabs}>
        {TABS.map(({ id, label, icon }) => {
          const active = tab === id;
          return (
            <Pressable key={id} style={styles.tab} onPress={() => setTab(id)}>
              <Text style={[styles.tabIcon, active && styles.tabActive]}>{icon}</Text>
              <Text style={[styles.tabLabel, active && styles.tabActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {overlay === "nowplaying" ? <NowPlaying /> : null}
      {overlay === "settings" ? <SettingsView /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  tabs: {
    height: 64,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  tabIcon: { color: colors.muted, fontSize: 18 },
  tabLabel: { color: colors.muted, fontSize: 10 },
  tabActive: { color: colors.fg },
});
