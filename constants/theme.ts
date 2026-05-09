import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,

    screenBg: '#f1f5f9',
    screenBgAlt: '#f0f4ff',
    cardBg: '#fff',
    inputBg: '#f8fafc',
    statCardBg: '#f8fafc',
    iosBg: '#F2F2F7',
    modalBg: '#fff',

    cardBorder: '#e2e8f0',
    cardBorderBlue: '#dbeafe',
    divider: '#e5e7eb',
    inputBorder: '#e2e8f0',
    inputBorderAlt: '#cbd5e1',
    iosBorder: '#E5E5EA',
    iosBorderLight: '#D1D1D6',
    borderAlt: '#93c5fd',

    textPrimary: '#1e293b',
    textSecondary: '#64748b',
    textMuted: '#94a3b8',
    textAccent: '#1e40af',
    textInverse: '#fff',
    iosTextPrimary: '#1C1C1E',
    iosTextSecondary: '#3A3A3C',
    iosTextMuted: '#8E8E93',
    iosTextSubtle: '#C7C7CC',

    accent: '#2563eb',
    accentDark: '#1e40af',
    accentBg: '#eff6ff',
    accentBorder: '#bfdbfe',
    iosAccent: '#007AFF',

    purple: '#7c3aed',
    purpleBg: '#f5f3ff',
    purpleBorder: '#c4b5fd',
    purpleLight: '#ddd6fe',

    successBg: '#dcfce7',
    successBorder: '#86efac',
    successText: '#16a34a',
    successDark: '#166534',
    successDarker: '#14532d',

    warningBg: '#fef3c7',
    warningBorder: '#fcd34d',
    warningText: '#d97706',
    warningDark: '#92400e',
    warningBgAlt: '#fffbeb',
    warningBorderAlt: '#fde68a',
    amberText: '#854d0e',
    amberTextDark: '#78350f',

    dangerBg: '#fee2e2',
    dangerBorder: '#fca5a5',
    dangerText: '#dc2626',
    dangerBgAlt: '#fef2f2',
    dangerBorderAlt: '#fecaca',

    orangeBg: '#fff7ed',
    orangeBorder: '#fed7aa',
    orangeText: '#ea580c',
    orangeTextDark: '#9a3412',
    orange: '#f97316',

    infoBg: '#f0f9ff',
    infoBorder: '#bae6fd',
    infoText: '#0369a1',
    infoBgAlt: '#EEF4FF',

    cyan: '#0891b2',

    overlay: 'rgba(0,0,0,0.45)',
    overlayDark: 'rgba(10,12,20,0.84)',

    graphLine: '#e5e7eb',
    graphLabel: '#9CA3AF',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,

    screenBg: '#0f172a',
    screenBgAlt: '#0f172a',
    cardBg: '#1e293b',
    inputBg: '#1e293b',
    statCardBg: '#0f172a',
    iosBg: '#1C1C1E',
    modalBg: '#1e293b',

    cardBorder: '#334155',
    cardBorderBlue: '#334155',
    divider: '#334155',
    inputBorder: '#334155',
    inputBorderAlt: '#475569',
    iosBorder: '#3A3A3C',
    iosBorderLight: '#48484A',
    borderAlt: '#1d4ed8',

    textPrimary: '#f1f5f9',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    textAccent: '#93c5fd',
    textInverse: '#fff',
    iosTextPrimary: '#EBEBF5',
    iosTextSecondary: '#b0b0ba',
    iosTextMuted: '#636366',
    iosTextSubtle: '#48484A',

    accent: '#3b82f6',
    accentDark: '#2563eb',
    accentBg: '#1e3a5f',
    accentBorder: '#1d4ed8',
    iosAccent: '#0A84FF',

    purple: '#a78bfa',
    purpleBg: '#2e1065',
    purpleBorder: '#6d28d9',
    purpleLight: '#7c3aed',

    successBg: '#14532d',
    successBorder: '#166534',
    successText: '#4ade80',
    successDark: '#86efac',
    successDarker: '#dcfce7',

    warningBg: '#451a03',
    warningBorder: '#78350f',
    warningText: '#fb923c',
    warningDark: '#fed7aa',
    warningBgAlt: '#451a03',
    warningBorderAlt: '#78350f',
    amberText: '#fcd34d',
    amberTextDark: '#fde68a',

    dangerBg: '#450a0a',
    dangerBorder: '#7f1d1d',
    dangerText: '#f87171',
    dangerBgAlt: '#450a0a',
    dangerBorderAlt: '#7f1d1d',

    orangeBg: '#431407',
    orangeBorder: '#7c2d12',
    orangeText: '#fb923c',
    orangeTextDark: '#fed7aa',
    orange: '#fb923c',

    infoBg: '#0c4a6e',
    infoBorder: '#0e7490',
    infoText: '#38bdf8',
    infoBgAlt: '#0c2a4e',

    cyan: '#22d3ee',

    overlay: 'rgba(0,0,0,0.7)',
    overlayDark: 'rgba(10,12,20,0.92)',

    graphLine: '#334155',
    graphLabel: '#64748b',
  },
};

export type AppColors = typeof Colors.light;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
