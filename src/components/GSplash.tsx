import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  Dimensions,
} from 'react-native';
import Svg, {
  Circle,
  Path,
  Defs,
  LinearGradient,
  Stop,
  G,
} from 'react-native-svg';
import { COLORS, FONTS } from '../constants/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

/** Same path as website Splash.tsx */
const G_PATH = `M 88 42
C 82 28 72 22 58 22
C 38 22 24 36 24 58
C 24 80 38 96 60 96
C 76 96 88 86 92 72
L 68 72
M 92 72
L 92 58
L 62 58`;

const ACCENT_PATH = 'M 62 54 L 92 54 L 92 62 L 62 62 Z';

/** Stroke length used on website CSS (stroke-dasharray: 320) */
const STROKE_LEN = 320;

type Props = {
  onDone: () => void;
  /** Minimum time splash stays visible (ms) — website default 2800 */
  minMs?: number;
};

/**
 * Website-identical GMAX intro:
 * letter G path draws in → accent bar → title fades → scale out.
 */
export function GSplash({ onDone, minMs = 2800 }: Props) {
  const [phase, setPhase] = useState<'draw' | 'brand' | 'out'>('draw');
  const draw = useRef(new Animated.Value(0)).current;
  const guideOp = useRef(new Animated.Value(0)).current;
  const accentOp = useRef(new Animated.Value(0)).current;
  const accentScale = useRef(new Animated.Value(0.4)).current;
  const copyOp = useRef(new Animated.Value(0)).current;
  const copyY = useRef(new Animated.Value(10)).current;
  const outOp = useRef(new Animated.Value(1)).current;
  const outScale = useRef(new Animated.Value(1)).current;
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  useEffect(() => {
    // Guide ring fade in (0.6s)
    Animated.timing(guideOp, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();

    // Path draw: 1.35s, delay 0.15s, cubic-bezier(0.4,0,0.2,1)
    Animated.timing(draw, {
      toValue: 1,
      duration: 1350,
      delay: 150,
      useNativeDriver: false,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    }).start();

    // Accent bar at ~1.2s
    Animated.parallel([
      Animated.timing(accentOp, {
        toValue: 1,
        duration: 450,
        delay: 1200,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }),
      Animated.timing(accentScale, {
        toValue: 1,
        duration: 450,
        delay: 1200,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }),
    ]).start();

    const t1 = setTimeout(() => {
      setPhase('brand');
      Animated.parallel([
        Animated.timing(copyOp, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }),
        Animated.timing(copyY, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }),
      ]).start();
    }, 1400);

    const t2 = setTimeout(() => {
      setPhase('out');
      Animated.parallel([
        Animated.timing(outOp, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }),
        Animated.timing(outScale, {
          toValue: 1.04,
          duration: 400,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }),
      ]).start();
    }, Math.max(minMs - 400, 0));

    const t3 = setTimeout(finish, minMs);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minMs]);

  const strokeDashoffset = draw.interpolate({
    inputRange: [0, 1],
    outputRange: [STROKE_LEN, 0],
  });

  const svgSize = Math.min(160, Dimensions.get('window').width * 0.42);

  return (
    <Pressable onPress={finish} style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.wrap,
          {
            opacity: outOp,
            transform: [{ scale: outScale }],
          },
        ]}
      >
        {/* Soft design-tool grid behind the G */}
        <View style={styles.grid} pointerEvents="none" />

        <View style={styles.stage}>
          <View
            style={[
              styles.svgWrap,
              {
                width: svgSize,
                height: svgSize,
                shadowColor: '#1DB954',
                shadowOpacity: 0.25,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 0 },
                elevation: 8,
              },
            ]}
          >
            <Svg width={svgSize} height={svgSize} viewBox="0 0 120 120">
              <Defs>
                <LinearGradient id="gmaxGStroke" x1="24" y1="22" x2="92" y2="96">
                  <Stop offset="0" stopColor="#f0f0f0" />
                  <Stop offset="1" stopColor="#1db954" />
                </LinearGradient>
                <LinearGradient id="gmaxGFill" x1="62" y1="54" x2="92" y2="62">
                  <Stop offset="0" stopColor="#1db954" />
                  <Stop offset="1" stopColor="#6ee7a0" />
                </LinearGradient>
              </Defs>

              <AnimatedG opacity={guideOp}>
                <Circle
                  cx="60"
                  cy="60"
                  r="46"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="1"
                  strokeDasharray="4 6"
                  fill="none"
                />
              </AnimatedG>

              <AnimatedPath
                d={G_PATH}
                stroke="url(#gmaxGStroke)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                strokeDasharray={`${STROKE_LEN}`}
                strokeDashoffset={strokeDashoffset as unknown as number}
              />

              <AnimatedG
                opacity={accentOp}
                origin="77, 58"
                scaleX={accentScale}
              >
                <Path d={ACCENT_PATH} fill="url(#gmaxGFill)" />
              </AnimatedG>
            </Svg>
          </View>

          <Animated.View
            style={[
              styles.copy,
              {
                opacity: copyOp,
                transform: [{ translateY: copyY }],
              },
            ]}
          >
            <Text style={styles.name}>GMAX</Text>
            <Text style={styles.tag}>YOUR MUSIC. YOUR WAY.</Text>
          </Animated.View>
        </View>

        <Text style={styles.hint}>TAP TO SKIP</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
    // radial-ish: deep center green-black like website
    backgroundColor: '#050707',
  },
  grid: {
    position: 'absolute',
    width: 220,
    height: 220,
    top: '38%',
    alignSelf: 'center',
    marginTop: -110,
    opacity: 0.7,
    // approximate soft grid
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.04)',
    backgroundColor: 'transparent',
  },
  stage: {
    alignItems: 'center',
    gap: 28,
  },
  svgWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    alignItems: 'center',
  },
  name: {
    fontFamily: FONTS.semiBold ?? FONTS.bold,
    fontSize: 32,
    fontWeight: '600',
    letterSpacing: 0.28 * 16, // ~0.28em
    color: COLORS.text.primary,
  },
  tag: {
    marginTop: 10,
    fontFamily: FONTS.medium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.32 * 10,
    color: COLORS.text.muted,
    textTransform: 'uppercase',
  },
  hint: {
    position: 'absolute',
    bottom: 28,
    fontFamily: FONTS.medium,
    fontSize: 10,
    letterSpacing: 0.2 * 10,
    color: 'rgba(255,255,255,0.28)',
    textTransform: 'uppercase',
  },
});
