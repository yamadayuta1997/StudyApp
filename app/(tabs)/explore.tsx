import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { applyFilters, PassFailFilter, SortOrder } from "../../utils/historyFilter";
import { useAppTheme } from "@/contexts/ThemeContext";
import { AppColors } from "@/constants/theme";

export type HistoryItem = {
  id: string;
  subject: string;
  question: string;
  answer: string;
  result: string;
  score: number | null;
  date: string;
  topics?: string[];
  wrongTopics?: string[];
};

function ScoreBadge({ score }: { score: number | null }) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  if (score === null) return null;
  const color = score >= 70 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";
  const bg = score >= 70 ? "#dcfce7" : score >= 50 ? "#fef3c7" : "#fee2e2";
  return (
    <View style={[styles.scoreBadge, { backgroundColor: bg, borderColor: color }]}>
      <Text style={[styles.scoreBadgeText, { color }]}>{score}%</Text>
    </View>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const mdStyles = createMarkdownStyles(colors);
  const params = useLocalSearchParams<{ subject?: string }>();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selected, setSelected] = useState<HistoryItem | null>(null);
  const [filterSubject, setFilterSubject] = useState<string | null>(params.subject ?? null);
  const [passFailFilter, setPassFailFilter] = useState<PassFailFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  const loadHistory = async () => {
    const raw = await AsyncStorage.getItem("history");
    if (raw) setHistory(JSON.parse(raw));
  };

  useFocusEffect(useCallback(() => { loadHistory(); }, []));

  useEffect(() => {
    if (params.subject) setFilterSubject(params.subject);
  }, [params.subject]);

  const deleteItem = async (id: string) => {
    const newHistory = history.filter((h) => h.id !== id);
    setHistory(newHistory);
    await AsyncStorage.setItem("history", JSON.stringify(newHistory));
    setSelected(null);
  };

  const subjects = [...new Set(history.map(h => h.subject))];

  const filtered = applyFilters(history, filterSubject, passFailFilter, sortOrder);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <ScrollView contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 20 }]}>
      <Text style={styles.title}>📋 採点履歴</Text>

      {/* 科目フィルター */}
      {subjects.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, filterSubject === null && styles.filterChipActive]}
            onPress={() => setFilterSubject(null)}
          >
            <Text style={[styles.filterChipText, filterSubject === null && styles.filterChipTextActive]}>
              すべて
            </Text>
          </TouchableOpacity>
          {subjects.map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.filterChip, filterSubject === s && styles.filterChipActive]}
              onPress={() => setFilterSubject(s)}
            >
              <Text style={[styles.filterChipText, filterSubject === s && styles.filterChipTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* 合否フィルター + 日付ソート */}
      <View style={styles.subFilterRow}>
        <View style={styles.passFailRow}>
          {(["all", "pass", "fail"] as PassFailFilter[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, passFailFilter === f && styles.filterChipActive]}
              onPress={() => setPassFailFilter(f)}
            >
              <Text style={[styles.filterChipText, passFailFilter === f && styles.filterChipTextActive]}>
                {f === "all" ? "合否すべて" : f === "pass" ? "合格" : "不合格"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => setSortOrder(o => o === "newest" ? "oldest" : "newest")}
        >
          <Text style={styles.sortButtonText}>
            {sortOrder === "newest" ? "新しい順 ↓" : "古い順 ↑"}
          </Text>
        </TouchableOpacity>
      </View>

      {filtered.length === 0 && (
        <Text style={styles.empty}>まだ履歴がありません</Text>
      )}

      {filtered.map((item) => (
        <TouchableOpacity key={item.id} style={styles.card} onPress={() => setSelected(item)}>
          <View style={styles.cardHeader}>
            <Text style={styles.subject}>{item.subject}</Text>
            <View style={styles.cardHeaderRight}>
              <ScoreBadge score={item.score} />
              <Text style={styles.date}>{item.date}</Text>
            </View>
          </View>
          <Text style={styles.question} numberOfLines={2}>{item.question}</Text>
          <Text style={styles.result} numberOfLines={3}>{item.result}</Text>
          <Text style={styles.tapHint}>タップして詳細を見る →</Text>
        </TouchableOpacity>
      ))}

      {/* 詳細モーダル */}
      <Modal visible={selected !== null} animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalContainer}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 16 }]}>
            <View>
              <Text style={styles.modalSubject}>{selected?.subject}</Text>
              <Text style={styles.modalDate}>{selected?.date}</Text>
            </View>
            {selected?.score !== null && selected?.score !== undefined && (
              <View style={styles.modalScoreBadge}>
                <Text style={styles.modalScoreText}>{selected.score}%</Text>
              </View>
            )}
          </View>

          <ScrollView style={styles.modalScroll}>
            <Text style={styles.sectionLabel}>📄 問題文</Text>
            <Text style={styles.sectionText}>{selected?.question}</Text>

            <Text style={styles.sectionLabel}>✏️ あなたの答案</Text>
            <Text style={styles.sectionText}>{selected?.answer}</Text>

            <Text style={styles.sectionLabel}>📊 採点結果</Text>
            <Markdown style={mdStyles}>{selected?.result ?? ""}</Markdown>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.closeButton} onPress={() => setSelected(null)}>
              <Text style={styles.closeButtonText}>閉じる</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteButtonModal}
              onPress={() => selected && deleteItem(selected.id)}
            >
              <Text style={styles.deleteButtonModalText}>削除</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    container: { padding: 24, backgroundColor: colors.screenBg },
    title: { fontSize: 24, fontWeight: "bold", marginBottom: 16, textAlign: "center", color: colors.textPrimary },
    filterRow: { marginBottom: 16 },
    filterChip: {
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: colors.inputBorderAlt,
      backgroundColor: colors.inputBg,
      marginRight: 8,
    },
    filterChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    filterChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
    filterChipTextActive: { color: colors.textInverse },
    subFilterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
    passFailRow: { flexDirection: "row", gap: 8 },
    sortButton: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: colors.accent,
      backgroundColor: colors.accentBg,
    },
    sortButtonText: { color: colors.accent, fontSize: 13, fontWeight: "600" },
    empty: { textAlign: "center", color: colors.textMuted, fontSize: 16, marginTop: 40 },
    card: {
      backgroundColor: colors.cardBg,
      borderRadius: 10,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
    cardHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    subject: { fontWeight: "bold", color: colors.accent, fontSize: 14 },
    date: { color: colors.textMuted, fontSize: 12 },
    scoreBadge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1 },
    scoreBadgeText: { fontSize: 12, fontWeight: "bold" },
    question: { fontSize: 14, color: colors.textPrimary, marginBottom: 8 },
    result: { fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
    tapHint: { fontSize: 12, color: colors.accent, textAlign: "right", marginTop: 4 },
    modalContainer: { flex: 1, backgroundColor: colors.screenBg },
    modalHeader: {
      backgroundColor: colors.accent,
      padding: 24,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
    },
    modalSubject: { color: colors.textInverse, fontSize: 20, fontWeight: "bold" },
    modalDate: { color: colors.accentBorder, fontSize: 13 },
    modalScoreBadge: { backgroundColor: colors.cardBg, borderRadius: 12, paddingVertical: 4, paddingHorizontal: 12 },
    modalScoreText: { color: colors.accent, fontSize: 20, fontWeight: "bold" },
    modalScroll: { flex: 1, padding: 20 },
    sectionLabel: { fontSize: 15, fontWeight: "bold", color: colors.accent, marginTop: 16, marginBottom: 8 },
    sectionText: {
      fontSize: 14,
      color: colors.textPrimary,
      lineHeight: 22,
      backgroundColor: colors.cardBg,
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    modalFooter: {
      flexDirection: "row",
      padding: 20,
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      backgroundColor: colors.cardBg,
    },
    closeButton: { flex: 1, backgroundColor: colors.accent, padding: 14, borderRadius: 10, alignItems: "center" },
    closeButtonText: { color: colors.textInverse, fontWeight: "bold", fontSize: 16 },
    deleteButtonModal: { flex: 1, backgroundColor: colors.dangerBg, padding: 14, borderRadius: 10, alignItems: "center" },
    deleteButtonModalText: { color: colors.dangerText, fontWeight: "bold", fontSize: 16 },
  });
}

function createMarkdownStyles(colors: AppColors) {
  return {
    body: { fontSize: 15, lineHeight: 24, color: colors.textPrimary },
    heading1: { fontSize: 20, fontWeight: "bold" as const, color: colors.textAccent, marginVertical: 8 },
    heading2: { fontSize: 17, fontWeight: "bold" as const, color: colors.accent, marginVertical: 6 },
    heading3: { fontSize: 15, fontWeight: "bold" as const, color: colors.accent, marginVertical: 4 },
    strong: { fontWeight: "bold" as const },
    bullet_list: { marginVertical: 4 },
    list_item: { marginVertical: 2 },
  };
}
