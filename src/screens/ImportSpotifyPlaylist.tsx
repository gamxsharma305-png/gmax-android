import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useSubscription } from '../hooks/useSubscription';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { useLibrary } from '../hooks/useLibrary';
import {
  extractSpotifyPlaylistId,
  fetchSpotifyPlaylistViaApi,
  resolveRowsToTracks,
} from '../services/PlaylistImportService';

export default function ImportSpotifyPlaylistScreen() {
  const { isPremium } = useSubscription();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { createPlaylist } = useLibrary();

  React.useEffect(() => {
    if (!isPremium) navigation.navigate('Paywall' as never);
  }, [isPremium, navigation]);

  const [url, setUrl] = useState('');
  const [playlistName, setPlaylistName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const runningRef = useRef(false);

  const onImport = useCallback(async () => {
    if (!isPremium) {
      navigation.navigate('Paywall' as never);
      return;
    }
    if (runningRef.current || isImporting) return;

    const id = extractSpotifyPlaylistId(url);
    if (!id && !url.includes('spotify.com')) {
      setErrorMsg('Spotify playlist link paste karo (open.spotify.com/playlist/…)');
      return;
    }

    runningRef.current = true;
    setIsImporting(true);
    setErrorMsg(null);
    setStatusMsg('Spotify playlist load ho rahi hai…');

    try {
      const meta = await fetchSpotifyPlaylistViaApi(url.trim() || id!);
      if (!meta.rows.length) throw new Error('Playlist empty ya private hai');

      setStatusMsg(`0 / ${meta.rows.length} songs match…`);
      const tracks = await resolveRowsToTracks(meta.rows, (done, total) => {
        setStatusMsg(`${done} / ${total} songs match…`);
      });
      if (!tracks.length) throw new Error('Koi song GMAX pe match nahi hua');

      const name = playlistName.trim() || meta.name || 'Spotify Playlist';
      createPlaylist(name, tracks);
      setStatusMsg(`${tracks.length} songs import ho gaye ✓`);
      setTimeout(() => navigation.goBack(), 1000);
    } catch (e) {
      setStatusMsg(null);
      setErrorMsg(e instanceof Error ? e.message : 'Import failed');
    } finally {
      runningRef.current = false;
      setIsImporting(false);
    }
  }, [createPlaylist, isImporting, isPremium, navigation, playlistName, url]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <ChevronLeft color={COLORS.text.primary} size={26} />
        </TouchableOpacity>
        <Text style={styles.title}>Import from Spotify</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.hint}>
          Spotify app/web se playlist link copy karo aur yahan paste karo. CSV ki zaroorat nahi —
          songs automatically GMAX pe match ho jayenge.
        </Text>

        <Text style={styles.label}>Playlist link</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="https://open.spotify.com/playlist/…"
          placeholderTextColor={COLORS.text.muted}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isImporting}
        />

        <Text style={styles.label}>Name (optional)</Text>
        <TextInput
          style={styles.input}
          value={playlistName}
          onChangeText={setPlaylistName}
          placeholder="My Spotify mix"
          placeholderTextColor={COLORS.text.muted}
          editable={!isImporting}
        />

        <TouchableOpacity
          style={[styles.btn, isImporting && { opacity: 0.65 }]}
          onPress={() => void onImport()}
          disabled={isImporting}
          activeOpacity={0.85}
        >
          {isImporting ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.btnText}>Import playlist</Text>
          )}
        </TouchableOpacity>

        {statusMsg ? <Text style={styles.status}>{statusMsg}</Text> : null}
        {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

        <Text style={styles.note}>
          Public playlists best kaam karti hain. Private playlist ke liye Spotify se public
          karke try karo.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.md,
    paddingBottom: SIZES.md,
  },
  title: { fontFamily: FONTS.bold, fontSize: 17, color: COLORS.text.primary },
  body: { paddingHorizontal: SIZES.md, gap: 8 },
  hint: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.text.secondary,
    lineHeight: 19,
    marginBottom: 10,
  },
  label: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.text.muted,
    marginTop: 6,
  },
  input: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text.primary,
    fontFamily: FONTS.regular,
    fontSize: 14,
  },
  btn: {
    marginTop: 16,
    backgroundColor: '#1DB954',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { fontFamily: FONTS.bold, fontSize: 16, color: '#000' },
  status: {
    marginTop: 12,
    textAlign: 'center',
    color: COLORS.accent.green,
    fontFamily: FONTS.medium,
    fontSize: 13,
  },
  error: {
    marginTop: 12,
    textAlign: 'center',
    color: '#e07a5f',
    fontFamily: FONTS.medium,
    fontSize: 13,
  },
  note: {
    marginTop: 20,
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.muted,
    lineHeight: 17,
  },
});
