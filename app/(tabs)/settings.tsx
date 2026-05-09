import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme, ThemeMode } from '@/contexts/ThemeContext';
import { AppColors } from '@/constants/theme';

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: string; desc: string }[] = [
  { mode: 'system', label: 'システム設定に連動', icon: '⚙️', desc: 'デバイスの設定に合わせて自動切替' },
  { mode: 'light', label: 'ライトモード', icon: '☀️', desc: '明るい画面で表示' },
  { mode: 'dark', label: 'ダークモード', icon: '🌙', desc: '暗い画面で表示（目に優しい）' },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, themeMode, setThemeMode, isDark } = useAppTheme();
  const styles = createStyles(colors);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24, paddingTop: insets.top + 16 }]}
    >
      <Text style={styles.pageTitle}>⚙️ 設定</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🌓 テーマ設定</Text>
        <Text style={styles.sectionDesc}>アプリの表示テーマを選択してください</Text>

        {THEME_OPTIONS.map((opt) => {
          const isActive = themeMode === opt.mode;
          return (
            <TouchableOpacity
              key={opt.mode}
              style={[styles.optionRow, isActive && styles.optionRowActive]}
              onPress={() => setThemeMode(opt.mode)}
              activeOpacity={0.7}
            >
              <Text style={styles.optionIcon}>{opt.icon}</Text>
              <View style={styles.optionInfo}>
                <Text style={[styles.optionLabel, isActive && styles.optionLabelActive]}>
                  {opt.label}
                </Text>
                <Text style={styles.optionDesc}>{opt.desc}</Text>
              </View>
              <View style={[styles.radioOuter, isActive && styles.radioOuterActive]}>
                {isActive && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔵 現在の状態</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>表示テーマ</Text>
          <View style={[styles.statusBadge, isDark && styles.statusBadgeDark]}>
            <Text style={[styles.statusBadgeText, isDark && styles.statusBadgeTextDark]}>
              {isDark ? '🌙 ダーク' : '☀️ ライト'}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    scroll: { backgroundColor: colors.screenBg },
    container: { padding: 16 },
    pageTitle: { fontSize: 22, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 20 },
    section: {
      backgroundColor: colors.cardBg,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    sectionTitle: { fontSize: 15, fontWeight: 'bold', color: colors.textAccent, marginBottom: 4 },
    sectionDesc: { fontSize: 13, color: colors.textSecondary, marginBottom: 14 },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.cardBorder,
      marginBottom: 10,
      backgroundColor: colors.inputBg,
    },
    optionRowActive: {
      borderColor: colors.accent,
      backgroundColor: colors.accentBg,
    },
    optionIcon: { fontSize: 22, marginRight: 12 },
    optionInfo: { flex: 1 },
    optionLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    optionLabelActive: { color: colors.accent },
    optionDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    radioOuter: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.inputBorderAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOuterActive: { borderColor: colors.accent },
    radioInner: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.accent },
    statusRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
    },
    statusLabel: { fontSize: 14, color: colors.textSecondary },
    statusBadge: {
      backgroundColor: colors.accentBg,
      paddingVertical: 4,
      paddingHorizontal: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.accentBorder,
    },
    statusBadgeDark: {
      backgroundColor: colors.purpleBg,
      borderColor: colors.purpleBorder,
    },
    statusBadgeText: { fontSize: 13, fontWeight: '600', color: colors.accent },
    statusBadgeTextDark: { color: colors.purple },
  });
}
