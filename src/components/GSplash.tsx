import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, Pressable } from 'react-native';
import Svg, { Circle, Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { COLORS, FONTS } from '../constants/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Website-style G path draw splash for GMAX. */
export function GSplash({ onDone }: { onDone: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  const brandOp = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(progress, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: false,
      }),
      Animated.timing(brandOp, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.delay(600),
      Animated.timing(fadeOut, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => onDone());
  }, [brandOp, fadeOut, onDone, progress]);

  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [280, 0],
  });

  return (
    <Pressable onPress={onDone} style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.wrap, { opacity: fadeOut }]}>
        <View style={styles.stage}>
          <Svg width={120} height={120} viewBox="0 0 120 120">
            <Defs>
              <LinearGradient id="gmaxGStroke" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#1DB954" />
                <Stop offset="1" stopColor="#a7f3d0" />
              </LinearGradient>
            </Defs>
            <Circle
              cx="60"
              cy="60"
              r="46"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
              strokeDasharray="4 6"
              fill="none"
            />
            <AnimatedPath
              d="M 88 42
                 C 82 28 72 22 58 22
                 C 38 22 24 36 24 58
                 C 24 80 38 96 60 96
                 C 76 96 88 86 92 72
                 L 68 72
                 M 92 72
                 L 92 58
                 L 62 58"
              stroke="url(#gmaxGStroke)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              strokeDasharray="280"
              strokeDashoffset={strokeDashoffset as unknown as number}
            />
          </Svg>
          <Animated.Text style={[styles.brand, { opacity: brandOp }]}>GMAX</Animated.Text>
          <Animated.Text style={[styles.tag, { opacity: brandOp }]}>
            YOUR MUSIC. YOUR WAY.
          </Animated.Text>
        </View>
      </Animated.View>
    </Pressable>
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
  stage: { alignItems: 'center' },
  brand: {
    marginTop: 18,
    fontFamily: FONTS.bold,
    fontSize: 22,
    letterSpacing: 6,
    color: COLORS.text.primary,
  },
  tag: {
    marginTop: 8,
    fontFamily: FONTS.medium,
    fontSize: 11,
    letterSpacing: 2,
    color: COLORS.text.muted,
  },
});
