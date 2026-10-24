// Design tokens. Neutral canvas, white surfaces, one brand accent (indigo).
// Contrast pairs checked against WCAG AA for body text.

export const palette = {
  light: {
    bg: '#F4F5F8',
    surface: '#FFFFFF',
    surfaceAlt: '#EEF0F4',
    text: '#0F172A',
    textMuted: '#5B6475',
    border: '#E3E6EC',
    accent: '#4F46E5',
    accentSoft: '#EEF0FF',
    onAccent: '#FFFFFF',
    bubbleMe: '#4F46E5',
    bubbleMeText: '#FFFFFF',
    bubbleThem: '#FFFFFF',
    imported: '#92400E',
    importedSoft: '#FEF3C7',
    success: '#047857',
    warning: '#B45309',
    danger: '#DC2626',
    dangerSoft: '#FEE2E2',
    overlay: 'rgba(15,23,42,0.45)',
  },
  dark: {
    bg: '#0B0D12',
    surface: '#151821',
    surfaceAlt: '#1E2230',
    text: '#E8EAF0',
    textMuted: '#9AA3B5',
    border: '#262B38',
    accent: '#8B93FF',
    accentSoft: '#23264A',
    onAccent: '#0B0D12',
    bubbleMe: '#3B37B8',
    bubbleMeText: '#FFFFFF',
    bubbleThem: '#1E2230',
    imported: '#FCD34D',
    importedSoft: '#3A2E10',
    success: '#34D399',
    warning: '#FBBF24',
    danger: '#F87171',
    dangerSoft: '#3B1717',
    overlay: 'rgba(0,0,0,0.6)',
  },
};

export type Colors = typeof palette.light;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };
export const type = {
  title: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.4 },
  heading: { fontSize: 20, fontWeight: '700' as const },
  subheading: { fontSize: 16, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14, lineHeight: 19 },
  caption: { fontSize: 12, lineHeight: 16 },
};

/** Width at which we switch from stacked mobile screens to sidebar + split view. */
export const WIDE_BREAKPOINT = 768;
