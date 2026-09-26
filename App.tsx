import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { PlayerProvider } from './src/hooks/usePlayer';
import { LibraryProvider } from './src/hooks/useLibrary';
import { COLORS } from './src/constants/theme';
import { GSplash } from './src/components/GSplash';
import { YouTubeHost } from './src/player/YouTubeHost';
import { getPlatformInfo, isNoteNativeAvailable } from './modules/note-native';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    if (__DEV__) {
      console.log(
        '[NoteNative] available:',
        isNoteNativeAvailable(),
        'getPlatformInfo():',
        getPlatformInfo()
      );
    }
  }, []);

  return (
    <SafeAreaProvider>
      <LibraryProvider>
        <PlayerProvider>
          <View style={styles.webWrapper}>
            <View style={styles.appContainer}>
              <RootNavigator />
              <YouTubeHost />
              <StatusBar style="light" />
              {showSplash ? <GSplash onDone={() => setShowSplash(false)} /> : null}
            </View>
          </View>
        </PlayerProvider>
      </LibraryProvider>
    </SafeAreaProvider>
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
