import React, { createContext, useContext, useMemo, ReactNode } from 'react';
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
  setAccent: (hex: string) => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings, updateSettings } = useLibrary();
  const accent = (settings.accentColor || '#1db954').toLowerCase();

  const colors = useMemo(() => {
    return {
      ...BASE,
      accent: {
        ...BASE.accent,
        green: accent,
        primary: accent,
      },
    } as ThemeColors;
  }, [accent]);

  const value = useMemo(
    () => ({
      colors,
      accent,
      setAccent: (hex: string) => updateSettings({ accentColor: hex }),
    }),
    [colors, accent, updateSettings]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      colors: { ...BASE, accent: { ...BASE.accent, primary: BASE.accent.green } },
      accent: BASE.accent.green,
      setAccent: (_: string) => undefined,
    };
  }
  return ctx;
}
