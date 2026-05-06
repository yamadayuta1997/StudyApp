import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

const API_BASE_URL = "https://studyapp-production-66d5.up.railway.app";

const SUBJECTS = ["財務会計論", "管理会計論", "監査論", "企業法", "租税法", "経営学"];

type DashboardStats = {
  totalCount: number;
  todayCount: number;
  streak: number;
  avgScore: number | null;
  weakestSubject: string | null;
  recentSubjects: string[];
};

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<DashboardStats>({
    totalCount: 0,
    todayCount: 0,
    streak: 0,
    avgScore: null,
    weakestSubject: null,
    recentSubjects: [],
  });
  const [dailyTip, setDailyTip] = useState("");
  const [tipLoading, setTipLoading] = useState(false);

  useFocusEffect(useCallback(() => {
    loadStats();
  }, []));

  const loadStats = async () => {
    const raw = await AsyncStorage.getItem("history");
    const history = raw ? JSON.parse(raw) : [];
    const today = new Date().toLocaleDateString("ja-JP");

    const todayItems = history.filter((h: any) => h.date === today);
    const validScores = history.filter((h: any) => h.score !== null && h.score !== undefined);
    const avgScore = validScores.length > 0
      ? Math.round(validScores.reduce((a: number, b: any) => a + b.score, 0) / validScores.length)
      : null;

    // 連続学習日数
    const dates = [...new Set(history.map((h: any) => h.date))] as string[];
    let streak = 0;
    const checkDate = new Date();
    for (let i = 0; i < 30; i++) {
      const d = checkDate.toLocaleDateString("ja-JP");
      if (dates.includes(d)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (i === 0) {
        // 今日やっていなければ昨日からカウント
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    // 苦手科目
    const subjectScores: Record<string, number[]> = {};
    SUBJECTS.forEach(s => subjectScores[s] = []);
    history.forEach((h: any) => {
      if (h.subject && h.score !== null && h.score !== undefined) {
        subjectScores[h.subject]?.push(h.score);
      }
    });
    let weakest: string | null = null;
    let lowestAvg = 101;
    SUBJECTS.forEach(s => {
      const scores = subjectScores[s];
      if (scores.length > 0) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        if (avg < lowestAvg) { lowestAvg = avg; weakest = s; }
      }
    });

    // 最近練習した科目（重複除外・直近3つ）
    const recent = history
      .slice()
      .reverse()
      .map((h: any) => h.subject)
      .filter((s: string, i: number, arr: string[]) => arr.indexOf(s) === i)
      .slice(0, 3);

    setStats({ totalCount: history.length, todayCount: todayItems.length, streak, avgScore, weakestSubject: weakest, recentSubjects: recent });
  };

  const getDailyTip = async () => {
    setTipLoading(true);
    setDailyTip("");
    try {
      const subject = stats.weakestSubject || "財務会計論";

      const raw = await AsyncStorage.getItem("history");
      const history: any[] = raw ? JSON.parse(raw) : [];
      const subjectHistory = history.filter((h) => h.subject === subject);

      // Count wrong topics across all subject history
      const topicCounts: Record<string, number> = {};
      subjectHistory.forEach((h) => {
        (h.wrongTopics || []).forEach((t: string) => {
          topicCounts[t] = (topicCounts[t] || 0) + 1;
        });
      });
      const wrongTopicsRanked = Object.entries(topicCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([topic, count]) => ({ topic, count }));

      // Detect improved topics: had errors in older history but not in most recent 5 sessions
      const recentHistory = subjectHistory.slice(-5);
      const olderHistory = subjectHistory.slice(0, -5);
      const recentWrong = new Set<string>();
      recentHistory.forEach((h) => (h.wrongTopics || []).forEach((t: string) => recentWrong.add(t)));
      const olderWrong = new Set<string>();
      olderHistory.forEach((h) => (h.wrongTopics || []).forEach((t: string) => olderWrong.add(t)));
      const improvedTopics = [...olderWrong].filter((t) => !recentWrong.has(t));

      const response = await fetch(`${API_BASE_URL}/study-tip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, avgScore: stats.avgScore, wrongTopicsRanked, improvedTopics }),
      });
      const data = await response.json();
      setDailyTip(data.tip);
    } catch {
      setDailyTip("アドバイスの取得に失敗しました。");
    } finally {
      setTipLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 20 }]}>
      {/* ヘッダー */}
      <View style={styles.hero}>
        <Text style={styles.emoji}>📚</Text>
        <Text style={styles.title}>会計士試験</Text>
        <Text style={styles.titleSub}>学習アプリ</Text>
        <Text style={styles.subtitle}>AIが答案を採点・フィードバック</Text>
      </View>

      {/* 学習状況ダッシュボード */}
      {stats.totalCount > 0 && (
        <View style={styles.dashboard}>
          <Text style={styles.dashboardTitle}>📈 学習状況</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.totalCount}</Text>
              <Text style={styles.statLabel}>累計採点数</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: "#2563eb" }]}>{stats.todayCount}</Text>
              <Text style={styles.statLabel}>今日の採点</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: "#d97706" }]}>{stats.streak}日</Text>
              <Text style={styles.statLabel}>連続学習</Text>
            </View>
            {stats.avgScore !== null && (
              <View style={styles.statCard}>
                <Text style={[styles.statValue, { color: stats.avgScore >= 70 ? "#16a34a" : stats.avgScore >= 50 ? "#d97706" : "#dc2626" }]}>
                  {stats.avgScore}%
                </Text>
                <Text style={styles.statLabel}>平均得点率</Text>
              </View>
            )}
          </View>

          {stats.weakestSubject && (
            <View style={styles.weakAlert}>
              <Text style={styles.weakAlertText}>⚠️ 要強化：{stats.weakestSubject}</Text>
            </View>
          )}

          {stats.recentSubjects.length > 0 && (
            <View style={styles.recentRow}>
              <Text style={styles.recentLabel}>最近練習：</Text>
              {stats.recentSubjects.map(s => (
                <View key={s} style={styles.recentChip}>
                  <Text style={styles.recentChipText}>{s}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* 今日のアドバイス */}
      <View style={styles.tipSection}>
        <TouchableOpacity style={styles.tipButton} onPress={getDailyTip} disabled={tipLoading}>
          {tipLoading ? (
            <View style={styles.tipButtonContent}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.tipButtonText}>AI生成中...</Text>
            </View>
          ) : (
            <Text style={styles.tipButtonText}>
              💡 {stats.weakestSubject ? `${stats.weakestSubject}の学習アドバイスを見る` : "今日の学習アドバイスを見る"}
            </Text>
          )}
        </TouchableOpacity>
        {dailyTip !== "" && (
          <View style={styles.tipCard}>
            <Text style={styles.tipCardTitle}>
              {stats.weakestSubject ? `📘 ${stats.weakestSubject} アドバイス` : "📘 今日の学習アドバイス"}
            </Text>
            <Text style={styles.tipCardText}>{dailyTip}</Text>
          </View>
        )}
      </View>

      {/* メニューカード */}
      <View style={styles.menuGrid}>
        <TouchableOpacity style={[styles.menuCard, isTablet && { minWidth: "28%" }]} onPress={() => router.push("/(tabs)/answer")}>
          <Text style={styles.menuEmoji}>✏️</Text>
          <Text style={styles.menuTitle}>答案採点</Text>
          <Text style={styles.menuDesc}>問題文と答案を入力してAIが即採点</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.menuCard, isTablet && { minWidth: "28%" }]} onPress={() => router.push("/(tabs)/analytics")}>
          <Text style={styles.menuEmoji}>📊</Text>
          <Text style={styles.menuTitle}>苦手分析</Text>
          <Text style={styles.menuDesc}>科目別の得点率と学習アドバイス</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.menuCard, isTablet && { minWidth: "28%" }]} onPress={() => router.push("/(tabs)/explore")}>
          <Text style={styles.menuEmoji}>📋</Text>
          <Text style={styles.menuTitle}>採点履歴</Text>
          <Text style={styles.menuDesc}>過去の採点結果をいつでも確認</Text>
        </TouchableOpacity>
      </View>

      {/* 採点スタートボタン */}
      <TouchableOpacity style={styles.button} onPress={() => router.push("/(tabs)/answer")}>
        <Text style={styles.buttonText}>今すぐ問題を解く →</Text>
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: "#eff6ff" },
  container: { alignItems: "center", padding: 24 },
  hero: { alignItems: "center", marginBottom: 24 },
  emoji: { fontSize: 56, marginBottom: 8 },
  title: { fontSize: 32, fontWeight: "bold", color: "#1e3a8a" },
  titleSub: { fontSize: 28, fontWeight: "bold", color: "#2563eb", marginBottom: 4 },
  subtitle: { fontSize: 15, color: "#64748b" },
  dashboard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#dbeafe",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  dashboardTitle: { fontSize: 16, fontWeight: "bold", color: "#1e40af", marginBottom: 14 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  statCard: {
    flex: 1,
    minWidth: 70,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  statValue: { fontSize: 22, fontWeight: "bold", color: "#1e293b" },
  statLabel: { fontSize: 11, color: "#64748b", marginTop: 2, textAlign: "center" },
  weakAlert: {
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
    marginBottom: 10,
  },
  weakAlertText: { color: "#dc2626", fontSize: 13, fontWeight: "600" },
  recentRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  recentLabel: { fontSize: 12, color: "#64748b" },
  recentChip: {
    backgroundColor: "#eff6ff",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  recentChipText: { fontSize: 11, color: "#2563eb", fontWeight: "600" },
  tipSection: { width: "100%", marginBottom: 20 },
  tipButton: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    marginBottom: 10,
  },
  tipButtonContent: { flexDirection: "row", alignItems: "center", gap: 8 },
  tipButtonText: { color: "#fff", fontSize: 15, fontWeight: "bold" },
  tipCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderLeftWidth: 4,
    borderLeftColor: "#2563eb",
  },
  tipCardTitle: { fontSize: 14, fontWeight: "bold", color: "#1e40af", marginBottom: 8 },
  tipCardText: { fontSize: 14, color: "#334155", lineHeight: 22 },
  menuGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24, width: "100%" },
  menuCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#dbeafe",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  menuEmoji: { fontSize: 28, marginBottom: 8 },
  menuTitle: { fontSize: 14, fontWeight: "bold", color: "#1e40af", marginBottom: 4 },
  menuDesc: { fontSize: 11, color: "#64748b", textAlign: "center", lineHeight: 16 },
  button: {
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
});
