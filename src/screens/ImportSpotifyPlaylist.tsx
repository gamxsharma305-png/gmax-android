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
import { ChevronLeft, ExternalLink, Upload } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { Track } from '../core/types';
import { useLibrary } from '../hooks/useLibrary';
import { MusicService } from '../services/MusicService';
import { extractSpotifyTracks, SpotifyCsvRow } from '../utils/spotifyCsv';

const CHOSIC_URL = 'https://www.chosic.com/spotify-playlist-exporter/';
const BATCH_SIZE = 6;
const BATCH_PAUSE_MS = 200;

export default function ImportSpotifyPlaylistScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { createPlaylist } = useLibrary();

  const [playlistName, setPlaylistName] = useState('Imported Spotify playlist');
  const [csvText, setCsvText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const runningRef = useRef(false);

  const openChosic = useCallback(() => {
    Linking.openURL(CHOSIC_URL).catch(() => undefined);
  }, []);

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

  const onImport = useCallback(async () => {
    if (runningRef.current || isImporting) return;
    setErrorMsg(null);
    setStatusMsg(null);

    const name = playlistName.trim();
    if (!name) {
      setErrorMsg('Enter a playlist name');
      return;
    }
    const { rows, error } = extractSpotifyTracks(csvText);
    if (error || !rows.length) {
      setErrorMsg(error || 'No songs in CSV');
      return;
    }

    runningRef.current = true;
    setIsImporting(true);
    setProcessed(0);
    setTotal(rows.length);

    try {
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

      if (!ordered.length) {
        setErrorMsg('No YouTube matches found. Try again later.');
        return;
      }

      const playlist = createPlaylist(name, ordered);
      const missNote =
        missing.length > 0 ? ` · ${missing.length} not found` : '';
      setStatusMsg(
        `Created “${playlist.name}” with ${ordered.length}/${rows.length} songs${missNote}`
      );
      setCsvText('');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Import failed');
    } finally {
      runningRef.current = false;
      setIsImporting(false);
    }
  }, [csvText, playlistName, isImporting, createPlaylist]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + SIZES.sm }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ChevronLeft color={COLORS.text.primary} size={26} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Import Spotify</Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: SIZES.md,
          paddingBottom: insets.bottom + 120,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.instructions}>
          1. Open Chosic exporter → paste your Spotify playlist link → download CSV{'\n'}
          2. Open the CSV, copy all text, paste below{'\n'}
          3. Name your playlist → Import. GMAX searches YouTube and saves under My Playlists.
        </Text>

        <TouchableOpacity style={styles.outlineBtn} onPress={openChosic} activeOpacity={0.85}>
          <ExternalLink color={COLORS.accent.green} size={18} />
          <Text style={styles.outlineBtnText}>Open Chosic Spotify exporter</Text>
        </TouchableOpacity>

        <Text style={styles.fieldLabel}>PLAYLIST NAME *</Text>
        <TextInput
          style={styles.input}
          value={playlistName}
          onChangeText={setPlaylistName}
          editable={!isImporting}
          placeholder="My Spotify playlist"
          placeholderTextColor={COLORS.text.muted}
        />

        <Text style={[styles.fieldLabel, { marginTop: SIZES.md }]}>PASTE CSV</Text>
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

        <TouchableOpacity
          style={[styles.primaryBtn, isImporting && styles.primaryBtnDisabled]}
          onPress={onImport}
          disabled={isImporting}
          activeOpacity={0.85}
        >
          {isImporting ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Upload color="#000" size={18} />
          )}
          <Text style={styles.primaryBtnText}>
            {isImporting ? 'Importing…' : 'Import playlist'}
          </Text>
        </TouchableOpacity>

        {isImporting && total > 0 && (
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
              {processed} / {total} songs
            </Text>
          </View>
        )}

        {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
        {statusMsg ? <Text style={styles.successText}>{statusMsg}</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    paddingHorizontal: SIZES.md,
    paddingBottom: SIZES.md,
  },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FONTS.bold, fontSize: 22, color: COLORS.text.primary },
  instructions: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.text.secondary,
    marginBottom: SIZES.md,
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: SIZES.md,
    borderRadius: SIZES.radius.md,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.surfaceRaised,
    marginBottom: SIZES.lg,
  },
  outlineBtnText: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.text.primary,
  },
  fieldLabel: {
    fontFamily: FONTS.regular,
    fontSize: 10,
    letterSpacing: 2,
    color: COLORS.text.muted,
    marginBottom: SIZES.sm,
  },
  input: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.text.primary,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: SIZES.radius.sm,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm + 4,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  csvInput: {
    minHeight: 160,
    maxHeight: 240,
    fontFamily: FONTS.regular,
    fontSize: 12,
  },
  primaryBtn: {
    marginTop: SIZES.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.accent.green,
    borderRadius: SIZES.radius.md,
    paddingVertical: 14,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: '#000',
  },
  progressWrap: { marginTop: SIZES.md },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.surfaceLight,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.accent.green,
  },
  progressText: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
  },
  errorText: {
    marginTop: SIZES.md,
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.accent.red,
  },
  successText: {
    marginTop: SIZES.md,
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.accent.green,
  },
});
