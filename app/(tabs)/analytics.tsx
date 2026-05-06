import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { getCautionTopics, CautionTopic } from "@/utils/cautionTopics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { HistoryItem } from "./explore";

const API_BASE_URL = "https://studyapp-production-66d5.up.railway.app";

const SUBJECTS = ["財務会計論", "管理会計論", "監査論", "企業法", "租税法", "経営学"];

type SubjectStats = {
  subject: string;
  count: number;
  avgScore: number | null;
  lastScore: number | null;
  trend: "up" | "down" | "stable" | null;
};

function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return (
    <View style={styles.barContainer}>
      <Text style={styles.noDataText}>データなし</Text>
    </View>
  );
  const color = score >= 70 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";
  return (
    <View style={styles.barContainer}>
      <View style={[styles.barTrack]}>
        <View style={[styles.barFill, { width: `${score}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[styles.barScore, { color }]}>{score}%</Text>
    </View>
  );
}

function TrendIcon({ trend }: { trend: "up" | "down" | "stable" | null }) {
  if (!trend) return null;
  if (trend === "up") return <Text style={{ color: "#16a34a", fontSize: 16 }}>↑</Text>;
  if (trend === "down") return <Text style={{ color: "#dc2626", fontSize: 16 }}>↓</Text>;
  return <Text style={{ color: "#64748b", fontSize: 16 }}>→</Text>;
}

export default function AnalyticsScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<SubjectStats[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [studyTip, setStudyTip] = useState("");
  const [tipSubject, setTipSubject] = useState("");
  const [tipLoading, setTipLoading] = useState(false);
  const [top5WrongTopics, setTop5WrongTopics] = useState<{ topic: string; count: number }[]>([]);
  const [cautionTopics, setCautionTopics] = useState<CautionTopic[]>([]);

  useFocusEffect(useCallback(() => { loadAnalytics(); }, []));

  const loadAnalytics = async () => {
    const raw = await AsyncStorage.getItem("history");
    const history: HistoryItem[] = raw ? JSON.parse(raw) : [];
    setTotalCount(history.length);

    const subjectData: Record<string, number[]> = {};
    SUBJECTS.forEach(s => subjectData[s] = []);

    history.forEach(item => {
      if (item.subject && subjectData[item.subject] !== undefined && item.score !== null && item.score !== undefined) {
        subjectData[item.subject].push(item.score);
      } else if (item.subject && subjectData[item.subject] !== undefined) {
        subjectData[item.subject].push(-1);
      }
    });

    const statsArr: SubjectStats[] = SUBJECTS.map(subject => {
      const allScores = subjectData[subject];
      const validScores = allScores.filter(s => s >= 0);
      const count = allScores.length;
      const avgScore = validScores.length > 0
        ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
        : null;
      const lastScore = validScores.length > 0 ? validScores[validScores.length - 1] : null;

      let trend: "up" | "down" | "stable" | null = null;
      if (validScores.length >= 2) {
        const diff = validScores[validScores.length - 1] - validScores[validScores.length - 2];
        trend = diff > 5 ? "up" : diff < -5 ? "down" : "stable";
      }

      return { subject, count, avgScore, lastScore, trend };
    });

    statsArr.sort((a, b) => {
      if (a.avgScore === null && b.avgScore === null) return 0;
      if (a.avgScore === null) return 1;
      if (b.avgScore === null) return -1;
      return a.avgScore - b.avgScore;
    });

    setStats(statsArr);

    // 苦手論点 TOP5 集計
    const wrongTopicsCount: Record<string, number> = {};
    history.forEach(item => {
      if (item.wrongTopics) {
        item.wrongTopics.forEach((t: string) => {
          wrongTopicsCount[t] = (wrongTopicsCount[t] || 0) + 1;
        });
      }
    });
    const top5 = Object.entries(wrongTopicsCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, count]) => ({ topic, count }));
    setTop5WrongTopics(top5);

    const caution = await getCautionTopics();
    setCautionTopics(caution);
  };

  const getStudyTip = async (subject: string, avgScore: number | null) => {
    setTipSubject(subject);
    setStudyTip("");
    setTipLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/study-tip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, avgScore }),
      });
      const data = await response.json();
      setStudyTip(data.tip);
    } catch {
      setStudyTip("学習ヒントの取得に失敗しました。");
    } finally {
      setTipLoading(false);
    }
  };

  const weakSubjects = stats.filter(s => s.avgScore !== null && s.avgScore < 60);
  const untried = stats.filter(s => s.count === 0);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <ScrollView contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 20 }]}>
      <Text style={styles.title}>📊 苦手分析</Text>

      {/* サマリー */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{totalCount}</Text>
          <Text style={styles.summaryLabel}>総採点数</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: "#dc2626" }]}>{weakSubjects.length}</Text>
          <Text style={styles.summaryLabel}>要強化科目</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: "#94a3b8" }]}>{untried.length}</Text>
          <Text style={styles.summaryLabel}>未練習科目</Text>
        </View>
      </View>

      {/* 要注意論点 */}
      {cautionTopics.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚠️ 要注意論点（3回連続ミス）</Text>
          {cautionTopics.map(({ topic, subject, streak }) => (
            <View key={`${subject}::${topic}`} style={styles.cautionRow}>
              <View style={styles.cautionInfo}>
                <Text style={styles.cautionTopic}>{topic}</Text>
                <Text style={styles.cautionSubject}>{subject}</Text>
              </View>
              <View style={styles.cautionBadge}>
                <Text style={styles.cautionBadgeText}>{streak}連続ミス</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* 苦手論点 TOP5 */}
      {top5WrongTopics.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔴 苦手論点 TOP5</Text>
          {top5WrongTopics.map(({ topic, count }, i) => (
            <View key={topic} style={styles.wrongTopicRow}>
              <Text style={styles.wrongTopicRank}>#{i + 1}</Text>
              <Text style={styles.wrongTopicName}>{topic}</Text>
              <View style={styles.wrongTopicBadge}>
                <Text style={styles.wrongTopicBadgeText}>{count}回</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* 科目別得点率 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>科目別 平均得点率（弱い順）</Text>
        <View style={isTablet ? styles.subjectGrid : undefined}>
        {stats.map(stat => (
          <View key={stat.subject} style={[styles.subjectRow, isTablet && styles.subjectRowTablet]}>
            <View style={styles.subjectInfo}>
              <View style={styles.subjectNameRow}>
                <Text style={styles.subjectName}>{stat.subject}</Text>
                <TrendIcon trend={stat.trend} />
              </View>
              <Text style={styles.subjectCount}>{stat.count}回練習</Text>
            </View>
            <View style={styles.subjectBar}>
              <ScoreBar score={stat.avgScore} />
            </View>
            <TouchableOpacity
              style={styles.tipButton}
              onPress={() => getStudyTip(stat.subject, stat.avgScore)}
            >
              <Text style={styles.tipButtonText}>ヒント</Text>
            </TouchableOpacity>
          </View>
        ))}
        </View>
      </View>

      {/* 学習ヒント */}
      {(tipLoading || studyTip !== "") && (
        <View style={styles.tipCard}>
          <Text style={styles.tipTitle}>💡 {tipSubject} 学習アドバイス</Text>
          <View style={styles.tipDivider} />
          {tipLoading ? (
            <View style={styles.tipLoadingRow}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={styles.tipLoadingText}>AIがアドバイスを生成中...</Text>
            </View>
          ) : (
            <Markdown style={markdownStyles}>{studyTip}</Markdown>
          )}
        </View>
      )}

      {/* 未練習科目のお知らせ */}
      {untried.length > 0 && (
        <View style={styles.untriedCard}>
          <Text style={styles.untriedTitle}>📝 まだ練習していない科目</Text>
          <Text style={styles.untriedText}>{untried.map(s => s.subject).join("・")}</Text>
        </View>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#f1f5f9" },
  title: { fontSize: 24, fontWeight: "bold", textAlign: "center", marginBottom: 20, color: "#1e293b" },
  summaryRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  summaryCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  summaryValue: { fontSize: 28, fontWeight: "bold", color: "#2563eb" },
  summaryLabel: { fontSize: 12, color: "#64748b", marginTop: 4 },
  section: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  sectionTitle: { fontSize: 15, fontWeight: "bold", color: "#1e40af", marginBottom: 16 },
  subjectGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  subjectRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 8,
  },
  subjectRowTablet: {
    width: "48%",
    marginBottom: 14,
  },
  subjectInfo: { width: 80 },
  subjectNameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  subjectName: { fontSize: 12, fontWeight: "bold", color: "#1e293b", flexShrink: 1 },
  subjectCount: { fontSize: 10, color: "#94a3b8", marginTop: 2 },
  subjectBar: { flex: 1 },
  barContainer: { flexDirection: "row", alignItems: "center", gap: 8 },
  barTrack: {
    flex: 1,
    height: 10,
    backgroundColor: "#e2e8f0",
    borderRadius: 5,
    overflow: "hidden",
  },
  barFill: { height: 10, borderRadius: 5 },
  barScore: { fontSize: 12, fontWeight: "bold", width: 36, textAlign: "right" },
  noDataText: { fontSize: 11, color: "#94a3b8" },
  tipButton: {
    backgroundColor: "#eff6ff",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  tipButtonText: { color: "#2563eb", fontSize: 11, fontWeight: "600" },
  tipCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderLeftWidth: 4,
    borderLeftColor: "#2563eb",
  },
  tipTitle: { fontSize: 16, fontWeight: "bold", color: "#1e40af", marginBottom: 8 },
  tipDivider: { height: 1, backgroundColor: "#e2e8f0", marginBottom: 12 },
  tipLoadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  tipLoadingText: { color: "#64748b", fontSize: 14 },
  untriedCard: {
    backgroundColor: "#fefce8",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  untriedTitle: { fontSize: 14, fontWeight: "bold", color: "#92400e", marginBottom: 8 },
  untriedText: { fontSize: 14, color: "#78350f", lineHeight: 22 },
  wrongTopicRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 },
  wrongTopicRank: { fontSize: 13, fontWeight: "bold", color: "#dc2626", width: 28 },
  wrongTopicName: { flex: 1, fontSize: 14, color: "#1e293b", fontWeight: "600" },
  wrongTopicBadge: {
    backgroundColor: "#fee2e2",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  wrongTopicBadgeText: { color: "#dc2626", fontSize: 12, fontWeight: "bold" },
  cautionRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 },
  cautionInfo: { flex: 1 },
  cautionTopic: { fontSize: 14, fontWeight: "600", color: "#1e293b" },
  cautionSubject: { fontSize: 11, color: "#64748b", marginTop: 2 },
  cautionBadge: {
    backgroundColor: "#fef3c7",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fcd34d",
  },
  cautionBadgeText: { color: "#92400e", fontSize: 12, fontWeight: "bold" },
});

const markdownStyles = {
  body: { fontSize: 14, lineHeight: 22, color: "#334155" },
  heading1: { fontSize: 18, fontWeight: "bold" as const, color: "#1e40af", marginVertical: 8 },
  heading2: { fontSize: 15, fontWeight: "bold" as const, color: "#2563eb", marginVertical: 6 },
  heading3: { fontSize: 14, fontWeight: "bold" as const, color: "#3b82f6", marginVertical: 4 },
  strong: { fontWeight: "bold" as const },
  bullet_list: { marginVertical: 4 },
  list_item: { marginVertical: 2 },
};
