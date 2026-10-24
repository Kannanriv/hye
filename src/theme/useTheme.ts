import { useColorScheme, useWindowDimensions } from 'react-native';

import { useStore } from '@/state/store';
import { palette, WIDE_BREAKPOINT } from './tokens';

export function useTheme() {
  const system = useColorScheme();
  const { state } = useStore();
  const mode = state.theme === 'system' ? (system === 'dark' ? 'dark' : 'light') : state.theme;
  return { colors: palette[mode], mode };
}

export function useIsWide() {
  const { width } = useWindowDimensions();
  return width >= WIDE_BREAKPOINT;
}
