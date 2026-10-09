import React, { useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Home, Search, Library, Clock } from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { useTheme } from '../theme/ThemeContext';
import { useLibrary } from '../hooks/useLibrary';

import HomeScreen from '../screens/Home';
import SearchScreen from '../screens/Search';
import LibraryScreen from '../screens/Library';
import HistoryScreen from '../screens/History';

const Tab = createBottomTabNavigator();

export const TabNavigator = () => {
  const { accent, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { settings } = useLibrary();
  const glass = !!settings.glassTabBar;

  // Never sit under system nav / gesture bar
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8);
  const barHeight = 52 + bottomPad;

  const tabBarStyle = useMemo(() => {
    if (glass) {
      return {
        position: 'absolute' as const,
        left: 16,
        right: 16,
        bottom: Math.max(insets.bottom, 10),
        height: 58,
        borderRadius: 28,
        borderTopWidth: 0,
        backgroundColor: 'transparent',
        elevation: 0,
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        paddingBottom: 0,
        paddingTop: 0,
        overflow: 'hidden' as const,
      };
    }
    return {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      bottom: 0,
      height: barHeight,
      paddingBottom: bottomPad,
      paddingTop: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: COLORS.hairline,
      backgroundColor: colors.surfaceRaised,
      elevation: 12,
    };
  }, [glass, barHeight, bottomPad, insets.bottom, colors]);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarBackground: () =>
          glass ? (
            <BlurView
              intensity={55}
              tint="dark"
              style={[StyleSheet.absoluteFill, styles.glassBg]}
            />
          ) : (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.surfaceRaised },
              ]}
            />
          ),
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: colors.text.secondary,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: glass ? styles.glassItem : undefined,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Home color={color} size={22} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="SearchTab"
        component={SearchScreen}
        options={{
          tabBarLabel: 'Search',
          tabBarIcon: ({ color, focused }) => (
            <Search color={color} size={22} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="LibraryTab"
        component={LibraryScreen}
        options={{
          tabBarLabel: 'Library',
          tabBarIcon: ({ color, focused }) => (
            <Library color={color} size={22} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="HistoryTab"
        component={HistoryScreen}
        options={{
          tabBarLabel: 'History',
          tabBarIcon: ({ color, focused }) => (
            <Clock color={color} size={22} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBarLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
  },
  glassBg: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(20,20,24,0.55)',
  },
  glassItem: {
    paddingVertical: 4,
  },
});
