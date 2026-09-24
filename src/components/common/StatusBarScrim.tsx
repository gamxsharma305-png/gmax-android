import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/theme';

export const StatusBarScrim: React.FC = () => {
  const insets = useSafeAreaInsets();

  if (insets.top <= 0) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.scrim, { height: insets.top }]}
    />
  );
};

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.background,
    zIndex: 50,
  },
});
