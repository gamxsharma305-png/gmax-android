import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import { COLORS, FONTS, SIZES } from '../constants/theme';
import { useLibrary } from '../hooks/useLibrary';
import { useSubscription } from '../hooks/useSubscription';
import {
  extractDeezerPlaylistId,
  extractYouTubePlaylistId,
  fetchDeezerPlaylistMeta,
  fetchYouTubePlaylist,
  resolveRowsToTracks,
} from '../services/PlaylistImportService';

type Source = 'youtube' | 'deezer';

export default function ImportUrlPlaylistScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const source = ((route.params as { source?: Source })?.source || 'youtube') as Source;
  const { createPlaylist, importPlaylist } = useLibrary();
  const { isPremium } = useSubscription();

  const [url, setUrl] = useState('');
  const [nameOverride, setNameOverride] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const title = source === 'youtube' ? 'Import from YouTube' : 'Import from Deezer';
  const placeholder =
    source === 'youtube'
      ? 'https://youtube.com/playlist?list=PLxxxx'
      : 'https://www.deezer.com/playlist/123456789';

  React.useEffect(() => {
    if (!isPremium) navigation.navigate('Paywall' as never);
  }, [isPremium, navigation]);

  const onImport = useCallback(async () => {
    if (!isPremium) {
      navigation.navigate('Paywall' as never);
      return;
    }
    if (running.current || busy) return;
    setError(null);
    setProgress(null);

    running.current = true;
    setBusy(true);
    try {
      if (source === 'youtube') {
        const id = extractYouTubePlaylistId(url);
        if (!id) throw new Error('Valid YouTube playlist link / list=ID chahiye');
        setProgress('YouTube playlist load ho rahi hai…');
        const link = url.includes('list=')
          ? url.trim()
          : `https://www.youtube.com/playlist?list=${id}`;
        try {
          const saved = await importPlaylist(link);
          setProgress(`Import done: ${saved?.name || 'playlist'}`);
        } catch {
          const pl = await fetchYouTubePlaylist(id);
          const name = nameOverride.trim() || pl.name;
          createPlaylist(name, pl.tracks);
          setProgress(`${pl.tracks.length} songs import ho gaye`);
        }
        setTimeout(() => navigation.goBack(), 900);
      } else {
        const id = extractDeezerPlaylistId(url);
        if (!id) throw new Error('Valid Deezer playlist link / ID chahiye');
        setProgress('Deezer playlist load…');
        const meta = await fetchDeezerPlaylistMeta(id);
        setProgress(`0 / ${meta.rows.length} match…`);
        const tracks = await resolveRowsToTracks(meta.rows, (done, total) => {
          setProgress(`${done} / ${total} match…`);
        });
        if (!tracks.length) throw new Error('Koi song match nahi hua');
        const name = nameOverride.trim() || meta.name;
        createPlaylist(name, tracks);
        setProgress(`${tracks.length} songs import ho gaye`);
        setTimeout(() => navigation.goBack(), 900);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
      setProgress(null);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [
    busy,
    createPlaylist,
    importPlaylist,
    isPremium,
    nameOverride,
    navigation,
    source,
    url,
  ]);

  const hint = useMemo(() => {
    if (source === 'youtube') {
      return 'Public YouTube / YouTube Music playlist link paste karo. Songs seedha playlist me add ho jayenge.';
    }
    return 'Public Deezer playlist link paste karo. Har song GMAX search se match hoga (thoda time lag sakta hai).';
  }, [source]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <ChevronLeft color={COLORS.text.primary} size={26} />
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.hint}>{hint}</Text>
        <Text style={styles.label}>Playlist link</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder={placeholder}
          placeholderTextColor={COLORS.text.muted}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
        <Text style={styles.label}>Name (optional)</Text>
        <TextInput
          style={styles.input}
          value={nameOverride}
          onChangeText={setNameOverride}
          placeholder="My playlist"
          placeholderTextColor={COLORS.text.muted}
          editable={!busy}
        />

        <TouchableOpacity
          style={[styles.btn, busy && { opacity: 0.6 }]}
          onPress={() => void onImport()}
          disabled={busy}
          activeOpacity={0.85}
        >
          {busy ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.btnText}>Import</Text>
          )}
        </TouchableOpacity>

        {progress ? <Text style={styles.progress}>{progress}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
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
    marginBottom: 8,
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
    backgroundColor: COLORS.accent.green,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { fontFamily: FONTS.bold, fontSize: 16, color: '#000' },
  progress: {
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
});
