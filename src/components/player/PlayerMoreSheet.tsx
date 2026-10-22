import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import {
  Heart,
  Download,
  ListPlus,
  ListEnd,
  ListMusic,
  User,
  Timer,
  Gauge,
  Radio,
  Check,
  Lock,
} from 'lucide-react-native';
import { Track } from '../../core/types';
import { COLORS, FONTS, SIZES } from '../../constants/theme';

export type MoreAction =
  | 'like'
  | 'download'
  | 'addPlaylist'
  | 'playNext'
  | 'addQueue'
  | 'artists'
  | 'sleep'
  | 'speed'
  | 'radio';

type Props = {
  visible: boolean;
  track: Track | null;
  liked: boolean;
  savedOffline: boolean;
  downloading: boolean;
  isPremium: boolean;
  onClose: () => void;
  onAction: (action: MoreAction) => void;
};

const ROWS: { id: MoreAction; label: string; Icon: any }[] = [
  { id: 'like', label: 'Like', Icon: Heart },
  { id: 'download', label: 'Download', Icon: Download },
  { id: 'addPlaylist', label: 'Add to a playlist', Icon: ListPlus },
  { id: 'playNext', label: 'Play next', Icon: ListEnd },
  { id: 'addQueue', label: 'Add to queue', Icon: ListMusic },
  { id: 'artists', label: 'Artists', Icon: User },
  { id: 'radio', label: 'Start radio', Icon: Radio },
  { id: 'sleep', label: 'Sleep Timer', Icon: Timer },
  { id: 'speed', label: 'Playback speed', Icon: Gauge },
];

export function PlayerMoreSheet({
  visible,
  track,
  liked,
  savedOffline,
  downloading,
  isPremium,
  onClose,
  onAction,
}: Props) {
  if (!track) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Image source={{ uri: track.albumImageUrl }} style={styles.thumb} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {track.title}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {track.artist?.name}
              </Text>
            </View>
          </View>

          {ROWS.map(({ id, label, Icon }) => {
            let displayLabel = label;
            let color = COLORS.text.primary;
            let iconEl = <Icon color={COLORS.text.secondary} size={22} />;

            if (id === 'like') {
              displayLabel = liked ? 'Liked' : 'Like';
              iconEl = (
                <Heart
                  color={liked ? '#ff6b6b' : COLORS.text.secondary}
                  fill={liked ? '#ff6b6b' : 'transparent'}
                  size={22}
                />
              );
            }
            if (id === 'download') {
              if (downloading) {
                displayLabel = 'Downloading…';
                iconEl = <ActivityIndicator color={COLORS.text.secondary} />;
              } else if (savedOffline) {
                displayLabel = 'Downloaded';
                color = COLORS.accent.green;
                iconEl = <Check color={COLORS.accent.green} size={22} />;
              } else if (!isPremium) {
                displayLabel = 'Download (Premium)';
                iconEl = <Lock color={COLORS.text.secondary} size={22} />;
              }
            }

            return (
              <TouchableOpacity
                key={id}
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => onAction(id)}
              >
                {iconEl}
                <Text style={[styles.rowText, { color }]}>{displayLabel}</Text>
              </TouchableOpacity>
            );
          })}

          <View style={{ height: 20 }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingBottom: 12,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginTop: 10,
    marginBottom: 14,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  thumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#333' },
  title: { fontFamily: FONTS.medium, fontSize: 16, color: '#fff' },
  artist: { fontFamily: FONTS.regular, fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 14,
  },
  rowText: { fontFamily: FONTS.regular, fontSize: 16 },
});
