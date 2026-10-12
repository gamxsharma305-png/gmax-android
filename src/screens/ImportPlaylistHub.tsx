import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  ChevronLeft,
  ChevronRight,
  FileUp,
  Youtube,
  Music2,
} from 'lucide-react-native';
import { COLORS, FONTS, SIZES } from '../constants/theme';

type Row = {
  key: string;
  label: string;
  icon: React.ReactNode;
  route?: string;
  params?: Record<string, string>;
  disabled?: boolean;
};

export default function ImportPlaylistHubScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const rows: Row[] = [
    {
      key: 'file',
      label: 'Import from File',
      icon: <FileUp color={COLORS.text.primary} size={20} />,
      disabled: true,
    },
    {
      key: 'youtube',
      label: 'Import from YouTube',
      icon: <Youtube color="#FF0000" size={20} />,
      route: 'ImportUrl',
      params: { source: 'youtube' },
    },
    {
      key: 'spotify',
      label: 'Import from Spotify',
      icon: <Music2 color="#1DB954" size={20} />,
      route: 'ImportSpotify',
    },
    {
      key: 'resso',
      label: 'Import from Resso',
      icon: <Music2 color={COLORS.text.secondary} size={20} />,
      disabled: true,
    },
    {
      key: 'deezer',
      label: 'Import from Deezer',
      icon: <Music2 color="#A238FF" size={20} />,
      route: 'ImportUrl',
      params: { source: 'deezer' },
    },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <ChevronLeft color={COLORS.text.primary} size={26} />
        </TouchableOpacity>
        <Text style={styles.title}>Import Playlist</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.card}>
        {rows.map((row, i) => (
          <TouchableOpacity
            key={row.key}
            style={[styles.row, i < rows.length - 1 && styles.rowBorder]}
            activeOpacity={row.disabled ? 1 : 0.7}
            disabled={row.disabled}
            onPress={() => {
              if (row.disabled || !row.route) return;
              navigation.navigate(row.route as never, (row.params || {}) as never);
            }}
          >
            <View style={[styles.iconBox, row.disabled && { opacity: 0.4 }]}>
              {row.icon}
            </View>
            <Text style={[styles.label, row.disabled && styles.labelDisabled]}>
              {row.label}
              {row.disabled ? ' (soon)' : ''}
            </Text>
            {!row.disabled ? (
              <ChevronRight color={COLORS.text.muted} size={18} />
            ) : (
              <View style={{ width: 18 }} />
            )}
          </TouchableOpacity>
        ))}
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
  title: { fontFamily: FONTS.bold, fontSize: 18, color: COLORS.text.primary },
  card: {
    marginHorizontal: SIZES.md,
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.hairline,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.primary,
  },
  labelDisabled: { color: COLORS.text.muted },
});
