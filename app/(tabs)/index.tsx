import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { supabase } from "@/utils/supabase";
import { getCautionTopics, getOverdueReviewTopics, CautionTopic } from "@/utils/cautionTopics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAppTheme } from "@/contexts/ThemeContext";
import { AppColors } from "@/constants/theme";

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

const MENU_ITEMS = [
  { route: "/(tabs)/answer", emoji: "✏️", title: "答案採点", desc: "問題文と答案をAIが即採点" },
  { route: "/(tabs)/compare", emoji: "🔄", title: "比較添削", desc: "答案を比較してフィードバック" },
  { route: "/(tabs)/analytics", emoji: "📊", title: "苦手分析", desc: "科目別の得点率を分析" },
  { route: "/(tabs)/calendar", emoji: "📅", title: "カレンダー", desc: "学習スケジュールを管理" },
  { route: "/(tabs)/textbook", emoji: "📖", title: "教科書", desc: "教科書を登録・参照" },
  { route: "/(tabs)/explore", emoji: "📋", title: "採点履歴", desc: "過去の採点結果を確認" },
] as const;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
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
  const [cautionTopics, setCautionTopics] = useState<CautionTopic[]>([]);
  const [overdueTopics, setOverdueTopics] = useState<CautionTopic[]>([]);
  const [userName, setUserName] = useState("受験生");
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingName, setEditingName] = useState("");

  useFocusEffect(
    useCallback(() => {
      loadStats();
      loadUserName();
    }, [])
  );

  const loadUserName = async () => {
    const stored = await AsyncStorage.getItem("userName");
    if (stored) setUserName(stored);
  };

  const saveUserName = async () => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      Alert.alert("エラー", "名前を入力してください");
      return;
    }
    await AsyncStorage.setItem("userName", trimmed);
    setUserName(trimmed);
    setEditModalVisible(false);
  };

  const handleLogout = () => {
    Alert.alert("ログアウト", "ログアウトしますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "ログアウト",
        style: "destructive",
        onPress: async () => { await supabase.auth.signOut(); },
      },
    ]);
  };

  const loadStats = async () => {
    const raw = await AsyncStorage.getItem("history");
    const history = raw ? JSON.parse(raw) : [];
    const today = new Date().toLocaleDateString("ja-JP");

    const todayItems = history.filter((h: any) => h.date === today);
    const validScores = history.filter((h: any) => h.score !== null && h.score !== undefined);
    const avgScore =
      validScores.length > 0
        ? Math.round(
            validScores.reduce((a: number, b: any) => a + b.score, 0) / validScores.length
          )
        : null;

    const dates = [...new Set(history.map((h: any) => h.date))] as string[];
    let streak = 0;
    const checkDate = new Date();
    for (let i = 0; i < 30; i++) {
      const d = checkDate.toLocaleDateString("ja-JP");
      if (dates.includes(d)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (i === 0) {
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    const subjectScores: Record<string, number[]> = {};
    SUBJECTS.forEach((s) => (subjectScores[s] = []));
    history.forEach((h: any) => {
      if (h.subject && h.score !== null && h.score !== undefined) {
        subjectScores[h.subject]?.push(h.score);
      }
    });
    let weakest: string | null = null;
    let lowestAvg = 101;
    SUBJECTS.forEach((s) => {
      const scores = subjectScores[s];
      if (scores.length > 0) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        if (avg < lowestAvg) {
          lowestAvg = avg;
          weakest = s;
        }
      }
    });

    const recent = history
      .slice()
      .reverse()
      .map((h: any) => h.subject)
      .filter((s: string, i: number, arr: string[]) => arr.indexOf(s) === i)
      .slice(0, 3);

    setStats({
      totalCount: history.length,
      todayCount: todayItems.length,
      streak,
      avgScore,
      weakestSubject: weakest,
      recentSubjects: recent,
    });

    const caution = await getCautionTopics();
    setCautionTopics(caution);

    const overdue = await getOverdueReviewTopics();
    setOverdueTopics(overdue);
  };

  const getDailyTip = async () => {
    setTipLoading(true);
    setDailyTip("");
    try {
      const subject = stats.weakestSubject || "財務会計論";
      const raw = await AsyncStorage.getItem("history");
      const history: any[] = raw ? JSON.parse(raw) : [];
      const subjectHistory = history.filter((h) => h.subject === subject);

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

  const scoreColor =
    stats.avgScore === null
      ? "#64748b"
      : stats.avgScore >= 70
      ? "#16a34a"
      : stats.avgScore >= 50
      ? "#d97706"
      : "#dc2626";

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 20, paddingTop: insets.top + 16 }]}
      >
        {/* ユーザープロフィール */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{userName.charAt(0)}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{userName}</Text>
            <Text style={styles.profileSub}>公認会計士試験 受験生</Text>
          </View>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => {
              setEditingName(userName);
              setEditModalVisible(true);
            }}
          >
            <Text style={styles.editButtonText}>編集</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>ログアウト</Text>
          </TouchableOpacity>
        </View>

        {/* 学習進捗サマリー */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>📈 学習進捗</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.totalCount}</Text>
              <Text style={styles.statLabel}>累計採点</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: "#2563eb" }]}>{stats.todayCount}</Text>
              <Text style={styles.statLabel}>今日の採点</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: "#d97706" }]}>{stats.streak}日</Text>
              <Text style={styles.statLabel}>連続学習</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: scoreColor }]}>
                {stats.avgScore !== null ? `${stats.avgScore}%` : "—"}
              </Text>
              <Text style={styles.statLabel}>平均得点率</Text>
            </View>
          </View>

          {stats.weakestSubject && (
            <View style={styles.weakAlert}>
              <Text style={styles.weakAlertText}>⚠️ 要強化：{stats.weakestSubject}</Text>
            </View>
          )}

          {cautionTopics.length > 0 && (
            <View style={styles.cautionAlert}>
              <Text style={styles.cautionAlertTitle}>🚨 要注意論点 {cautionTopics.length}件</Text>
              {cautionTopics.slice(0, 3).map(({ topic, subject }) => (
                <Text key={`${subject}::${topic}`} style={styles.cautionAlertItem}>・{topic}（{subject}）</Text>
              ))}
              {cautionTopics.length > 3 && (
                <Text style={styles.cautionAlertMore}>他 {cautionTopics.length - 3} 件 → 苦手分析で確認</Text>
              )}
            </View>
          )}

          {overdueTopics.length > 0 && (
            <View style={styles.reminderCard}>
              <Text style={styles.reminderTitle}>📅 今日の復習</Text>
              <Text style={styles.reminderSummary}>
                {overdueTopics.slice(0, 3).map((t) => t.topic).join("・")}
                {overdueTopics.length > 3 ? "・他" : ""}論点
              </Text>
              {overdueTopics.slice(0, 5).map(({ topic, subject, daysSinceReview }) => (
                <TouchableOpacity
                  key={`${subject}::${topic}`}
                  style={styles.reminderItem}
                  onPress={() =>
                    router.push(`/(tabs)/explore?subject=${encodeURIComponent(subject)}` as any)
                  }
                >
                  <View style={styles.reminderItemLeft}>
                    <Text style={styles.reminderItemTopic}>・{topic}</Text>
                    <Text style={styles.reminderItemMeta}>
                      {subject}{daysSinceReview != null ? `・${daysSinceReview}日未復習` : ""}
                    </Text>
                  </View>
                  <Text style={styles.reminderItemArrow}>→</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {stats.recentSubjects.length > 0 && (
            <View style={styles.recentRow}>
              <Text style={styles.recentLabel}>最近：</Text>
              {stats.recentSubjects.map((s) => (
                <View key={s} style={styles.recentChip}>
                  <Text style={styles.recentChipText}>{s}</Text>
                </View>
              ))}
            </View>
          )}

          {stats.totalCount === 0 && (
            <Text style={styles.emptyStats}>まだ採点履歴がありません。さっそく問題を解いてみましょう！</Text>
          )}
        </View>

        {/* 機能ショートカット */}
        <Text style={styles.menuHeading}>機能メニュー</Text>
        <View style={styles.menuGrid}>
          {MENU_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.route}
              style={styles.menuCard}
              onPress={() => router.push(item.route as any)}
            >
              <Text style={styles.menuEmoji}>{item.emoji}</Text>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuDesc}>{item.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* AI学習アドバイス */}
        <View style={styles.tipSection}>
          <TouchableOpacity style={styles.tipButton} onPress={getDailyTip} disabled={tipLoading}>
            {tipLoading ? (
              <View style={styles.tipButtonContent}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.tipButtonText}>AI生成中...</Text>
              </View>
            ) : (
              <Text style={styles.tipButtonText}>
                💡 {stats.weakestSubject ? `${stats.weakestSubject}の学習アドバイス` : "今日の学習アドバイス"}
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
      </ScrollView>

      {/* ユーザー名編集モーダル */}
      <Modal visible={editModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>名前を編集</Text>
            <TextInput
              style={styles.modalInput}
              value={editingName}
              onChangeText={setEditingName}
              placeholder="名前を入力"
              maxLength={20}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.modalBtnCancelText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSave]} onPress={saveUserName}>
                <Text style={styles.modalBtnSaveText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    scroll: { backgroundColor: colors.screenBgAlt },
    container: { padding: 16 },

    profileCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.cardBg,
      borderRadius: 16,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.cardBorderBlue,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
    },
    avatarCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    avatarText: { fontSize: 22, fontWeight: "bold", color: colors.textInverse },
    profileInfo: { flex: 1 },
    profileName: { fontSize: 18, fontWeight: "bold", color: colors.textPrimary },
    profileSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    editButton: {
      backgroundColor: colors.accentBg,
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.accentBorder,
    },
    editButtonText: { fontSize: 12, color: colors.accent, fontWeight: "600" },
    logoutButton: {
      marginLeft: 8,
      backgroundColor: colors.dangerBgAlt,
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: colors.dangerBorderAlt,
    },
    logoutButtonText: { fontSize: 12, color: colors.dangerText, fontWeight: "600" },

    sectionCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 16,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.cardBorderBlue,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
    },
    sectionTitle: { fontSize: 15, fontWeight: "bold", color: colors.textAccent, marginBottom: 12 },
    statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
    statCard: {
      flex: 1,
      minWidth: 70,
      backgroundColor: colors.statCardBg,
      borderRadius: 10,
      padding: 12,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    statValue: { fontSize: 22, fontWeight: "bold", color: colors.textPrimary },
    statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2, textAlign: "center" },
    weakAlert: {
      backgroundColor: colors.dangerBgAlt,
      borderRadius: 8,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.dangerBorderAlt,
      marginBottom: 10,
    },
    weakAlertText: { color: colors.dangerText, fontSize: 13, fontWeight: "600" },
    cautionAlert: {
      backgroundColor: colors.warningBgAlt,
      borderRadius: 10,
      padding: 12,
      marginTop: 10,
      borderWidth: 1,
      borderColor: colors.warningBorder,
    },
    cautionAlertTitle: { fontSize: 13, fontWeight: "700", color: colors.warningDark, marginBottom: 6 },
    cautionAlertItem: { fontSize: 12, color: colors.amberTextDark, marginBottom: 2 },
    cautionAlertMore: { fontSize: 11, color: colors.warningText, marginTop: 4 },
    recentRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
    recentLabel: { fontSize: 12, color: colors.textSecondary },
    recentChip: {
      backgroundColor: colors.accentBg,
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.accentBorder,
    },
    recentChipText: { fontSize: 11, color: colors.accent, fontWeight: "600" },
    emptyStats: { fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 20, paddingVertical: 4 },

    reminderCard: {
      backgroundColor: colors.successBg,
      borderRadius: 10,
      padding: 12,
      marginTop: 10,
      borderWidth: 1,
      borderColor: colors.successBorder,
    },
    reminderTitle: { fontSize: 13, fontWeight: "700", color: colors.successDark, marginBottom: 4 },
    reminderSummary: { fontSize: 12, color: colors.successText, marginBottom: 8 },
    reminderItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 6,
      borderTopWidth: 1,
      borderTopColor: colors.successBorder,
    },
    reminderItemLeft: { flex: 1 },
    reminderItemTopic: { fontSize: 13, color: colors.successDarker, fontWeight: "600" },
    reminderItemMeta: { fontSize: 11, color: colors.successText, marginTop: 1 },
    reminderItemArrow: { fontSize: 14, color: colors.successText, marginLeft: 8 },

    menuHeading: { fontSize: 15, fontWeight: "bold", color: colors.textAccent, marginBottom: 10 },
    menuGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
    menuCard: {
      width: "47%",
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      padding: 14,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.cardBorderBlue,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
    },
    menuEmoji: { fontSize: 26, marginBottom: 6 },
    menuTitle: { fontSize: 13, fontWeight: "bold", color: colors.textAccent, marginBottom: 3 },
    menuDesc: { fontSize: 10, color: colors.textSecondary, textAlign: "center", lineHeight: 14 },

    tipSection: { marginBottom: 8 },
    tipButton: {
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 20,
      alignItems: "center",
      marginBottom: 10,
    },
    tipButtonContent: { flexDirection: "row", alignItems: "center", gap: 8 },
    tipButtonText: { color: colors.textInverse, fontSize: 14, fontWeight: "bold" },
    tipCard: {
      backgroundColor: colors.cardBg,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      borderLeftWidth: 4,
      borderLeftColor: colors.accent,
    },
    tipCardTitle: { fontSize: 13, fontWeight: "bold", color: colors.textAccent, marginBottom: 8 },
    tipCardText: { fontSize: 13, color: colors.textSecondary, lineHeight: 21 },

    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "center",
      alignItems: "center",
    },
    modalContent: {
      backgroundColor: colors.cardBg,
      borderRadius: 16,
      padding: 24,
      width: "80%",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
    },
    modalTitle: { fontSize: 17, fontWeight: "bold", color: colors.textPrimary, marginBottom: 14 },
    modalInput: {
      borderWidth: 1,
      borderColor: colors.inputBorderAlt,
      borderRadius: 10,
      padding: 12,
      fontSize: 15,
      color: colors.textPrimary,
      backgroundColor: colors.inputBg,
      marginBottom: 16,
    },
    modalButtons: { flexDirection: "row", gap: 10 },
    modalBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
    modalBtnCancel: { backgroundColor: colors.statCardBg, borderWidth: 1, borderColor: colors.cardBorder },
    modalBtnCancelText: { fontSize: 14, color: colors.textSecondary, fontWeight: "600" },
    modalBtnSave: { backgroundColor: colors.accent },
    modalBtnSaveText: { fontSize: 14, color: colors.textInverse, fontWeight: "bold" },
  });
}
