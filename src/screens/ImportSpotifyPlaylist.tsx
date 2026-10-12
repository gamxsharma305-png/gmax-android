import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ExternalLink, Link2, FileText } from 'lucide-react-native';
import { useSubscription } from '../hooks/useSubscription';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { Track } from '../core/types';
import { useLibrary } from '../hooks/useLibrary';
import { MusicService } from '../services/MusicService';
import { extractSpotifyTracks, SpotifyCsvRow } from '../utils/spotifyCsv';
import {
  extractSpotifyPlaylistId,
  fetchSpotifyPlaylistViaApi,
  resolveRowsToTracks,
} from '../services/PlaylistImportService';

const CHOSIC_URL = 'https://www.chosic.com/spotify-playlist-exporter/';
const BATCH_SIZE = 6;
const BATCH_PAUSE_MS = 200;

type Mode = 'link' | 'csv';

export default function ImportSpotifyPlaylistScreen() {
  const { isPremium } = useSubscription();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { createPlaylist } = useLibrary();

  React.useEffect(() => {
    if (!isPremium) navigation.navigate('Paywall' as never);
  }, [isPremium, navigation]);

  const [mode, setMode] = useState<Mode>('link');
  const [url, setUrl] = useState('');
  const [playlistName, setPlaylistName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const runningRef = useRef(false);

  const searchOne = async (row: SpotifyCsvRow): Promise<Track | null> => {
    const q = `${row.title} ${row.artist}`.trim();
    if (!q) return null;
    try {
      const results = await MusicService.search(q, { filter: 'Songs', limit: 6 });
      const tracks = results.tracks || [];
      const yt = tracks.find((t) => t.provider === 'youtube' && t.sourceId);
      return yt || tracks[0] || null;
    } catch {
      return null;
    }
  };

  const searchBatch = async (
    rows: SpotifyCsvRow[],
    onProgress: (n: number) => void
  ): Promise<{ found: Map<number, Track>; missing: SpotifyCsvRow[] }> => {
    const found = new Map<number, Track>();
    const missing: SpotifyCsvRow[] = [];
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (row) => {
          const track = await searchOne(row);
          return { row, track };
        })
      );
      for (const { row, track } of results) {
        if (track) found.set(row.index, track);
        else missing.push(row);
      }
      onProgress(results.length);
      if (i + BATCH_SIZE < rows.length) {
        await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
      }
    }
    return { found, missing };
  };

  const onImportLink = useCallback(async () => {
    const id = extractSpotifyPlaylistId(url);
    if (!id && !url.includes('spotify.com')) {
      setErrorMsg('Spotify playlist link paste karo (open.spotify.com/playlist/…)');
      return;
    }
    setStatusMsg('Spotify playlist load ho rahi hai…');
    const meta = await fetchSpotifyPlaylistViaApi(url.trim() || id!);
    if (!meta.rows.length) throw new Error('Playlist empty ya private hai');
    setTotal(meta.rows.length);
    setProcessed(0);
    setStatusMsg(`0 / ${meta.rows.length} songs match…`);
    const tracks = await resolveRowsToTracks(meta.rows, (done, tot) => {
      setProcessed(done);
      setTotal(tot);
      setStatusMsg(`${done} / ${tot} songs match…`);
    });
    if (!tracks.length) throw new Error('Koi song GMAX pe match nahi hua');
    const name = playlistName.trim() || meta.name || 'Spotify Playlist';
    createPlaylist(name, tracks);
    setStatusMsg(`${tracks.length} songs import ho gaye ✓`);
  }, [createPlaylist, playlistName, url]);

  const onImportCsv = useCallback(async () => {
    const name = playlistName.trim() || 'Imported Spotify playlist';
    const { rows, error } = extractSpotifyTracks(csvText);
    if (error || !rows.length) throw new Error(error || 'No songs in CSV');
    setProcessed(0);
    setTotal(rows.length);
    const first = await searchBatch(rows, (n) => setProcessed((p) => p + n));
    let foundMap = first.found;
    let missing = first.missing;
    if (missing.length > 0) {
      setTotal((t) => t + missing.length);
      const retry = await searchBatch(missing, (n) => setProcessed((p) => p + n));
      foundMap = new Map([...foundMap, ...retry.found]);
      missing = retry.missing;
    }
    const ordered: Track[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const t = foundMap.get(row.index);
      if (!t) continue;
      const key = `${t.provider}:${t.sourceId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push(t);
    }
    if (!ordered.length) throw new Error('No YouTube matches found. Try again later.');
    createPlaylist(name, ordered);
    const missNote = missing.length > 0 ? ` · ${missing.length} not found` : '';
    setStatusMsg(`Created "${name}" with ${ordered.length}/${rows.length} songs${missNote}`);
    setCsvText('');
  }, [createPlaylist, csvText, playlistName]);

  const onImport = useCallback(async () => {
    if (!isPremium) {
      navigation.navigate('Paywall' as never);
      return;
    }
    if (runningRef.current || isImporting) return;
    runningRef.current = true;
    setIsImporting(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      if (mode === 'link') await onImportLink();
      else await onImportCsv();
      setTimeout(() => navigation.goBack(), 1100);
    } catch (e) {
      setStatusMsg(null);
      setErrorMsg(e instanceof Error ? e.message : 'Import failed');
    } finally {
      runningRef.current = false;
      setIsImporting(false);
    }
  }, [isImporting, isPremium, mode, navigation, onImportCsv, onImportLink]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <ChevronLeft color={COLORS.text.primary} size={26} />
        </TouchableOpacity>
        <Text style={styles.title}>Import from Spotify</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: SIZES.md,
          paddingBottom: insets.bottom + 40,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, mode === 'link' && styles.tabActive]}
            onPress={() => {
              if (!isImporting) {
                setMode('link');
                setErrorMsg(null);
                setStatusMsg(null);
              }
            }}
            activeOpacity={0.85}
          >
            <Link2 color={mode === 'link' ? '#000' : COLORS.text.secondary} size={16} />
            <Text style={[styles.tabText, mode === 'link' && styles.tabTextActive]}>
              Playlist link
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'csv' && styles.tabActive]}
            onPress={() => {
              if (!isImporting) {
                setMode('csv');
                setErrorMsg(null);
                setStatusMsg(null);
              }
            }}
            activeOpacity={0.85}
          >
            <FileText color={mode === 'csv' ? '#000' : COLORS.text.secondary} size={16} />
            <Text style={[styles.tabText, mode === 'csv' && styles.tabTextActive]}>
              CSV (old)
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          {mode === 'link'
            ? 'Spotify se playlist link copy karke paste karo. CSV ki zaroorat nahi.'
            : 'Chosic se CSV download → saara text copy → neeche paste. Purana method.'}
        </Text>

        <Text style={styles.label}>Playlist name (optional)</Text>
        <TextInput
          style={styles.input}
          value={playlistName}
          onChangeText={setPlaylistName}
          placeholder="My Spotify mix"
          placeholderTextColor={COLORS.text.muted}
          editable={!isImporting}
        />

        {mode === 'link' ? (
          <>
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
          </>
        ) : (
          <>
            <TouchableOpacity
              style={styles.outlineBtn}
              onPress={() => Linking.openURL(CHOSIC_URL).catch(() => undefined)}
              activeOpacity={0.85}
            >
              <ExternalLink color={COLORS.accent.green} size={18} />
              <Text style={styles.outlineBtnText}>Open Chosic Spotify exporter</Text>
            </TouchableOpacity>
            <Text style={styles.label}>Paste CSV</Text>
            <TextInput
              style={[styles.input, styles.csvInput]}
              value={csvText}
              onChangeText={setCsvText}
              editable={!isImporting}
              multiline
              textAlignVertical="top"
              placeholder={'Song,Artist,...\nShape of You,Ed Sheeran'}
              placeholderTextColor={COLORS.text.muted}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </>
        )}

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

        {isImporting && total > 0 ? (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, Math.round((processed / total) * 100))}%` },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {processed} / {total}
            </Text>
          </View>
        ) : null}

        {statusMsg ? <Text style={styles.status}>{statusMsg}</Text> : null}
        {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

        <Text style={styles.note}>
          Public playlists best kaam karti hain. Link method fail ho to CSV tab try karo.
        </Text>
      </ScrollView>
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
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  tabActive: { backgroundColor: '#1DB954', borderColor: '#1DB954' },
  tabText: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.text.secondary },
  tabTextActive: { color: '#000', fontFamily: FONTS.bold },
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
    marginTop: 8,
    marginBottom: 6,
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
  csvInput: { minHeight: 150, maxHeight: 220, fontSize: 12 },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: SIZES.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.surfaceRaised,
    marginBottom: 4,
  },
  outlineBtnText: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.text.primary },
  btn: {
    marginTop: 16,
    backgroundColor: '#1DB954',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { fontFamily: FONTS.bold, fontSize: 16, color: '#000' },
  progressWrap: { marginTop: 12 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.surfaceLight,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: COLORS.accent.green },
  progressText: {
    marginTop: 6,
    textAlign: 'center',
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
  },
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
