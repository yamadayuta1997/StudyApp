import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
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
import {
  computeStreak,
  formatDate,
  generateTasksFromWorkbooks,
  getRemainingDays,
  StreakInfo,
  StudyTask,
  Workbook,
} from "../../utils/calendarUtils";

const SUBJECTS = ["財務会計論", "管理会計論", "監査論", "企業法", "租税法", "経営学"];
const DAYS_OF_WEEK = ["日", "月", "火", "水", "木", "金", "土"];

type CalendarCell = {
  date: string;
  day: number;
  inMonth: boolean;
};

function todayStr(): string {
  return formatDate(new Date());
}

function getCalendarGrid(year: number, month: number): CalendarCell[] {
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const startDow = firstOfMonth.getDay();
  const grid: CalendarCell[] = [];
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    grid.push({ date: formatDate(d), day: d.getDate(), inMonth: false });
  }
  for (let d = 1; d <= lastOfMonth.getDate(); d++) {
    grid.push({ date: formatDate(new Date(year, month, d)), day: d, inMonth: true });
  }
  let nextDay = 1;
  while (grid.length < 42) {
    const d = new Date(year, month + 1, nextDay++);
    grid.push({ date: formatDate(d), day: d.getDate(), inMonth: false });
  }
  return grid;
}

const EMPTY_WORKBOOK: Omit<Workbook, "id"> = {
  name: "", subject: SUBJECTS[0], pages: 0, rounds: 1, order: 1,
};

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [workbooks, setWorkbooks] = useState<Workbook[]>([]);
  const [examDate, setExamDate] = useState("");
  const [generating, setGenerating] = useState(false);

  const [showWorkbookModal, setShowWorkbookModal] = useState(false);
  const [editingWorkbook, setEditingWorkbook] = useState<Workbook | null>(null);
  const [wbForm, setWbForm] = useState(EMPTY_WORKBOOK);

  const [streak, setStreak] = useState<StreakInfo>({ currentStreak: 0, longestStreak: 0, studiedDates: new Set() });

  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskSubject, setNewTaskSubject] = useState(SUBJECTS[0]);
  const [newTaskMinutes, setNewTaskMinutes] = useState("60");

  useFocusEffect(useCallback(() => { load(); }, []));

  const load = async () => {
    const [rawExam, rawWorkbooks, rawTasks, rawHistory] = await Promise.all([
      AsyncStorage.getItem("examDate_v2"),
      AsyncStorage.getItem("workbooks_v2"),
      AsyncStorage.getItem("studyTasks_v2"),
      AsyncStorage.getItem("history"),
    ]);
    if (rawExam) setExamDate(rawExam);
    if (rawWorkbooks) setWorkbooks(JSON.parse(rawWorkbooks));
    if (rawTasks) setTasks(JSON.parse(rawTasks));
    const historyItems: { date: string }[] = rawHistory ? JSON.parse(rawHistory) : [];
    setStreak(computeStreak(historyItems.map(h => h.date)));
  };

  const saveExamDate = async (v: string) => {
    setExamDate(v);
    await AsyncStorage.setItem("examDate_v2", v);
  };

  const saveWorkbooks = async (wbs: Workbook[]) => {
    setWorkbooks(wbs);
    await AsyncStorage.setItem("workbooks_v2", JSON.stringify(wbs));
  };

  const saveTasks = async (t: StudyTask[]) => {
    setTasks(t);
    await AsyncStorage.setItem("studyTasks_v2", JSON.stringify(t));
  };

  const openAddWorkbook = () => {
    const nextOrder = workbooks.length > 0
      ? Math.max(...workbooks.map(w => w.order)) + 1
      : 1;
    setEditingWorkbook(null);
    setWbForm({ ...EMPTY_WORKBOOK, order: nextOrder });
    setShowWorkbookModal(true);
  };

  const openEditWorkbook = (wb: Workbook) => {
    setEditingWorkbook(wb);
    setWbForm({ name: wb.name, subject: wb.subject, pages: wb.pages, rounds: wb.rounds, order: wb.order });
    setShowWorkbookModal(true);
  };

  const handleSaveWorkbook = async () => {
    if (!wbForm.name.trim()) {
      Alert.alert("問題集名を入力してください");
      return;
    }
    if (wbForm.pages <= 0) {
      Alert.alert("ページ数を入力してください");
      return;
    }
    if (editingWorkbook) {
      const updated = workbooks.map(w =>
        w.id === editingWorkbook.id ? { ...wbForm, id: w.id } : w
      );
      await saveWorkbooks(updated);
    } else {
      const newWb: Workbook = { ...wbForm, id: `wb_${Date.now()}` };
      await saveWorkbooks([...workbooks, newWb]);
    }
    setShowWorkbookModal(false);
  };

  const handleDeleteWorkbook = async (id: string) => {
    Alert.alert("削除確認", "この問題集を削除しますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除", style: "destructive",
        onPress: async () => {
          await saveWorkbooks(workbooks.filter(w => w.id !== id));
        },
      },
    ]);
  };

  const handleGenerateTasks = async () => {
    if (!examDate) {
      Alert.alert("試験日を設定してください");
      return;
    }
    if (workbooks.length === 0) {
      Alert.alert("問題集を登録してください", "1冊以上の問題集を登録してからタスクを自動作成してください。");
      return;
    }
    const remaining = getRemainingDays(examDate);
    if (!remaining || remaining <= 0) {
      Alert.alert("試験日が過去の日付です。正しい試験日を設定してください。");
      return;
    }
    setGenerating(true);
    const newTasks = generateTasksFromWorkbooks(examDate, workbooks);
    await saveTasks(newTasks);
    setGenerating(false);
    const totalPages = workbooks.reduce((s, w) => s + w.pages * w.rounds, 0);
    const pagesPerDay = Math.ceil(totalPages / remaining);
    Alert.alert(
      "タスク自動作成完了",
      `${newTasks.length}件のタスクを作成しました。\n` +
      `残り${remaining}日 / 合計${totalPages}ページ\n` +
      `1日あたり約${pagesPerDay}ページ`
    );
  };

  const toggleTask = async (id: string) => {
    const updated = tasks.map(t => t.id === id ? { ...t, done: !t.done } : t);
    await saveTasks(updated);
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    const customTask: StudyTask = {
      id: `${selectedDate}_custom_${Date.now()}`,
      date: selectedDate,
      subject: newTaskSubject,
      workbookId: "custom",
      workbookName: "手動追加",
      round: 0,
      title: newTaskTitle.trim(),
      startPage: 0,
      endPage: parseInt(newTaskMinutes) || 60,
      done: false,
    };
    await saveTasks([...tasks, customTask]);
    setShowAddTask(false);
    setNewTaskTitle("");
    setNewTaskMinutes("60");
  };

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentYear(y => y - 1); setCurrentMonth(11); }
    else setCurrentMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentYear(y => y + 1); setCurrentMonth(0); }
    else setCurrentMonth(m => m + 1);
  };

  const grid = getCalendarGrid(currentYear, currentMonth);
  const today = todayStr();
  const selectedTasks = tasks.filter(t => t.date === selectedDate);
  const remaining = getRemainingDays(examDate);
  const sortedWorkbooks = [...workbooks].sort((a, b) => a.order - b.order);

  const getTaskStats = (date: string) => {
    const dayTasks = tasks.filter(t => t.date === date);
    if (dayTasks.length === 0) return null;
    const done = dayTasks.filter(t => t.done).length;
    return { total: dayTasks.length, done };
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 20 }]}>
        <Text style={styles.title}>📅 学習カレンダー</Text>

        {/* ストリーク */}
        <View style={styles.streakCard}>
          <View style={styles.streakMain}>
            <Text style={styles.streakFire}>🔥</Text>
            <View>
              <Text style={styles.streakCount}>{streak.currentStreak}日連続学習中</Text>
              <Text style={styles.streakSub}>最長記録: {streak.longestStreak}日</Text>
            </View>
          </View>
        </View>

        {/* 試験日 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🎯 試験日設定</Text>
          <View style={styles.row}>
            <Text style={styles.label}>試験日</Text>
            <TextInput
              style={styles.input}
              value={examDate}
              onChangeText={saveExamDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
            />
          </View>
          {remaining !== null && (
            <Text style={styles.remainingText}>
              残り <Text style={styles.remainingNum}>{remaining}</Text> 日
            </Text>
          )}
        </View>

        {/* 問題集リスト */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>📚 問題集登録</Text>
            <TouchableOpacity style={styles.addButton} onPress={openAddWorkbook}>
              <Text style={styles.addButtonText}>＋ 追加</Text>
            </TouchableOpacity>
          </View>

          {sortedWorkbooks.length === 0 ? (
            <Text style={styles.emptyText}>問題集が登録されていません</Text>
          ) : (
            sortedWorkbooks.map(wb => (
              <View key={wb.id} style={styles.wbRow}>
                <View style={styles.wbOrderBadge}>
                  <Text style={styles.wbOrderText}>{wb.order}</Text>
                </View>
                <View style={styles.wbInfo}>
                  <Text style={styles.wbName}>{wb.name}</Text>
                  <Text style={styles.wbMeta}>{wb.subject} · {wb.pages}ページ · {wb.rounds}周</Text>
                </View>
                <TouchableOpacity style={styles.wbEditBtn} onPress={() => openEditWorkbook(wb)}>
                  <Text style={styles.wbEditBtnText}>編集</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.wbDeleteBtn} onPress={() => handleDeleteWorkbook(wb.id)}>
                  <Text style={styles.wbDeleteBtnText}>削除</Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          {workbooks.length > 0 && examDate && remaining && remaining > 0 && (
            <View style={styles.summaryBox}>
              <Text style={styles.summaryText}>
                合計: {workbooks.reduce((s, w) => s + w.pages * w.rounds, 0)}ページ ÷ {remaining}日 ≈{" "}
                <Text style={styles.summaryNum}>
                  {Math.ceil(workbooks.reduce((s, w) => s + w.pages * w.rounds, 0) / remaining)}ページ/日
                </Text>
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.generateButton, generating && styles.generateButtonDisabled]}
            onPress={handleGenerateTasks}
            disabled={generating}
          >
            <Text style={styles.generateButtonText}>
              {generating ? "作成中..." : "🗓️ タスク自動作成"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* カレンダー */}
        <View style={styles.card}>
          <View style={styles.calNav}>
            <TouchableOpacity style={styles.navBtn} onPress={prevMonth}>
              <Text style={styles.navBtnText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.calMonth}>{currentYear}年{currentMonth + 1}月</Text>
            <TouchableOpacity style={styles.navBtn} onPress={nextMonth}>
              <Text style={styles.navBtnText}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.weekRow}>
            {DAYS_OF_WEEK.map((d, i) => (
              <View key={d} style={styles.weekCell}>
                <Text style={[styles.weekLabel, i === 0 && { color: "#dc2626" }, i === 6 && { color: "#2563eb" }]}>{d}</Text>
              </View>
            ))}
          </View>
          <View style={styles.gridContainer}>
            {grid.map((cell, idx) => {
              const stats = getTaskStats(cell.date);
              const ratio = stats ? stats.done / stats.total : 0;
              const hasHistory = cell.inMonth && streak.studiedDates.has(cell.date);
              const bgColor = !stats ? "transparent"
                : ratio >= 1 ? colors.accent
                : ratio >= 0.5 ? colors.borderAlt
                : colors.accentBg;
              const isSelected = cell.date === selectedDate;
              const isToday = cell.date === today;
              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.dayCell,
                    { backgroundColor: bgColor },
                    isSelected && styles.dayCellSelected,
                    isToday && !isSelected && styles.dayCellToday,
                  ]}
                  onPress={() => setSelectedDate(cell.date)}
                >
                  <Text style={[
                    styles.dayText,
                    !cell.inMonth && styles.dayTextOther,
                    isSelected && { color: colors.textInverse, fontWeight: "bold" },
                    idx % 7 === 0 && cell.inMonth && { color: colors.dangerText },
                    idx % 7 === 6 && cell.inMonth && { color: colors.accent },
                    ratio >= 1 && { color: colors.textInverse },
                  ]}>
                    {cell.day}
                  </Text>
                  {stats && (
                    <Text style={[styles.taskCount, ratio >= 1 && { color: colors.textInverse }]}>
                      {stats.done}/{stats.total}
                    </Text>
                  )}
                  {hasHistory && !stats && (
                    <View style={styles.studyDot} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* タスクリスト */}
        <View style={styles.card}>
          <View style={styles.taskHeader}>
            <Text style={styles.taskDate}>{selectedDate} のタスク</Text>
            <TouchableOpacity style={styles.addButton} onPress={() => setShowAddTask(true)}>
              <Text style={styles.addButtonText}>＋ 追加</Text>
            </TouchableOpacity>
          </View>
          {selectedTasks.length === 0 ? (
            <Text style={styles.emptyText}>タスクがありません</Text>
          ) : (
            selectedTasks.map(task => (
              <TouchableOpacity key={task.id} style={styles.taskCard} onPress={() => toggleTask(task.id)}>
                <View style={[styles.checkbox, task.done && styles.checkboxDone]}>
                  {task.done && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={styles.taskInfo}>
                  <View style={styles.taskTitleRow}>
                    <View style={styles.subjectChip}>
                      <Text style={styles.subjectChipText}>{task.subject}</Text>
                    </View>
                    <Text style={[styles.taskTitle, task.done && styles.taskTitleDone]}>{task.title}</Text>
                  </View>
                  {task.startPage > 0 && (
                    <Text style={styles.taskMeta}>
                      {task.workbookName}（第{task.round}周）· p.{task.startPage}–{task.endPage}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      {/* 問題集追加/編集モーダル */}
      <Modal visible={showWorkbookModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowWorkbookModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingWorkbook ? "問題集を編集" : "問題集を追加"}</Text>
              <TouchableOpacity onPress={() => setShowWorkbookModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.fieldLabel}>問題集名</Text>
              <TextInput
                style={styles.fieldInput}
                value={wbForm.name}
                onChangeText={v => setWbForm(f => ({ ...f, name: v }))}
                placeholder="例：財務会計論 計算問題集"
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.fieldLabel}>教科</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                {SUBJECTS.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, wbForm.subject === s && styles.chipActive]}
                    onPress={() => setWbForm(f => ({ ...f, subject: s }))}
                  >
                    <Text style={[styles.chipText, wbForm.subject === s && styles.chipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.fieldLabel}>ページ数</Text>
              <TextInput
                style={styles.fieldInput}
                value={wbForm.pages > 0 ? String(wbForm.pages) : ""}
                onChangeText={v => setWbForm(f => ({ ...f, pages: parseInt(v) || 0 }))}
                keyboardType="numeric"
                placeholder="例：300"
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.fieldLabel}>周回数</Text>
              <View style={styles.chipRow}>
                {[1, 2, 3, 4, 5].map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.chip, wbForm.rounds === n && styles.chipActive]}
                    onPress={() => setWbForm(f => ({ ...f, rounds: n }))}
                  >
                    <Text style={[styles.chipText, wbForm.rounds === n && styles.chipTextActive]}>{n}周</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>順番（学習順序）</Text>
              <TextInput
                style={styles.fieldInput}
                value={String(wbForm.order)}
                onChangeText={v => setWbForm(f => ({ ...f, order: parseInt(v) || 1 }))}
                keyboardType="numeric"
                placeholder="1"
                placeholderTextColor="#94a3b8"
              />
              <Text style={styles.fieldHint}>数字が小さい順に学習します（1 → 2 → 3...）</Text>

              <TouchableOpacity style={styles.submitButton} onPress={handleSaveWorkbook}>
                <Text style={styles.submitButtonText}>{editingWorkbook ? "更新" : "追加"}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* カスタムタスク追加モーダル */}
      <Modal visible={showAddTask} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddTask(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>タスクを追加</Text>
              <TouchableOpacity onPress={() => setShowAddTask(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.fieldLabel}>科目</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                {SUBJECTS.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, newTaskSubject === s && styles.chipActive]}
                    onPress={() => setNewTaskSubject(s)}
                  >
                    <Text style={[styles.chipText, newTaskSubject === s && styles.chipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.fieldLabel}>タスク名</Text>
              <TextInput
                style={styles.fieldInput}
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
                placeholder="タスクの内容"
                placeholderTextColor="#94a3b8"
              />
              <Text style={styles.fieldLabel}>目安時間（分）</Text>
              <TextInput
                style={styles.fieldInput}
                value={newTaskMinutes}
                onChangeText={setNewTaskMinutes}
                keyboardType="numeric"
                placeholder="60"
                placeholderTextColor="#94a3b8"
              />
              <TouchableOpacity style={styles.submitButton} onPress={handleAddTask}>
                <Text style={styles.submitButtonText}>追加</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    scroll: { backgroundColor: colors.screenBg },
    container: { padding: 16 },
    title: { fontSize: 22, fontWeight: "bold", color: colors.textPrimary, marginBottom: 16, textAlign: "center" },

    streakCard: {
      backgroundColor: colors.orangeBg,
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.orangeBorder,
    },
    streakMain: { flexDirection: "row", alignItems: "center", gap: 12 },
    streakFire: { fontSize: 36 },
    streakCount: { fontSize: 18, fontWeight: "bold", color: colors.orangeText },
    streakSub: { fontSize: 13, color: colors.orangeTextDark, marginTop: 2 },

    studyDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.orange, marginTop: 1 },

    card: {
      backgroundColor: colors.cardBg,
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    cardTitle: { fontSize: 15, fontWeight: "bold", color: colors.textAccent },

    row: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 10 },
    label: { fontSize: 13, color: colors.textSecondary, width: 50 },
    input: {
      flex: 1,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      borderRadius: 8,
      padding: 8,
      fontSize: 14,
      color: colors.textPrimary,
      backgroundColor: colors.inputBg,
    },

    remainingText: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
    remainingNum: { fontSize: 20, fontWeight: "bold", color: colors.accent },

    addButton: {
      backgroundColor: colors.accentBg,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.accentBorder,
    },
    addButtonText: { color: colors.accent, fontSize: 13, fontWeight: "600" },

    emptyText: { textAlign: "center", color: colors.textMuted, fontSize: 14, paddingVertical: 16 },

    wbRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.screenBg, gap: 8 },
    wbOrderBadge: {
      width: 26, height: 26, borderRadius: 13,
      backgroundColor: colors.accentBg, borderWidth: 1, borderColor: colors.accentBorder,
      alignItems: "center", justifyContent: "center",
    },
    wbOrderText: { fontSize: 12, fontWeight: "bold", color: colors.accent },
    wbInfo: { flex: 1 },
    wbName: { fontSize: 14, fontWeight: "600", color: colors.textPrimary, marginBottom: 2 },
    wbMeta: { fontSize: 12, color: colors.textSecondary },
    wbEditBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: colors.inputBorderAlt },
    wbEditBtnText: { fontSize: 12, color: colors.textSecondary },
    wbDeleteBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: colors.dangerBorder, backgroundColor: colors.dangerBgAlt },
    wbDeleteBtnText: { fontSize: 12, color: colors.dangerText },

    summaryBox: { backgroundColor: colors.infoBg, borderRadius: 8, padding: 10, marginTop: 12, marginBottom: 4 },
    summaryText: { fontSize: 13, color: colors.infoText, textAlign: "center" },
    summaryNum: { fontWeight: "bold", fontSize: 15 },

    generateButton: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center",
      marginTop: 12,
    },
    generateButtonDisabled: { backgroundColor: colors.textMuted },
    generateButtonText: { color: colors.textInverse, fontSize: 14, fontWeight: "bold" },

    calNav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    navBtn: { padding: 8 },
    navBtnText: { fontSize: 24, color: colors.accent, fontWeight: "bold" },
    calMonth: { fontSize: 16, fontWeight: "bold", color: colors.textPrimary },

    weekRow: { flexDirection: "row", marginBottom: 4 },
    weekCell: { flex: 1, alignItems: "center" },
    weekLabel: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
    gridContainer: { flexDirection: "row", flexWrap: "wrap" },
    dayCell: {
      width: "14.2857%",
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 6,
      borderWidth: 1,
      borderColor: "transparent",
    },
    dayCellSelected: { borderColor: colors.accent, borderWidth: 2 },
    dayCellToday: { borderColor: colors.borderAlt, borderWidth: 1.5 },
    dayText: { fontSize: 13, color: colors.textPrimary },
    dayTextOther: { color: colors.cardBorder },
    taskCount: { fontSize: 9, color: colors.textSecondary },

    taskHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
    taskDate: { fontSize: 14, fontWeight: "bold", color: colors.textAccent },
    taskCard: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10, gap: 10 },
    checkbox: {
      width: 24, height: 24, borderRadius: 6,
      borderWidth: 2, borderColor: colors.inputBorderAlt,
      alignItems: "center", justifyContent: "center", marginTop: 2,
    },
    checkboxDone: { backgroundColor: colors.accent, borderColor: colors.accent },
    checkmark: { color: colors.textInverse, fontSize: 14, fontWeight: "bold" },
    taskInfo: { flex: 1 },
    taskTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 },
    subjectChip: {
      backgroundColor: colors.accentBg,
      paddingVertical: 2, paddingHorizontal: 7,
      borderRadius: 10, borderWidth: 1, borderColor: colors.accentBorder,
    },
    subjectChipText: { color: colors.accent, fontSize: 11, fontWeight: "600" },
    taskTitle: { fontSize: 14, color: colors.textPrimary, flex: 1 },
    taskTitleDone: { color: colors.textMuted, textDecorationLine: "line-through" },
    taskMeta: { fontSize: 12, color: colors.textMuted },

    modal: { flex: 1, backgroundColor: colors.inputBg },
    modalHeader: {
      backgroundColor: colors.accentDark,
      padding: 20,
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    },
    modalTitle: { color: colors.textInverse, fontSize: 18, fontWeight: "bold" },
    modalClose: { color: colors.textInverse, fontSize: 22, fontWeight: "bold" },
    modalBody: { padding: 20 },

    fieldLabel: { fontSize: 14, fontWeight: "bold", color: colors.textPrimary, marginBottom: 8, marginTop: 16 },
    fieldInput: {
      backgroundColor: colors.cardBg, borderRadius: 10,
      padding: 12, fontSize: 15,
      borderWidth: 1.5, borderColor: colors.inputBorder,
      color: colors.textPrimary, marginBottom: 4,
    },
    fieldHint: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },

    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
    chip: {
      paddingVertical: 7, paddingHorizontal: 12,
      borderRadius: 20, borderWidth: 1.5, borderColor: colors.inputBorderAlt,
      backgroundColor: colors.inputBg, marginRight: 8, marginBottom: 8,
    },
    chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
    chipTextActive: { color: colors.textInverse },

    submitButton: {
      backgroundColor: colors.accent, borderRadius: 12,
      paddingVertical: 14, alignItems: "center", marginTop: 20, marginBottom: 20,
    },
    submitButtonText: { color: colors.textInverse, fontSize: 16, fontWeight: "bold" },
  });
}
