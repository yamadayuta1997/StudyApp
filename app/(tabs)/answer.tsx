import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";

const API_BASE_URL = "https://studyapp-production-66d5.up.railway.app";

const SUBJECTS = [
  "財務会計論",
  "管理会計論",
  "監査論",
  "企業法",
  "租税法",
  "経営学",
];

export default function AnswerScreen() {
  const [subject, setSubject] = useState("財務会計論");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageFileName, setImageFileName] = useState("");
  const [pdfInfo, setPdfInfo] = useState<{ totalPages: number; fromPage: number; toPage: number } | null>(null);
  const [fromPage, setFromPage] = useState("1");
  const [toPage, setToPage] = useState("");

  const handlePdfUpload = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;

    const file = result.assets[0];
    setPdfLoading(true);
    setPdfInfo(null);

    const formData = new FormData();
    formData.append("pdf", { uri: file.uri, type: "application/pdf", name: file.name } as any);
    if (fromPage) formData.append("fromPage", fromPage);
    if (toPage) formData.append("toPage", toPage);

    try {
      const response = await fetch(`${API_BASE_URL}/extract-pdf`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setQuestion(data.text);
      setPdfInfo({ totalPages: data.totalPages, fromPage: data.fromPage, toPage: data.toPage });
    } catch (e: any) {
      setError("PDF読み込みに失敗しました: " + e.message);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleImagePick = async (useCamera: boolean) => {
    let pickerResult;
    if (useCamera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError("カメラの使用許可が必要です。設定から許可してください。");
        return;
      }
      pickerResult = await ImagePicker.launchCameraAsync({
        mediaTypes: "images",
        quality: 0.8,
      });
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("フォトライブラリへのアクセス許可が必要です。");
        return;
      }
      pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        quality: 0.8,
      });
    }

    if (pickerResult.canceled) return;

    const image = pickerResult.assets[0];
    const fileName = image.fileName || (useCamera ? "camera.jpg" : "image.jpg");
    setImageLoading(true);
    setImageFileName(fileName);

    const formData = new FormData();
    formData.append("image", {
      uri: image.uri,
      type: image.mimeType || "image/jpeg",
      name: fileName,
    } as any);

    try {
      const response = await fetch(`${API_BASE_URL}/extract-image`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setAnswer(data.text);
    } catch (e: any) {
      setError("画像の読み込みに失敗しました: " + e.message);
      setImageFileName("");
    } finally {
      setImageLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!question || !answer) return;
    setLoading(true);
    setResult("");
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer, subject }),
      });
      const data = await response.json();
      setResult(data.result);

      const newItem = {
        id: Date.now().toString(),
        subject,
        question,
        answer,
        result: data.result,
        score: data.score ?? null,
        date: new Date().toLocaleDateString("ja-JP"),
      };
      const raw = await AsyncStorage.getItem("history");
      const history = raw ? JSON.parse(raw) : [];
      await AsyncStorage.setItem("history", JSON.stringify([...history, newItem]));
    } catch {
      setError("採点に失敗しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  const isReady = question.length > 0 && answer.length > 0;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>✏️ 答案採点</Text>
        <Text style={styles.headerSub}>問題と答案を入力してAI採点</Text>
      </View>

      {/* 科目選択 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📌 科目</Text>
        <View style={styles.subjectGrid}>
          {SUBJECTS.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.subjectButton, subject === s && styles.subjectButtonActive]}
              onPress={() => setSubject(s)}
            >
              <Text style={[styles.subjectText, subject === s && styles.subjectTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 問題文 */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📄 問題文</Text>
          <TouchableOpacity style={styles.uploadButton} onPress={handlePdfUpload} disabled={pdfLoading}>
            {pdfLoading
              ? <ActivityIndicator size="small" color="#2563eb" />
              : <Text style={styles.uploadButtonText}>📎 PDFから読み込む</Text>
            }
          </TouchableOpacity>
        </View>

        {/* ページ範囲指定 */}
        <View style={styles.pageRangeRow}>
          <Text style={styles.pageRangeLabel}>ページ範囲：</Text>
          <TextInput
            style={styles.pageInput}
            value={fromPage}
            onChangeText={setFromPage}
            placeholder="開始"
            keyboardType="numeric"
            placeholderTextColor="#94a3b8"
          />
          <Text style={styles.pageRangeSep}>〜</Text>
          <TextInput
            style={styles.pageInput}
            value={toPage}
            onChangeText={setToPage}
            placeholder="終了"
            keyboardType="numeric"
            placeholderTextColor="#94a3b8"
          />
          <Text style={styles.pageRangeHint}>（空欄=全ページ）</Text>
        </View>

        {/* PDFプレビュー情報 */}
        {pdfInfo && (
          <View style={styles.pdfPreview}>
            <Text style={styles.pdfPreviewText}>
              全{pdfInfo.totalPages}ページ中 {pdfInfo.fromPage}〜{pdfInfo.toPage}ページ読込済
            </Text>
            <Text style={styles.pdfPreviewText}>{question.length.toLocaleString()} 文字</Text>
          </View>
        )}

        <TextInput
          style={styles.input}
          multiline
          placeholder="問題文を入力、またはPDFから読み込んでください"
          placeholderTextColor="#94a3b8"
          value={question}
          onChangeText={setQuestion}
        />
        <Text style={styles.charCount}>{question.length.toLocaleString()} 文字</Text>
      </View>

      {/* 答案 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>✏️ あなたの答案</Text>

        {/* 画像入力ボタン */}
        <View style={styles.imageButtonRow}>
          <TouchableOpacity
            style={[styles.imageButton, { backgroundColor: "#f5f3ff", borderColor: "#c4b5fd" }]}
            onPress={() => handleImagePick(false)}
            disabled={imageLoading}
          >
            {imageLoading
              ? <ActivityIndicator size="small" color="#7c3aed" />
              : <Text style={[styles.imageButtonText, { color: "#7c3aed" }]}>🖼 ギャラリーから選択</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.imageButton, { backgroundColor: "#fdf4ff", borderColor: "#e879f9" }]}
            onPress={() => handleImagePick(true)}
            disabled={imageLoading}
          >
            {imageLoading
              ? <ActivityIndicator size="small" color="#a21caf" />
              : <Text style={[styles.imageButtonText, { color: "#a21caf" }]}>📸 カメラで撮影</Text>
            }
          </TouchableOpacity>
        </View>

        {imageLoading && (
          <View style={styles.ocrStatus}>
            <ActivityIndicator size="small" color="#7c3aed" />
            <Text style={styles.ocrStatusText}>AIが手書き文字を認識中...</Text>
          </View>
        )}
        {!imageLoading && imageFileName !== "" && (
          <View style={styles.ocrDone}>
            <Text style={styles.ocrDoneText}>✅ 「{imageFileName}」をテキスト化しました</Text>
          </View>
        )}

        <TextInput
          style={styles.input}
          multiline
          placeholder="答案を入力、または写真をアップロードしてください"
          placeholderTextColor="#94a3b8"
          value={answer}
          onChangeText={setAnswer}
        />
        <Text style={styles.charCount}>{answer.length.toLocaleString()} 文字</Text>
      </View>

      {/* 採点ボタン */}
      <TouchableOpacity
        style={[styles.button, !isReady && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={!isReady || loading}
      >
        {loading
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={styles.buttonText}>🎯 採点する</Text>
        }
      </TouchableOpacity>

      {!isReady && <Text style={styles.hint}>問題文と答案を入力してください</Text>}

      {/* エラー */}
      {error !== "" && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <TouchableOpacity onPress={() => setError("")}>
            <Text style={styles.errorClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 採点結果 */}
      {result !== "" && (
        <View style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>📊 採点結果</Text>
            <View style={styles.resultBadge}>
              <Text style={styles.resultBadgeText}>{subject}</Text>
            </View>
          </View>
          <View style={styles.resultDivider} />
          <Markdown style={markdownStyles}>{result}</Markdown>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: "#f1f5f9" },
  container: { padding: 20, paddingBottom: 60 },
  header: {
    backgroundColor: "#1e40af",
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    alignItems: "center",
  },
  headerTitle: { fontSize: 24, fontWeight: "bold", color: "#fff", marginBottom: 4 },
  headerSub: { fontSize: 14, color: "#bfdbfe" },
  section: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: "bold", color: "#1e40af", marginBottom: 10 },
  subjectGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  subjectButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  subjectButtonActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  subjectText: { color: "#64748b", fontSize: 13, fontWeight: "600" },
  subjectTextActive: { color: "#fff" },
  uploadButton: {
    backgroundColor: "#eff6ff",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    minWidth: 44,
    alignItems: "center",
  },
  uploadButtonText: { color: "#2563eb", fontSize: 13, fontWeight: "600" },
  pageRangeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 6,
  },
  pageRangeLabel: { fontSize: 13, color: "#64748b" },
  pageInput: {
    width: 56,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 6,
    fontSize: 13,
    textAlign: "center",
    color: "#1e293b",
    backgroundColor: "#f8fafc",
  },
  pageRangeSep: { fontSize: 13, color: "#64748b" },
  pageRangeHint: { fontSize: 11, color: "#94a3b8" },
  pdfPreview: {
    backgroundColor: "#f0fdf4",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  pdfPreviewText: { fontSize: 12, color: "#166534" },
  input: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    minHeight: 140,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    textAlignVertical: "top",
    color: "#1e293b",
    lineHeight: 22,
  },
  charCount: { fontSize: 12, color: "#94a3b8", textAlign: "right", marginTop: 6 },
  imageButtonRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  imageButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
  },
  imageButtonText: { fontSize: 13, fontWeight: "600" },
  ocrStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f5f3ff",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  ocrStatusText: { color: "#7c3aed", fontSize: 13 },
  ocrDone: {
    backgroundColor: "#f0fdf4",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  ocrDoneText: { color: "#166534", fontSize: 13 },
  button: {
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 8,
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonDisabled: { backgroundColor: "#94a3b8", shadowOpacity: 0 },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  hint: { textAlign: "center", color: "#94a3b8", fontSize: 13, marginBottom: 16 },
  errorBox: {
    backgroundColor: "#fef2f2",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  errorText: { color: "#dc2626", fontSize: 14, flex: 1 },
  errorClose: { color: "#dc2626", fontSize: 18, fontWeight: "bold", marginLeft: 8 },
  resultCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  resultTitle: { fontSize: 18, fontWeight: "bold", color: "#1e40af" },
  resultBadge: {
    backgroundColor: "#eff6ff",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  resultBadgeText: { color: "#2563eb", fontSize: 12, fontWeight: "600" },
  resultDivider: { height: 1, backgroundColor: "#e2e8f0", marginBottom: 14 },
});

const markdownStyles = {
  body: { fontSize: 15, lineHeight: 24, color: "#334155" },
  heading1: { fontSize: 20, fontWeight: "bold", color: "#1e40af", marginVertical: 8 },
  heading2: { fontSize: 17, fontWeight: "bold", color: "#2563eb", marginVertical: 6 },
  heading3: { fontSize: 15, fontWeight: "bold", color: "#3b82f6", marginVertical: 4 },
  strong: { fontWeight: "bold" },
  bullet_list: { marginVertical: 4 },
  list_item: { marginVertical: 2 },
};
