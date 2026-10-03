import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { PlayerProvider } from './src/hooks/usePlayer';
import { LibraryProvider } from './src/hooks/useLibrary';
import { COLORS } from './src/constants/theme';
import { GSplash } from './src/components/GSplash';
import { YouTubeHost } from './src/player/YouTubeHost';
import { UpdateModal } from './src/components/UpdateModal';
import { checkForUpdate, UpdateInfo } from './src/services/UpdateService';
import { getPlatformInfo, isNoteNativeAvailable } from './modules/note-native';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [updateRemote, setUpdateRemote] = useState<UpdateInfo | null>(null);
  const [localVersion, setLocalVersion] = useState('');
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync('#050707');

    if (__DEV__) {
      console.log(
        '[NoteNative] available:',
        isNoteNativeAvailable(),
        'getPlatformInfo():',
        getPlatformInfo()
      );
    }

    // Check update after short delay (don't block splash)
    const t = setTimeout(() => {
      void (async () => {
        const result = await checkForUpdate();
        setLocalVersion(`${result.localVersion} (${result.localCode})`);
        if (result.available && result.remote) {
          setUpdateRemote(result.remote);
          setShowUpdate(true);
        }
      })();
    }, 2500);
    return () => clearTimeout(t);
  }, []);

  return (
    <SafeAreaProvider>
      <LibraryProvider>
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
