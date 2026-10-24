import { createContext, createElement, ReactNode, useContext, useMemo } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';

import { useStore } from '@/state/store';
import { Colors, palette, WIDE_BREAKPOINT } from './tokens';

type Theme = { colors: Colors; mode: 'light' | 'dark' };

// Separate context so themed components re-render only when the mode changes,
// not on every store update.
const ThemeContext = createContext<Theme>({ colors: palette.light, mode: 'light' });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const pref = useStore().state.theme;
  const mode = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  const value = useMemo(() => ({ colors: palette[mode], mode }), [mode]);
  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export function useIsWide() {
  const { width } = useWindowDimensions();
  return width >= WIDE_BREAKPOINT;
}
