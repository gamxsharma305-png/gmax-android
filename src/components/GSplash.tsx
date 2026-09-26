import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS } from '../constants/theme';

/** Brief GMAX logo intro — mirrors website open animation. */
export function GSplash({ onDone }: { onDone: () => void }) {
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          friction: 5,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(700),
      Animated.timing(fadeOut, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start(() => onDone());
  }, [fadeOut, onDone, opacity, scale]);

  return (
    <Animated.View style={[styles.wrap, { opacity: fadeOut }]}>
      <Animated.View style={{ transform: [{ scale }], opacity }}>
        <View style={styles.badge}>
          <Text style={styles.letter}>G</Text>
        </View>
        <Text style={styles.brand}>GMAX</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  badge: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: '#0d1a14',
    borderWidth: 1.5,
    borderColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  letter: {
    fontFamily: FONTS.bold,
    fontSize: 48,
    color: '#1DB954',
  },
  brand: {
    marginTop: 16,
    fontFamily: FONTS.bold,
    fontSize: 22,
    letterSpacing: 6,
    color: COLORS.text.primary,
    textAlign: 'center',
  },
});
