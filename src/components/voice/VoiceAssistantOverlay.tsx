import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mic, X, Send, Sparkles } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS, FONTS, SIZES } from '../../constants/theme';
import { usePlayer } from '../../hooks/usePlayer';
import { useLibrary } from '../../hooks/useLibrary';
import { MusicService } from '../../services/MusicService';
import {
  AssistantResult,
  localQuickIntent,
  processUserCommand,
  speakReply,
  stopSpeaking,
  VoiceAction,
} from '../../services/VoiceAssistantService';
import { getGeminiApiKey } from '../../services/GeminiKeyStore';

export function VoiceAssistantFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        accessibilityLabel="Voice assistant"
      >
        <Mic color="#000" size={22} />
      </TouchableOpacity>
      <VoiceAssistantModal visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

function VoiceAssistantModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const player = usePlayer();
  const { createPlaylist, toggleLike } = useLibrary();
  const { currentTrack, status, playTrack, next, previous, togglePlayPause } = player;
  const current = currentTrack;
  const togglePlay = togglePlayPause;

  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const running = useRef(false);

  useEffect(() => {
    if (!visible) return;
    void getGeminiApiKey().then((k) => setHasKey(!!k));
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      stopSpeaking();
      setBusy(false);
      running.current = false;
    }
  }, [visible]);

  const runActions = useCallback(
    async (actions: VoiceAction[]) => {
      for (const a of actions) {
        try {
          switch (a.type) {
            case 'play_search': {
              const results = await MusicService.search(a.query, {
                filter: 'Songs',
                limit: 8,
              });
              const tracks = results.tracks || [];
              const pick =
                tracks.find((t) => t.provider === 'youtube' && t.sourceId) || tracks[0];
              if (pick) playTrack(pick, { tracks, label: a.query });
              break;
            }
            case 'play_pause':
              togglePlay();
              break;
            case 'pause':
              if (status.isPlaying) togglePlay();
              break;
            case 'resume':
              if (!status.isPlaying && current) togglePlay();
              break;
            case 'next':
              next();
              break;
            case 'previous':
              previous();
              break;
            case 'like':
              if (current) toggleLike(current);
              break;
            case 'search':
              navigation.navigate('MainTabs', { screen: 'Search' });
              break;
            case 'create_playlist': {
              let tracks: any[] = [];
              if (a.query) {
                const results = await MusicService.search(a.query, {
                  filter: 'Songs',
                  limit: 20,
                });
                tracks = results.tracks || [];
              }
              createPlaylist(a.name, tracks);
              break;
            }
            case 'open_library':
              navigation.navigate('MainTabs', { screen: 'Library' });
              break;
            case 'open_home':
              navigation.navigate('MainTabs', { screen: 'Home' });
              break;
            case 'open_search':
              navigation.navigate('MainTabs', { screen: 'Search' });
              break;
            case 'open_settings':
              navigation.navigate('Settings');
              break;
            default:
              break;
          }
        } catch {
          /* ignore single action */
        }
      }
    },
    [
      createPlaylist,
      current,
      navigation,
      next,
      playTrack,
      previous,
      status.isPlaying,
      toggleLike,
      togglePlay,
    ]
  );

  const handleCommand = useCallback(
    async (raw: string) => {
      const cmd = raw.trim();
      if (!cmd || running.current) return;
      running.current = true;
      setBusy(true);
      setLog((l) => [...l, { role: 'user', text: cmd }]);
      setText('');

      try {
        const nowPlaying = current
          ? `${current.title} — ${current.artist?.name || ''}`
          : undefined;

        let result: AssistantResult =
          localQuickIntent(cmd) || (await processUserCommand(cmd, { nowPlaying }));

        if (result.actions.some((a) => a.type === 'what_playing')) {
          result = {
            ...result,
            reply: nowPlaying
              ? `Ab chal raha hai: ${nowPlaying}`
              : 'Koi gaana nahi chal raha.',
          };
        }
        if (result.actions.some((a) => a.type === 'help')) {
          result = {
            ...result,
            reply:
              result.reply ||
              'Bolo: play [song], pause, next, previous, like, ya playlist banao.',
          };
        }

        setLog((l) => [...l, { role: 'assistant', text: result.reply }]);
        await runActions(result.actions);
        void speakReply(result.reply, result.language === 'en' ? 'en' : 'hi');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed';
        setLog((l) => [...l, { role: 'assistant', text: msg }]);
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [current, runActions]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetTitleRow}>
              <Sparkles color={COLORS.accent.green} size={18} />
              <Text style={styles.sheetTitle}>GMAX Voice</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <X color={COLORS.text.secondary} size={22} />
            </TouchableOpacity>
          </View>

          {hasKey === false ? (
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>
                Apni Gemini API key Settings → Voice Assistant mein daalo. Key sirf is phone
                pe rehti hai — server pe nahi.
              </Text>
              <TouchableOpacity
                style={styles.warnBtn}
                onPress={() => {
                  onClose();
                  navigation.navigate('Settings');
                }}
              >
                <Text style={styles.warnBtnText}>Open Settings</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.chat}>
            {log.length === 0 ? (
              <Text style={styles.hint}>
                Examples: "Play Kesariya", "Pause", "Next song", "Arijit ke gaane chalao",
                "Party playlist banao"
              </Text>
            ) : (
              log.map((m, i) => (
                <View
                  key={`${i}-${m.role}`}
                  style={[
                    styles.bubble,
                    m.role === 'user' ? styles.userBubble : styles.aiBubble,
                  ]}
                >
                  <Text style={styles.bubbleText}>{m.text}</Text>
                </View>
              ))
            )}
            {busy ? (
              <ActivityIndicator color={COLORS.accent.green} style={{ marginTop: 8 }} />
            ) : null}
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Bolo ya type karo…"
              placeholderTextColor={COLORS.text.muted}
              editable={!busy}
              onSubmitEditing={() => void handleCommand(text)}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[styles.sendBtn, busy && { opacity: 0.5 }]}
              disabled={busy || !text.trim()}
              onPress={() => void handleCommand(text)}
            >
              <Send color="#000" size={18} />
            </TouchableOpacity>
          </View>
          <Text style={styles.footerNote}>
            Gemini key local · pro assistant · app open hone par kaam karta hai
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 110,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: COLORS.accent.green,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: COLORS.surfaceRaised || '#121212',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: SIZES.md,
    paddingTop: 14,
    maxHeight: '78%',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetTitle: { fontFamily: FONTS.bold, fontSize: 17, color: COLORS.text.primary },
  warnBox: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  warnText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.text.secondary,
    lineHeight: 18,
  },
  warnBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.accent.green,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  warnBtnText: { fontFamily: FONTS.bold, fontSize: 13, color: '#000' },
  chat: { minHeight: 120, maxHeight: 280, marginBottom: 10 },
  hint: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.text.muted,
    lineHeight: 19,
  },
  bubble: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    maxWidth: '90%',
  },
  userBubble: { alignSelf: 'flex-end', backgroundColor: 'rgba(29,185,84,0.25)' },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: COLORS.surfaceLight || '#1a1a1a' },
  bubbleText: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.text.primary },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: COLORS.surfaceLight || '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text.primary,
    fontFamily: FONTS.regular,
    fontSize: 15,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.accent.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerNote: {
    marginTop: 10,
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.text.muted,
    textAlign: 'center',
  },
});
