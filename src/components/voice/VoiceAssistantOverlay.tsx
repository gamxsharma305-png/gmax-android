import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mic, X, Send, Sparkles, GripHorizontal } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS, FONTS, SIZES } from '../../constants/theme';
import { usePlayer } from '../../hooks/usePlayer';
import { useLibrary } from '../../hooks/useLibrary';
import { useSubscription } from '../../hooks/useSubscription';
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

const FAB_POS_KEY = '@gmax/voice_fab_pos_v1';
const FAB_SIZE = 54;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

function defaultFabPos(insetsBottom: number) {
  return {
    x: SCREEN_W - FAB_SIZE - 18,
    y: SCREEN_H - FAB_SIZE - Math.max(insetsBottom, 28) - 160,
  };
}

export function VoiceAssistantFab() {
  const insets = useSafeAreaInsets();
  const { isPremium } = useSubscription();
  const { settings } = useLibrary();
  const navigation = useNavigation<any>();

  const enabled = !!settings.voiceAssistantEnabled;
  const autoListen = !!settings.voiceAutoListen;

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(() => defaultFabPos(insets.bottom));
  const posRef = useRef(pos);
  posRef.current = pos;
  const dragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    void AsyncStorage.getItem(FAB_POS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const p = JSON.parse(raw);
        if (typeof p.x === 'number' && typeof p.y === 'number') {
          setPos({
            x: Math.min(SCREEN_W - FAB_SIZE, Math.max(0, p.x)),
            y: Math.min(SCREEN_H - FAB_SIZE - 40, Math.max(insets.top + 8, p.y)),
          });
        }
      } catch {
        /* ignore */
      }
    });
  }, [insets.top]);

  const autoOpened = useRef(false);
  useEffect(() => {
    if (!isPremium || !enabled || !autoListen || autoOpened.current) return;
    const t = setTimeout(() => {
      autoOpened.current = true;
      setOpen(true);
    }, 1800);
    return () => clearTimeout(t);
  }, [autoListen, enabled, isPremium]);

  const savePos = useCallback((p: { x: number; y: number }) => {
    void AsyncStorage.setItem(FAB_POS_KEY, JSON.stringify(p));
  }, []);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        dragStart.current = { ...posRef.current };
      },
      onPanResponderMove: (_, g) => {
        const x = Math.min(SCREEN_W - FAB_SIZE, Math.max(0, dragStart.current.x + g.dx));
        const y = Math.min(SCREEN_H - FAB_SIZE - 24, Math.max(40, dragStart.current.y + g.dy));
        setPos({ x, y });
      },
      onPanResponderRelease: () => {
        savePos(posRef.current);
      },
    })
  ).current;

  const onFabPress = useCallback(() => {
    if (!isPremium) {
      navigation.navigate('Paywall');
      return;
    }
    if (!enabled) {
      navigation.navigate('Settings');
      return;
    }
    setOpen(true);
  }, [enabled, isPremium, navigation]);

  return (
    <>
      <View
        style={[styles.fabWrap, { left: pos.x, top: pos.y }]}
        {...pan.panHandlers}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={[
            styles.fab,
            !isPremium && styles.fabLocked,
            enabled && autoListen && styles.fabListening,
          ]}
          onPress={onFabPress}
          activeOpacity={0.85}
          accessibilityLabel="Voice assistant"
        >
          <Mic color={isPremium && enabled ? '#000' : '#666'} size={22} />
        </TouchableOpacity>
        <View style={styles.dragHint} pointerEvents="none">
          <GripHorizontal color="rgba(255,255,255,0.35)" size={14} />
        </View>
      </View>

      {isPremium && enabled ? (
        <VoiceAssistantModal
          visible={open}
          onClose={() => setOpen(false)}
          autoListen={autoListen}
        />
      ) : null}
    </>
  );
}

function VoiceAssistantModal({
  visible,
  onClose,
  autoListen,
}: {
  visible: boolean;
  onClose: () => void;
  autoListen: boolean;
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const player = usePlayer();
  const { createPlaylist, toggleLike } = useLibrary();
  const {
    currentTrack,
    status,
    playTrack,
    next,
    previous,
    togglePlayPause,
    seekBy,
    setVolume,
  } = player;
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
            case 'seek':
              if (typeof seekBy === 'function') seekBy(a.seconds);
              break;
            case 'volume':
              if (typeof setVolume === 'function') setVolume(a.level);
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
          /* ignore */
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
      seekBy,
      setVolume,
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
              'Bolo: play [song], pause, next, previous, like, volume, playlist banao.',
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
              {autoListen ? (
                <View style={styles.livePill}>
                  <Text style={styles.livePillText}>READY</Text>
                </View>
              ) : null}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <X color={COLORS.text.secondary} size={22} />
            </TouchableOpacity>
          </View>

          {hasKey === false ? (
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>
                Gemini API key Settings → Voice Assistant mein daalo. Key sirf phone pe rehti
                hai.
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
          ) : (
            <Text style={styles.hintTop}>
              App open hai — command type karo. Mic button drag karke mini-player se door rakh
              sakte ho.
            </Text>
          )}

          <View style={styles.chat}>
            {log.length === 0 ? (
              <Text style={styles.hint}>
                Examples: "Play Kesariya", "Pause", "Next", "Volume 50", "Arijit playlist
                banao", "Library kholo"
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
              placeholder="Command type karo…"
              placeholderTextColor={COLORS.text.muted}
              editable={!busy}
              onSubmitEditing={() => void handleCommand(text)}
              returnKeyType="send"
              autoFocus={autoListen}
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
            Premium · Gemini local key · FAB drag karke move karo
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fabWrap: {
    position: 'absolute',
    width: FAB_SIZE + 8,
    height: FAB_SIZE + 16,
    zIndex: 9999,
    elevation: 24,
    alignItems: 'center',
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: COLORS.accent.green,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  fabLocked: { backgroundColor: '#3a3a3a' },
  fabListening: { borderWidth: 2, borderColor: '#fff' },
  dragHint: { marginTop: 2, opacity: 0.8 },
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
  livePill: {
    backgroundColor: 'rgba(29,185,84,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  livePillText: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: COLORS.accent.green,
    letterSpacing: 1,
  },
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
  hintTop: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.muted,
    marginBottom: 8,
    lineHeight: 17,
  },
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
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.surfaceLight || '#1a1a1a',
  },
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
