import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { Colors, AppColors } from '@/constants/theme';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

type ThemeContextType = {
  colorScheme: ColorScheme;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  colors: AppColors;
  isDark: boolean;
};

const STORAGE_KEY = 'themeMode_v1';

const ThemeContext = createContext<ThemeContextType>({
  colorScheme: 'light',
  themeMode: 'system',
  setThemeMode: () => {},
  colors: Colors.light,
  isDark: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme() ?? 'light';
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val === 'light' || val === 'dark' || val === 'system') {
        setThemeModeState(val);
      }
    });
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(STORAGE_KEY, mode);
  }, []);

  const colorScheme: ColorScheme = themeMode === 'system' ? systemScheme : themeMode;
  const colors = Colors[colorScheme];
  const isDark = colorScheme === 'dark';

  return (
    <ThemeContext.Provider value={{ colorScheme, themeMode, setThemeMode, colors, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
