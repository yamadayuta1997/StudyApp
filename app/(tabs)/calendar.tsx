import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
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

const SUBJECTS = ["財務会計論", "管理会計論", "監査論", "企業法", "租税法", "経営学"];
const DAYS_OF_WEEK = ["日", "月", "火", "水", "木", "金", "土"];

type StudyGoal = {
  examDate: string;
  targetScore: number;
  hoursPerDay: number;
};

type StudyTask = {
  id: string;
  date: string;
  subject: string;
  taskType: "input" | "output" | "review";
  title: string;
  estimatedMinutes: number;
  done: boolean;
};

type CalendarCell = {
  date: string;
  day: number;
  inMonth: boolean;
};

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function today(): string {
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

function generateTasks(goal: StudyGoal): StudyTask[] {
  const examDate = new Date(goal.examDate);
  const now = new Date();
  const remainingDays = Math.max(1, Math.floor((examDate.getTime() - now.getTime()) / 86400000));

  let inputRatio = 0.6, outputRatio = 0.3;
  if (remainingDays < 60) {
    [inputRatio, outputRatio] = [0.1, 0.4];
  } else if (remainingDays < 90) {
    [inputRatio, outputRatio] = [0.3, 0.5];
  }

  const tasks: StudyTask[] = [];
  const minutesPerDay = goal.hoursPerDay * 60;
  const daysToGenerate = Math.min(remainingDays, 30);

  for (let d = 0; d < daysToGenerate; d++) {
    const taskDate = new Date(now);
    taskDate.setDate(now.getDate() + d);
    const dateStr = formatDate(taskDate);

    const subjectA = SUBJECTS[d % SUBJECTS.length];
    const subjectB = SUBJECTS[(d + 3) % SUBJECTS.length];

    const typeRand = (d * 7) % 10 / 10;
    let typeA: "input" | "output" | "review";
    if (typeRand < inputRatio) typeA = "input";
    else if (typeRand < inputRatio + outputRatio) typeA = "output";
    else typeA = "review";

    const titleA = typeA === "input" ? `📖 ${subjectA} テキスト読み込み`
      : typeA === "output" ? `✏️ ${subjectA} 問題演習`
      : `🔁 ${subjectA} 直前確認`;

    tasks.push({
      id: `${dateStr}_a_${d}`,
      date: dateStr,
      subject: subjectA,
      taskType: typeA,
      title: titleA,
      estimatedMinutes: Math.round(minutesPerDay / (minutesPerDay >= 120 ? 2 : 1)),
      done: false,
    });

    if (minutesPerDay >= 120) {
      tasks.push({
        id: `${dateStr}_b_${d}`,
        date: dateStr,
        subject: subjectB,
        taskType: "output",
        title: `✏️ ${subjectB} 問題演習`,
        estimatedMinutes: Math.round(minutesPerDay / 2),
        done: false,
      });
    }
  }
  return tasks;
}

export default function CalendarScreen() {
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(today());
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [goal, setGoal] = useState<StudyGoal>({ examDate: "", targetScore: 70, hoursPerDay: 3 });
  const [generating, setGenerating] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskSubject, setNewTaskSubject] = useState(SUBJECTS[0]);
  const [newTaskMinutes, setNewTaskMinutes] = useState("60");

  useFocusEffect(useCallback(() => {
    load();
  }, []));

  const load = async () => {
    const [rawGoal, rawTasks] = await Promise.all([
      AsyncStorage.getItem("studyGoal"),
      AsyncStorage.getItem("studyTasks"),
    ]);
    if (rawGoal) setGoal(JSON.parse(rawGoal));
    if (rawTasks) setTasks(JSON.parse(rawTasks));
  };

  const saveGoal = async (g: StudyGoal) => {
    setGoal(g);
    await AsyncStorage.setItem("studyGoal", JSON.stringify(g));
  };

  const saveTasks = async (t: StudyTask[]) => {
    setTasks(t);
    await AsyncStorage.setItem("studyTasks", JSON.stringify(t));
  };

  const toggleTask = async (id: string) => {
    const updated = tasks.map(t => t.id === id ? { ...t, done: !t.done } : t);
    await saveTasks(updated);
  };

  const handleGenerateTasks = async () => {
    if (!goal.examDate) {
      Alert.alert("試験日を設定してください", "「試験日（YYYY-MM-DD）」に入力してください。");
      return;
    }
    setGenerating(true);
    const newTasks = generateTasks(goal);
    await saveTasks(newTasks);
    setGenerating(false);
    Alert.alert("生成完了", `${newTasks.length}件のタスクを生成しました（30日分）。`);
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    const newTask: StudyTask = {
      id: `${selectedDate}_custom_${Date.now()}`,
      date: selectedDate,
      subject: newTaskSubject,
      taskType: "output",
      title: newTaskTitle.trim(),
      estimatedMinutes: parseInt(newTaskMinutes) || 60,
      done: false,
    };
    await saveTasks([...tasks, newTask]);
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
  const todayStr = today();
  const selectedTasks = tasks.filter(t => t.date === selectedDate);

  const getTaskStats = (date: string) => {
    const dayTasks = tasks.filter(t => t.date === date);
    if (dayTasks.length === 0) return null;
    const done = dayTasks.filter(t => t.done).length;
    return { total: dayTasks.length, done };
  };

  const getRemainingDays = () => {
    if (!goal.examDate) return null;
    const exam = new Date(goal.examDate);
    const diff = Math.ceil((exam.getTime() - new Date().getTime()) / 86400000);
    return diff;
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <Text style={styles.title}>📅 学習カレンダー</Text>

        {/* 目標設定カード */}
        <View style={styles.goalCard}>
          <Text style={styles.goalTitle}>🎯 学習目標</Text>
          <View style={styles.goalRow}>
            <Text style={styles.goalLabel}>試験日</Text>
            <TextInput
              style={styles.goalInput}
              value={goal.examDate}
              onChangeText={v => saveGoal({ ...goal, examDate: v })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
            />
          </View>
          {getRemainingDays() !== null && (
            <Text style={styles.remainingDays}>
              残り <Text style={styles.remainingDaysNum}>{getRemainingDays()}</Text> 日
            </Text>
          )}
          <View style={styles.goalRow}>
            <Text style={styles.goalLabel}>1日の目標</Text>
            <View style={styles.hoursRow}>
              {[1, 2, 3, 4, 5, 6, 8].map(h => (
                <TouchableOpacity
                  key={h}
                  style={[styles.hourChip, goal.hoursPerDay === h && styles.hourChipActive]}
                  onPress={() => saveGoal({ ...goal, hoursPerDay: h })}
                >
                  <Text style={[styles.hourChipText, goal.hoursPerDay === h && styles.hourChipTextActive]}>{h}h</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TouchableOpacity
            style={[styles.generateButton, generating && styles.generateButtonDisabled]}
            onPress={handleGenerateTasks}
            disabled={generating}
          >
            <Text style={styles.generateButtonText}>{generating ? "生成中..." : "🗓️ タスク自動生成（30日分）"}</Text>
          </TouchableOpacity>
        </View>

        {/* カレンダービュー */}
        <View style={styles.calendarCard}>
          <View style={styles.calendarNav}>
            <TouchableOpacity style={styles.navButton} onPress={prevMonth}>
              <Text style={styles.navButtonText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.calendarMonth}>{currentYear}年{currentMonth + 1}月</Text>
            <TouchableOpacity style={styles.navButton} onPress={nextMonth}>
              <Text style={styles.navButtonText}>›</Text>
            </TouchableOpacity>
          </View>

          {/* 曜日ヘッダー */}
          <View style={styles.weekRow}>
            {DAYS_OF_WEEK.map((d, i) => (
              <View key={d} style={styles.weekCell}>
                <Text style={[styles.weekLabel, i === 0 && { color: "#dc2626" }, i === 6 && { color: "#2563eb" }]}>{d}</Text>
              </View>
            ))}
          </View>

          {/* 日付グリッド */}
          <View style={styles.gridContainer}>
            {grid.map((cell, idx) => {
              const stats = getTaskStats(cell.date);
              const ratio = stats ? stats.done / stats.total : 0;
              const bgColor = !stats ? "transparent"
                : ratio >= 1 ? "#2563eb"
                : ratio >= 0.5 ? "#93c5fd"
                : "#dbeafe";
              const isSelected = cell.date === selectedDate;
              const isToday = cell.date === todayStr;
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
                    isSelected && { color: "#fff", fontWeight: "bold" },
                    (idx % 7 === 0) && cell.inMonth && { color: "#dc2626" },
                    (idx % 7 === 6) && cell.inMonth && { color: "#2563eb" },
                    ratio >= 1 && { color: "#fff" },
                  ]}>
                    {cell.day}
                  </Text>
                  {stats && (
                    <Text style={[styles.taskCount, ratio >= 1 && { color: "#fff" }]}>
                      {stats.done}/{stats.total}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* タスクリスト */}
        <View style={styles.taskSection}>
          <View style={styles.taskHeader}>
            <Text style={styles.taskDate}>{selectedDate} のタスク</Text>
            <TouchableOpacity style={styles.addTaskButton} onPress={() => setShowAddTask(true)}>
              <Text style={styles.addTaskButtonText}>＋ 追加</Text>
            </TouchableOpacity>
          </View>

          {selectedTasks.length === 0 ? (
            <Text style={styles.noTask}>タスクがありません</Text>
          ) : (
            selectedTasks.map(task => (
              <TouchableOpacity key={task.id} style={styles.taskCard} onPress={() => toggleTask(task.id)}>
                <View style={[styles.checkbox, task.done && styles.checkboxDone]}>
                  {task.done && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={styles.taskInfo}>
                  <View style={styles.taskTitleRow}>
                    <View style={styles.taskSubjectChip}>
                      <Text style={styles.taskSubjectText}>{task.subject}</Text>
                    </View>
                    <Text style={[styles.taskTitle, task.done && styles.taskTitleDone]}>{task.title}</Text>
                  </View>
                  <Text style={styles.taskMinutes}>{task.estimatedMinutes}分</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      {/* タスク追加モーダル */}
      <Modal visible={showAddTask} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddTask(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.addTaskModal}>
            <View style={styles.addTaskModalHeader}>
              <Text style={styles.addTaskModalTitle}>タスクを追加</Text>
              <TouchableOpacity onPress={() => setShowAddTask(false)}>
                <Text style={styles.addTaskModalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.addTaskModalBody}>
              <Text style={styles.fieldLabel}>科目</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {SUBJECTS.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.subjectChip, newTaskSubject === s && styles.subjectChipActive]}
                    onPress={() => setNewTaskSubject(s)}
                  >
                    <Text style={[styles.subjectChipText, newTaskSubject === s && styles.subjectChipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.fieldLabel}>タスク名</Text>
              <TextInput
                style={styles.addTaskInput}
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
                placeholder="タスクの内容"
                placeholderTextColor="#94a3b8"
              />
              <Text style={styles.fieldLabel}>目安時間（分）</Text>
              <TextInput
                style={styles.addTaskInput}
                value={newTaskMinutes}
                onChangeText={setNewTaskMinutes}
                keyboardType="numeric"
                placeholder="60"
                placeholderTextColor="#94a3b8"
              />
              <TouchableOpacity style={styles.addTaskSubmit} onPress={handleAddTask}>
                <Text style={styles.addTaskSubmitText}>追加</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: "#f1f5f9" },
  container: { padding: 16, paddingBottom: 60 },
  title: { fontSize: 22, fontWeight: "bold", color: "#1e293b", marginBottom: 16, textAlign: "center" },
  goalCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  goalTitle: { fontSize: 15, fontWeight: "bold", color: "#1e40af", marginBottom: 12 },
  goalRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 10 },
  goalLabel: { fontSize: 13, color: "#64748b", width: 60 },
  goalInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
    color: "#1e293b",
    backgroundColor: "#f8fafc",
  },
  remainingDays: { fontSize: 14, color: "#64748b", marginBottom: 10 },
  remainingDaysNum: { fontSize: 20, fontWeight: "bold", color: "#2563eb" },
  hoursRow: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  hourChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  hourChipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  hourChipText: { color: "#64748b", fontSize: 12, fontWeight: "600" },
  hourChipTextActive: { color: "#fff" },
  generateButton: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  generateButtonDisabled: { backgroundColor: "#94a3b8" },
  generateButtonText: { color: "#fff", fontSize: 14, fontWeight: "bold" },
  calendarCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  calendarNav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  navButton: { padding: 8 },
  navButtonText: { fontSize: 24, color: "#2563eb", fontWeight: "bold" },
  calendarMonth: { fontSize: 16, fontWeight: "bold", color: "#1e293b" },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekCell: { flex: 1, alignItems: "center" },
  weekLabel: { fontSize: 12, fontWeight: "600", color: "#64748b" },
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
  dayCellSelected: { borderColor: "#2563eb", borderWidth: 2 },
  dayCellToday: { borderColor: "#93c5fd", borderWidth: 1.5 },
  dayText: { fontSize: 13, color: "#1e293b" },
  dayTextOther: { color: "#cbd5e1" },
  taskCount: { fontSize: 9, color: "#64748b" },
  taskSection: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  taskHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  taskDate: { fontSize: 14, fontWeight: "bold", color: "#1e40af" },
  addTaskButton: {
    backgroundColor: "#eff6ff",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  addTaskButtonText: { color: "#2563eb", fontSize: 13, fontWeight: "600" },
  noTask: { textAlign: "center", color: "#94a3b8", fontSize: 14, paddingVertical: 20 },
  taskCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxDone: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  checkmark: { color: "#fff", fontSize: 14, fontWeight: "bold" },
  taskInfo: { flex: 1 },
  taskTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 },
  taskSubjectChip: {
    backgroundColor: "#eff6ff",
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  taskSubjectText: { color: "#2563eb", fontSize: 11, fontWeight: "600" },
  taskTitle: { fontSize: 14, color: "#1e293b", flex: 1 },
  taskTitleDone: { color: "#94a3b8", textDecorationLine: "line-through" },
  taskMinutes: { fontSize: 12, color: "#94a3b8" },
  addTaskModal: { flex: 1, backgroundColor: "#f8fafc" },
  addTaskModalHeader: {
    backgroundColor: "#1e40af",
    padding: 20,
    paddingTop: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  addTaskModalTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  addTaskModalClose: { color: "#fff", fontSize: 22, fontWeight: "bold" },
  addTaskModalBody: { padding: 20 },
  fieldLabel: { fontSize: 14, fontWeight: "bold", color: "#374151", marginBottom: 8, marginTop: 16 },
  subjectChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    marginRight: 8,
  },
  subjectChipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  subjectChipText: { color: "#64748b", fontSize: 13, fontWeight: "600" },
  subjectChipTextActive: { color: "#fff" },
  addTaskInput: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    color: "#1e293b",
    marginBottom: 4,
  },
  addTaskSubmit: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  addTaskSubmitText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});
