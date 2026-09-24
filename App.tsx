import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Shell } from "./src/components/gmax/Shell";

/**
 * GMAX native Android — structure mirrors gmax-website:
 * Shell → Home / Search / History / Library + MiniPlayer + NowPlaying + Settings
 * Playback via expo-av (background / lock-screen capable streams)
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Shell />
    </SafeAreaProvider>
  );
}
