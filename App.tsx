import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LibraryProvider } from './src/hooks/useLibrary';
import { ThemeProvider } from './src/theme/ThemeContext';
import { PlayerProvider } from './src/hooks/usePlayer';
import { RootNavigator } from './src/navigation/RootNavigator';
import { YouTubeHost } from './src/player/YouTubeHost';
import { GSplash } from './src/components/GSplash';
import { UpdateModal } from './src/components/UpdateModal';
import { COLORS } from './src/constants/theme';
import { checkForUpdate, UpdateInfo } from './src/services/UpdateService';
import Constants from 'expo-constants';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [showUpdate, setShowUpdate] = useState(false);
  const [updateRemote, setUpdateRemote] = useState<UpdateInfo | null>(null);
  const localVersion =
    Constants.expoConfig?.version ||
    Constants.nativeAppVersion ||
    '1.0.0';

  useEffect(() => {
    // After splash (~3.6s) so intro is not cut by update popup
    const t = setTimeout(() => {
      void (async () => {
        try {
          const result = await checkForUpdate();
          if (result.available && result.remote) {
            setUpdateRemote(result.remote);
            setShowUpdate(true);
          }
        } catch {
          // network / parse — silent
        }
      })();
    }, 4200);
    return () => clearTimeout(t);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LibraryProvider>
          <ThemeProvider>
            <PlayerProvider>
              <View style={styles.webWrapper}>
                <View style={styles.appContainer}>
                  <RootNavigator />
                  <YouTubeHost />
                  <StatusBar style="light" backgroundColor="#050707" />
                  {showSplash ? (
                    <GSplash minMs={3600} onDone={() => setShowSplash(false)} />
                  ) : null}
                  {updateRemote ? (
                    <UpdateModal
                      visible={showUpdate}
                      remote={updateRemote}
                      localVersion={localVersion}
                      onClose={() => setShowUpdate(false)}
                    />
                  ) : null}
                </View>
              </View>
            </PlayerProvider>
          </ThemeProvider>
        </LibraryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  webWrapper: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  appContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
