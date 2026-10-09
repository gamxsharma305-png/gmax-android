import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

/** Full G letter path — viewBox 0 0 120 120 */
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

/** Path length estimate — keep >= real length so stroke fully appears */
const STROKE_LEN = 380;

type Props = {
  onDone: () => void;
  minMs?: number;
};

/**
 * Full-screen GMAX intro — complete logo centered, solid background.
 */
export function GSplash({ onDone, minMs = 3400 }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const draw = useRef(new Animated.Value(0)).current;
  const logoOp = useRef(new Animated.Value(0)).current;
  const guideOp = useRef(new Animated.Value(0)).current;
  const accentOp = useRef(new Animated.Value(0)).current;
  const accentScale = useRef(new Animated.Value(0.5)).current;
  const copyOp = useRef(new Animated.Value(0)).current;
  const copyY = useRef(new Animated.Value(12)).current;
  const outOp = useRef(new Animated.Value(1)).current;
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  useEffect(() => {
    Animated.timing(guideOp, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();

    Animated.timing(draw, {
      toValue: 1,
      duration: 1400,
      delay: 120,
      useNativeDriver: false,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    }).start();

    Animated.timing(logoOp, {
      toValue: 1,
      duration: 600,
      delay: 200,
      useNativeDriver: true,
    }).start();

    Animated.parallel([
      Animated.timing(accentOp, {
        toValue: 1,
        duration: 400,
        delay: 1300,
        useNativeDriver: true,
      }),
      Animated.spring(accentScale, {
        toValue: 1,
        delay: 1300,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();

    const t1 = setTimeout(() => {
      Animated.parallel([
        Animated.timing(copyOp, {
          toValue: 1,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.timing(copyY, {
          toValue: 0,
          duration: 450,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }),
      ]).start();
    }, 1500);

    const fadeStart = Math.max(minMs - 450, 2200);
    const t2 = setTimeout(() => {
      Animated.timing(outOp, {
        toValue: 0,
        duration: 420,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }).start(({ finished }) => {
        if (finished) finish();
      });
    }, fadeStart);

    const t3 = setTimeout(finish, minMs + 50);

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

  const svgSize = Math.min(
    220,
    Math.round(Math.min(width * 0.52, height * 0.32)),
    Math.max(160, Math.round(width * 0.45))
  );

  return (
    <Pressable onPress={finish} style={styles.root}>
      <Animated.View style={[styles.wrap, { opacity: outOp }]}>
        <View style={styles.stage}>
          <Animated.View style={{ opacity: logoOp }}>
            <View style={[styles.svgWrap, { width: svgSize, height: svgSize }]}>
              <Svg
                width={svgSize}
                height={svgSize}
                viewBox="0 0 120 120"
                preserveAspectRatio="xMidYMid meet"
              >
                <Defs>
                  <LinearGradient id="gmaxGStroke" x1="24" y1="22" x2="92" y2="96">
                    <Stop offset="0" stopColor="#f5f5f5" />
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
                    r="48"
                    stroke="rgba(255,255,255,0.14)"
                    strokeWidth="1.2"
                    strokeDasharray="4 6"
                    fill="none"
                  />
                </AnimatedG>

                <Path
                  d={G_PATH}
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />

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

                <AnimatedG opacity={accentOp} origin="77, 58" scaleX={accentScale}>
                  <Path d={ACCENT_PATH} fill="url(#gmaxGFill)" />
                </AnimatedG>
              </Svg>
            </View>
          </Animated.View>

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

        <Text style={[styles.hint, { bottom: Math.max(insets.bottom, 16) + 16 }]}>
          TAP TO SKIP
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    zIndex: 99999,
    elevation: 99999,
    backgroundColor: '#050707',
  },
  wrap: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#050707',
  },
  stage: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
  },
  svgWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  copy: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  name: {
    fontFamily: FONTS.bold,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 5,
    color: COLORS.text.primary,
  },
  tag: {
    marginTop: 12,
    fontFamily: FONTS.medium,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 3.4,
    color: COLORS.text.muted,
    textTransform: 'uppercase',
  },
  hint: {
    position: 'absolute',
    alignSelf: 'center',
    fontFamily: FONTS.medium,
    fontSize: 10,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.32)',
    textTransform: 'uppercase',
  },
});
