import React, { createContext, useCallback, useContext, useEffect, useMemo, ReactNode } from 'react';
import { useLibrary } from '../hooks/useLibrary';
import { COLORS as BASE } from '../constants/theme';

export const ACCENT_PRESETS = [
  '#1db954',
  '#3b82f6',
  '#a855f7',
  '#f97316',
  '#ef4444',
  '#14b8a6',
  '#eab308',
  '#ec4899',
  '#84cc16',
  '#06b6d4',
] as const;

type ThemeColors = typeof BASE & { accent: typeof BASE.accent & { primary: string } };

type ThemeCtx = {
  colors: ThemeColors;
  accent: string;
  themeMode: 'dark' | 'light' | 'system';
  setAccent: (hex: string) => void;
  setThemeMode: (mode: 'dark' | 'light' | 'system') => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

/** Mutate shared COLORS so StyleSheet + inline reads pick up new accent after re-render */
function applyAccentToGlobal(hex: string) {
  const h = (hex || '#1db954').toLowerCase();
  BASE.accent.green = h;
  (BASE.accent as { primary?: string }).primary = h;
  const r = parseInt(h.slice(1, 3), 16) || 29;
  const g = parseInt(h.slice(3, 5), 16) || 185;
  const b = parseInt(h.slice(5, 7), 16) || 84;
  BASE.accent.greenGlow = `rgba(${r}, ${g}, ${b}, 0.18)`;
}

function applyThemeModeToGlobal(mode: 'dark' | 'light' | 'system') {
  const light = mode === 'light';
  if (light) {
    BASE.background = '#f4f4f5';
    BASE.surface = '#ffffff';
    BASE.surfaceLight = '#e4e4e7';
    BASE.surfaceRaised = '#ffffff';
    BASE.hairline = 'rgba(0,0,0,0.08)';
    BASE.glassBorder = 'rgba(0,0,0,0.1)';
    BASE.glass = 'rgba(0,0,0,0.04)';
    BASE.text.primary = '#18181b';
    BASE.text.secondary = '#52525b';
    BASE.text.muted = '#a1a1aa';
  } else {
    BASE.background = '#050707';
    BASE.surface = '#090B0B';
    BASE.surfaceLight = '#0D1010';
    BASE.surfaceRaised = '#121616';
    BASE.hairline = 'rgba(255, 255, 255, 0.08)';
    BASE.glassBorder = 'rgba(255, 255, 255, 0.1)';
    BASE.glass = 'rgba(255, 255, 255, 0.05)';
    BASE.text.primary = '#F0F0F0';
    BASE.text.secondary = '#888888';
    BASE.text.muted = '#555555';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings, updateSettings } = useLibrary();
  const accent = (settings.accentColor || '#1db954').toLowerCase();
  const themeMode = (settings.themeMode || 'dark') as 'dark' | 'light' | 'system';

  useEffect(() => {
    applyAccentToGlobal(accent);
    applyThemeModeToGlobal(themeMode === 'system' ? 'dark' : themeMode);
  }, [accent, themeMode]);

  const colors = useMemo(() => {
    applyAccentToGlobal(accent);
    applyThemeModeToGlobal(themeMode === 'system' ? 'dark' : themeMode);
    return {
      ...BASE,
      accent: {
        ...BASE.accent,
        green: accent,
        primary: accent,
      },
      text: { ...BASE.text },
    } as ThemeColors;
  }, [accent, themeMode]);

  const setAccent = useCallback(
    (hex: string) => {
      applyAccentToGlobal(hex);
      updateSettings({ accentColor: hex });
    },
    [updateSettings]
  );

  const setThemeMode = useCallback(
    (mode: 'dark' | 'light' | 'system') => {
      applyThemeModeToGlobal(mode === 'system' ? 'dark' : mode);
      updateSettings({ themeMode: mode });
    },
    [updateSettings]
  );

  const value = useMemo(
    () => ({
      colors,
      accent,
      themeMode,
      setAccent,
      setThemeMode,
    }),
    [colors, accent, themeMode, setAccent, setThemeMode]
  );

  return (
    <Ctx.Provider value={value}>
      <React.Fragment key={`${accent}-${themeMode}`}>{children}</React.Fragment>
    </Ctx.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      colors: { ...BASE, accent: { ...BASE.accent, primary: BASE.accent.green } },
      accent: BASE.accent.green,
      themeMode: 'dark' as const,
      setAccent: (_: string) => undefined,
      setThemeMode: (_: 'dark' | 'light' | 'system') => undefined,
    };
  }
  return ctx;
}
