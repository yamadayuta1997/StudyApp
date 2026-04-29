import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
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

const API_BASE_URL = "https://studyapp-production-66d5.up.railway.app";

const SUBJECTS = ["財務会計論", "管理会計論", "監査論", "企業法", "租税法", "経営学"];

type TextbookMeta = {
  bookId: string;
  subject: string;
  bookName: string;
  description: string;
  totalPages: number;
  registeredAt: string;
};

export default function TextbookScreen() {
  const [books, setBooks] = useState<TextbookMeta[]>([]);
  const [filterSubject, setFilterSubject] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [regSubject, setRegSubject] = useState(SUBJECTS[0]);
  const [regBookName, setRegBookName] = useState("");
  const [regDescription, setRegDescription] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState("");

  const loadBooks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/textbook/list`);
      const data = await res.json();
      setBooks(data.books || []);
    } catch {
      setBooks([]);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadBooks(); }, []));

  const handleDelete = async (bookId: string, bookName: string) => {
    Alert.alert("削除確認", `「${bookName}」を削除しますか？`, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: async () => {
          try {
            await fetch(`${API_BASE_URL}/textbook/${encodeURIComponent(bookId)}`, { method: "DELETE" });
            await loadBooks();
          } catch {
            Alert.alert("エラー", "削除に失敗しました。");
          }
        },
      },
    ]);
  };

  const handleRegister = async () => {
    if (!regBookName.trim()) {
      setRegError("教科書名を入力してください。");
      return;
    }

    const picked = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;

    const file = picked.assets[0];
    setRegLoading(true);
    setRegError("");

    const formData = new FormData();
    if (Platform.OS === "web" && (file as any).file) {
      formData.append("pdf", (file as any).file, file.name || "textbook.pdf");
    } else if (Platform.OS === "web") {
      try {
        const blob = await (await fetch(file.uri)).blob();
        formData.append("pdf", blob, file.name || "textbook.pdf");
      } catch {
        setRegError("PDFの読み込みに失敗しました。");
        setRegLoading(false);
        return;
      }
    } else {
      formData.append("pdf", { uri: file.uri, type: "application/pdf", name: file.name || "textbook.pdf" } as any);
    }
    formData.append("subject", regSubject);
    formData.append("bookName", regBookName.trim());
    formData.append("description", regDescription.trim());

    try {
      const res = await fetch(`${API_BASE_URL}/textbook/register`, { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      Alert.alert("登録完了", `「${data.bookName}」を登録しました（${data.totalPages}ページ）`);
      setShowRegister(false);
      setRegBookName("");
      setRegDescription("");
      await loadBooks();
    } catch (e: any) {
      setRegError("登録に失敗しました: " + e.message);
    } finally {
      setRegLoading(false);
    }
  };

  const filtered = filterSubject ? books.filter(b => b.subject === filterSubject) : books;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>📚 教科書管理</Text>
          <Text style={styles.headerSub}>PDFを登録してAI採点の精度を向上</Text>
        </View>

        {/* 科目フィルター */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, filterSubject === null && styles.filterChipActive]}
            onPress={() => setFilterSubject(null)}
          >
            <Text style={[styles.filterChipText, filterSubject === null && styles.filterChipTextActive]}>すべて</Text>
          </TouchableOpacity>
          {SUBJECTS.map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.filterChip, filterSubject === s && styles.filterChipActive]}
              onPress={() => setFilterSubject(s)}
            >
              <Text style={[styles.filterChipText, filterSubject === s && styles.filterChipTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* 登録ボタン */}
        <TouchableOpacity style={styles.addButton} onPress={() => { setShowRegister(true); setRegError(""); }}>
          <Text style={styles.addButtonText}>＋ 教科書を登録</Text>
        </TouchableOpacity>

        {/* 教科書リスト */}
        {loading ? (
          <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>📂 登録された教科書はありません</Text>
            <Text style={styles.emptyDesc}>PDFを登録すると、AI採点時に教科書の内容を参照できます。</Text>
          </View>
        ) : (
          filtered.map(book => (
            <View key={book.bookId} style={styles.bookCard}>
              <View style={styles.bookHeader}>
                <View style={styles.bookSubjectChip}>
                  <Text style={styles.bookSubjectText}>{book.subject}</Text>
                </View>
                <Text style={styles.bookDate}>{book.registeredAt.slice(0, 10)}</Text>
              </View>
              <Text style={styles.bookName}>{book.bookName}</Text>
              {book.description ? <Text style={styles.bookDesc}>{book.description}</Text> : null}
              <View style={styles.bookFooter}>
                <Text style={styles.bookPages}>{book.totalPages}ページ</Text>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDelete(book.bookId, book.bookName)}
                >
                  <Text style={styles.deleteButtonText}>削除</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* 登録モーダル */}
      <Modal visible={showRegister} animationType="slide" onRequestClose={() => setShowRegister(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📚 教科書を登録</Text>
              <TouchableOpacity onPress={() => setShowRegister(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
              <Text style={styles.fieldLabel}>科目 *</Text>
              <View style={styles.subjectGrid}>
                {SUBJECTS.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.subjectChip, regSubject === s && styles.subjectChipActive]}
                    onPress={() => setRegSubject(s)}
                  >
                    <Text style={[styles.subjectChipText, regSubject === s && styles.subjectChipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>教科書名 *</Text>
              <TextInput
                style={styles.input}
                value={regBookName}
                onChangeText={setRegBookName}
                placeholder="例: 財務会計論テキスト上巻"
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.fieldLabel}>説明（任意）</Text>
              <TextInput
                style={styles.input}
                value={regDescription}
                onChangeText={setRegDescription}
                placeholder="例: 2024年度版"
                placeholderTextColor="#94a3b8"
              />

              {regError !== "" && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>⚠️ {regError}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.registerButton, regLoading && styles.registerButtonDisabled]}
                onPress={handleRegister}
                disabled={regLoading}
              >
                {regLoading ? (
                  <View style={styles.registerButtonContent}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.registerButtonText}>アップロード中...</Text>
                  </View>
                ) : (
                  <Text style={styles.registerButtonText}>📎 PDFを選択して登録</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.registerHint}>PDFを選択するとテキスト抽出が開始されます（数十秒かかる場合があります）</Text>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: "#f1f5f9" },
  container: { padding: 20, paddingBottom: 60 },
  header: {
    backgroundColor: "#1e40af",
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    alignItems: "center",
  },
  headerTitle: { fontSize: 24, fontWeight: "bold", color: "#fff", marginBottom: 4 },
  headerSub: { fontSize: 13, color: "#bfdbfe" },
  filterRow: { marginBottom: 14 },
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
  addButton: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  addButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
    marginTop: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: "bold", color: "#64748b", marginBottom: 8 },
  emptyDesc: { fontSize: 13, color: "#94a3b8", textAlign: "center", lineHeight: 20 },
  bookCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  bookHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  bookSubjectChip: {
    backgroundColor: "#eff6ff",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  bookSubjectText: { color: "#2563eb", fontSize: 12, fontWeight: "600" },
  bookDate: { color: "#94a3b8", fontSize: 12 },
  bookName: { fontSize: 16, fontWeight: "bold", color: "#1e293b", marginBottom: 4 },
  bookDesc: { fontSize: 13, color: "#64748b", marginBottom: 8 },
  bookFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bookPages: { fontSize: 13, color: "#64748b" },
  deleteButton: {
    backgroundColor: "#fee2e2",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  deleteButtonText: { color: "#dc2626", fontSize: 13, fontWeight: "600" },
  modalContainer: { flex: 1, backgroundColor: "#f8fafc" },
  modalHeader: {
    backgroundColor: "#1e40af",
    padding: 20,
    paddingTop: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  modalClose: { color: "#fff", fontSize: 22, fontWeight: "bold" },
  modalScroll: { flex: 1 },
  modalContent: { padding: 20, paddingBottom: 40 },
  fieldLabel: { fontSize: 14, fontWeight: "bold", color: "#374151", marginBottom: 8, marginTop: 16 },
  subjectGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  subjectChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  subjectChipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  subjectChipText: { color: "#64748b", fontSize: 13, fontWeight: "600" },
  subjectChipTextActive: { color: "#fff" },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    color: "#1e293b",
  },
  errorBox: {
    backgroundColor: "#fef2f2",
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  errorText: { color: "#dc2626", fontSize: 13 },
  registerButton: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  registerButtonDisabled: { backgroundColor: "#94a3b8" },
  registerButtonContent: { flexDirection: "row", alignItems: "center", gap: 8 },
  registerButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  registerHint: { fontSize: 12, color: "#94a3b8", textAlign: "center", marginTop: 12, lineHeight: 18 },
});
