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
import { checkForUpdate, RemoteUpdate } from './src/services/UpdateService';
import Constants from 'expo-constants';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [showUpdate, setShowUpdate] = useState(false);
  const [updateRemote, setUpdateRemote] = useState<RemoteUpdate | null>(null);
  const localVersion =
    Constants.expoConfig?.version ||
    Constants.nativeAppVersion ||
    '1.0.0';

  useEffect(() => {
    const t = setTimeout(() => {
      void (async () => {
        const result = await checkForUpdate(localVersion);
        if (result.updateAvailable && result.remote) {
          setUpdateRemote(result.remote);
          setShowUpdate(true);
        }
      })();
    }, 2500);
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
                  {showSplash ? <GSplash onDone={() => setShowSplash(false)} /> : null}
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
