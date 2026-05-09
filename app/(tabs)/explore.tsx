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
            <Markdown style={markdownStyles}>{selected?.result ?? ""}</Markdown>
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

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: "#f5f5f5" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 16, textAlign: "center" },
  filterRow: { marginBottom: 16 },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    marginRight: 8,
  },
  filterChipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  filterChipText: { color: "#64748b", fontSize: 13, fontWeight: "600" },
  filterChipTextActive: { color: "#fff" },
  subFilterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  passFailRow: { flexDirection: "row", gap: 8 },
  sortButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  sortButtonText: { color: "#2563eb", fontSize: 13, fontWeight: "600" },
  empty: { textAlign: "center", color: "#999", fontSize: 16, marginTop: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  cardHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  subject: { fontWeight: "bold", color: "#2563eb", fontSize: 14 },
  date: { color: "#999", fontSize: 12 },
  scoreBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  scoreBadgeText: { fontSize: 12, fontWeight: "bold" },
  question: { fontSize: 14, color: "#333", marginBottom: 8 },
  result: { fontSize: 13, color: "#666", marginBottom: 4 },
  tapHint: { fontSize: 12, color: "#2563eb", textAlign: "right", marginTop: 4 },
  modalContainer: { flex: 1, backgroundColor: "#f5f5f5" },
  modalHeader: {
    backgroundColor: "#2563eb",
    padding: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  modalSubject: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  modalDate: { color: "#bfdbfe", fontSize: 13 },
  modalScoreBadge: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  modalScoreText: { color: "#2563eb", fontSize: 20, fontWeight: "bold" },
  modalScroll: { flex: 1, padding: 20 },
  sectionLabel: { fontSize: 15, fontWeight: "bold", color: "#2563eb", marginTop: 16, marginBottom: 8 },
  sectionText: {
    fontSize: 14,
    color: "#333",
    lineHeight: 22,
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  modalFooter: {
    flexDirection: "row",
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  closeButton: { flex: 1, backgroundColor: "#2563eb", padding: 14, borderRadius: 10, alignItems: "center" },
  closeButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  deleteButtonModal: { flex: 1, backgroundColor: "#fee2e2", padding: 14, borderRadius: 10, alignItems: "center" },
  deleteButtonModalText: { color: "#dc2626", fontWeight: "bold", fontSize: 16 },
});

const markdownStyles = {
  body: { fontSize: 15, lineHeight: 24, color: "#333" },
  heading1: { fontSize: 20, fontWeight: "bold" as const, color: "#1e40af", marginVertical: 8 },
  heading2: { fontSize: 17, fontWeight: "bold" as const, color: "#2563eb", marginVertical: 6 },
  heading3: { fontSize: 15, fontWeight: "bold" as const, color: "#3b82f6", marginVertical: 4 },
  strong: { fontWeight: "bold" as const },
  bullet_list: { marginVertical: 4 },
  list_item: { marginVertical: 2 },
};
