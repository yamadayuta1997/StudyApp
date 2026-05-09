import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient, TextbookMeta } from "@/utils/apiClient";
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

const SUBJECTS = ["財務会計論", "管理会計論", "監査論", "企業法", "租税法", "経営学"];

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const BYTES_PER_ESTIMATED_PAGE = 100 * 1024; // ~100KB per page
const PAGE_WARNING_THRESHOLD = 500;

export function computeProgress(phase: string, progress?: number, total?: number): number {
  if (phase === "uploading") return 5;
  if (phase === "analyzing_diagrams") return 20;
  if (phase === "saving_mongodb") return 50;
  if (phase === "embedding") {
    const base = 50;
    if (typeof progress === "number" && total && total > 0) {
      return Math.min(95, Math.round(base + (progress / total) * 45));
    }
    return base;
  }
  return 0;
}

export default function TextbookScreen() {
  const insets = useSafeAreaInsets();
  const [books, setBooks] = useState<TextbookMeta[]>([]);
  const [filterSubject, setFilterSubject] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [regSubject, setRegSubject] = useState(SUBJECTS[0]);
  const [regBookName, setRegBookName] = useState("");
  const [regDescription, setRegDescription] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [regDone, setRegDone] = useState(false);
  const [regStatusText, setRegStatusText] = useState("アップロード中...");
  const [regProgress, setRegProgress] = useState(0);
  const [regError, setRegError] = useState("");
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const regPollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadBooks = async () => {
    setLoading(true);
    try {
      const books = await apiClient.listTextbooks();
      setBooks(books);
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
            await apiClient.deleteTextbook(bookId);
            await loadBooks();
          } catch {
            Alert.alert("エラー", "削除に失敗しました。");
          }
        },
      },
    ]);
  };

  const stopPolling = () => {
    if (regPollingRef.current) { clearTimeout(regPollingRef.current); regPollingRef.current = null; }
  };

  useEffect(() => stopPolling, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resetRegForm = () => {
    stopPolling();
    setRegLoading(false);
    setRegDone(false);
    setRegProgress(0);
    setRegError("");
    setRegBookName("");
    setRegDescription("");
    setRegSubject(SUBJECTS[0]);
    setSelectedFile(null);
    setShowConfirm(false);
  };

  const pollJobStatus = useCallback(async (jobId: string) => {
    try {
      const data = await apiClient.pollRegisterStatus(jobId);
      if (data.status === "done") {
        stopPolling();
        setRegProgress(100);
        setRegLoading(false);
        setRegDone(true);
        await loadBooks();
      } else if (data.status === "error") {
        stopPolling();
        setRegLoading(false);
        setRegProgress(0);
        setRegError(`処理エラー: ${data.error || "不明なエラー"}`);
      } else {
        const phaseLabels: Record<string, string> = {
          uploading: "PDFをアップロード中...",
          analyzing_diagrams: "図解を解析中...",
          saving_mongodb: "データを保存中...",
          embedding: `埋め込み生成中... ${data.progress ?? 0}/${data.total ?? "?"}`,
        };
        setRegStatusText(phaseLabels[data.phase] ?? "処理中...");
        setRegProgress(computeProgress(data.phase, data.progress, data.total));
        regPollingRef.current = setTimeout(() => pollJobStatus(jobId), 3000);
      }
    } catch {
      stopPolling();
      setRegLoading(false);
      setRegProgress(0);
      setRegError("状態確認に失敗しました。一覧で登録状況を確認してください。");
    }
  }, [loadBooks]); // eslint-disable-line react-hooks/exhaustive-deps

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

    if (file.size != null && file.size > MAX_FILE_SIZE_BYTES) {
      setRegError(`ファイルサイズが大きすぎます（${(file.size / 1024 / 1024).toFixed(1)}MB）。50MB以下のPDFを選択してください。`);
      return;
    }

    setRegError("");
    setSelectedFile(file);
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    if (!selectedFile) return;
    const file = selectedFile;
    setShowConfirm(false);
    setRegLoading(true);
    setRegProgress(5);
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
      const data = await apiClient.registerTextbook(formData);
      if (data.jobId) {
        setRegStatusText("処理中...");
        setRegProgress(computeProgress("uploading"));
        await loadBooks();
        regPollingRef.current = setTimeout(() => pollJobStatus(data.jobId), 3000);
      } else {
        setRegLoading(false);
        Alert.alert("登録完了", `「${data.bookName}」を登録しました（${data.totalPages}ページ）`);
        setShowRegister(false);
        setRegBookName("");
        setRegDescription("");
        await loadBooks();
      }
    } catch (e: any) {
      setRegLoading(false);
      setRegError(e.name === "AbortError"
        ? "アップロードがタイムアウトしました（60秒）。ネットワーク環境をご確認ください。"
        : "登録に失敗しました: " + e.message);
    }
  };

  const filtered = filterSubject ? books.filter(b => b.subject === filterSubject) : books;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 20 }]}>
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
        ) : books.length === 0 ? (
          <View style={styles.ctaBanner}>
            <Text style={styles.ctaBannerTitle}>📂 まだ教科書が登録されていません</Text>
            <Text style={styles.ctaBannerDesc}>教科書PDFを登録すると、AI採点時に教科書の内容を参照できます。</Text>
            <TouchableOpacity style={styles.ctaBannerButton} onPress={() => { setShowRegister(true); setRegError(""); }}>
              <Text style={styles.ctaBannerButtonText}>📎 今すぐ教科書を登録する</Text>
            </TouchableOpacity>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>📂 該当する教科書はありません</Text>
            <Text style={styles.emptyDesc}>フィルターを変更してください。</Text>
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
      <Modal visible={showRegister} animationType="slide" onRequestClose={() => { resetRegForm(); setShowRegister(false); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalContainer}>
            <View style={[styles.modalHeader, { paddingTop: insets.top + 16 }]}>
              <Text style={styles.modalTitle}>📚 教科書を登録</Text>
              <TouchableOpacity onPress={() => { resetRegForm(); setShowRegister(false); }}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
              {regDone ? (
                <View style={styles.successBox}>
                  <Text style={styles.successIcon}>✅</Text>
                  <Text style={styles.successTitle}>登録完了！</Text>
                  <Text style={styles.successDesc}>教科書の登録と埋め込み生成が完了しました</Text>
                </View>
              ) : regLoading ? (
                <View style={styles.progressBox}>
                  <Text style={styles.progressStatusText}>{regStatusText}</Text>
                  <View style={styles.progressBarTrack}>
                    <View style={[styles.progressBarFill, { width: `${regProgress}%` as any }]} />
                  </View>
                  <Text style={styles.progressPercent}>{regProgress}%</Text>
                </View>
              ) : showConfirm && selectedFile ? (
                <>
                  <Text style={styles.confirmTitle}>登録内容の確認</Text>
                  <View style={styles.confirmCard}>
                    <View style={styles.confirmRow}>
                      <Text style={styles.confirmLabel}>ファイル名</Text>
                      <Text style={styles.confirmValue} numberOfLines={2}>{selectedFile.name}</Text>
                    </View>
                    <View style={styles.confirmRow}>
                      <Text style={styles.confirmLabel}>ファイルサイズ</Text>
                      <Text style={styles.confirmValue}>
                        {selectedFile.size != null ? `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB` : "不明"}
                      </Text>
                    </View>
                    <View style={styles.confirmRow}>
                      <Text style={styles.confirmLabel}>推定ページ数</Text>
                      <Text style={styles.confirmValue}>
                        {selectedFile.size != null
                          ? `約 ${Math.ceil(selectedFile.size / BYTES_PER_ESTIMATED_PAGE)} ページ`
                          : "不明"}
                      </Text>
                    </View>
                  </View>
                  {selectedFile.size != null &&
                    Math.ceil(selectedFile.size / BYTES_PER_ESTIMATED_PAGE) > PAGE_WARNING_THRESHOLD && (
                    <View style={styles.warningBox}>
                      <Text style={styles.warningText}>
                        ⚠️ ページ数が多いため、処理に時間がかかる場合があります。
                      </Text>
                    </View>
                  )}
                  {regError !== "" && (
                    <View style={styles.errorBox}>
                      <Text style={styles.errorText}>⚠️ {regError}</Text>
                    </View>
                  )}
                  <TouchableOpacity style={styles.registerButton} onPress={handleConfirm}>
                    <Text style={styles.registerButtonText}>✅ 登録を確定する</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => { setShowConfirm(false); setSelectedFile(null); }}
                  >
                    <Text style={styles.backButtonText}>← 戻る</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
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

                  <TouchableOpacity style={styles.registerButton} onPress={handleRegister}>
                    <Text style={styles.registerButtonText}>📎 PDFを選択して登録</Text>
                  </TouchableOpacity>

                  <Text style={styles.registerHint}>PDFを選択するとテキスト抽出が開始されます（数十秒かかる場合があります）</Text>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: "#f1f5f9" },
  container: { padding: 20 },
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
  progressContainer: { marginTop: 12, gap: 6 },
  progressBarTrack: { height: 8, backgroundColor: "#e2e8f0", borderRadius: 4, overflow: "hidden" },
  progressBarFill: { height: 8, backgroundColor: "#2563eb", borderRadius: 4 },
  progressPercent: { fontSize: 12, color: "#64748b", textAlign: "center", fontWeight: "600" },
  progressBox: { paddingVertical: 48, alignItems: "center", gap: 16 },
  progressStatusText: { fontSize: 15, color: "#374151", fontWeight: "600", textAlign: "center" },
  successBox: { paddingVertical: 64, alignItems: "center", gap: 12 },
  successIcon: { fontSize: 56 },
  successTitle: { fontSize: 22, fontWeight: "bold", color: "#16a34a" },
  successDesc: { fontSize: 14, color: "#64748b", textAlign: "center" },
  ctaBanner: {
    backgroundColor: "#eff6ff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#bfdbfe",
    marginTop: 16,
    gap: 10,
  },
  ctaBannerTitle: { fontSize: 16, fontWeight: "bold", color: "#1e40af", textAlign: "center" },
  ctaBannerDesc: { fontSize: 13, color: "#3b82f6", textAlign: "center", lineHeight: 20 },
  ctaBannerButton: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  ctaBannerButtonText: { color: "#fff", fontSize: 14, fontWeight: "bold" },
  confirmTitle: { fontSize: 18, fontWeight: "bold", color: "#1e293b", marginBottom: 16, marginTop: 8 },
  confirmCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    marginBottom: 16,
  },
  confirmRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  confirmLabel: { fontSize: 13, color: "#64748b", fontWeight: "600", flex: 1 },
  confirmValue: { fontSize: 13, color: "#1e293b", flex: 2, textAlign: "right" },
  warningBox: {
    backgroundColor: "#fffbeb",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  warningText: { color: "#92400e", fontSize: 13 },
  backButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  backButtonText: { color: "#475569", fontSize: 15, fontWeight: "600" },
});
