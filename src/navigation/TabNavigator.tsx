import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Search, Library, Clock } from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { useTheme } from '../theme/ThemeContext';

import HomeScreen from '../screens/Home';
import SearchScreen from '../screens/Search';
import LibraryScreen from '../screens/Library';
import HistoryScreen from '../screens/History';

const Tab = createBottomTabNavigator();

export const TabNavigator = () => {
  const { accent, colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar, { backgroundColor: colors.surfaceRaised }],
        tabBarBackground: () => <View style={[styles.tabBarBackground, { backgroundColor: colors.surfaceRaised }]} />,
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: colors.text.secondary,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tab.Screen 
        name="HomeTab" 
        component={HomeScreen} 
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Home color={color} size={24} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen 
        name="SearchTab" 
        component={SearchScreen} 
        options={{
          tabBarLabel: 'Search',
          tabBarIcon: ({ color, focused }) => (
            <Search color={color} size={24} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen 
        name="LibraryTab" 
        component={LibraryScreen} 
        options={{
          tabBarLabel: 'Library',
          tabBarIcon: ({ color, focused }) => (
            <Library color={color} size={24} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen 
        name="HistoryTab" 
        component={HistoryScreen} 
        options={{
          tabBarLabel: 'History',
          tabBarIcon: ({ color, focused }) => (
            <Clock color={color} size={24} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    backgroundColor: COLORS.surfaceRaised,
    borderTopWidth: 1,
    borderTopColor: COLORS.hairline,
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingBottom: Platform.OS === 'ios' ? 28 : 8,
    paddingTop: 8,
  },
  tabBarBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.surfaceRaised,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
});
