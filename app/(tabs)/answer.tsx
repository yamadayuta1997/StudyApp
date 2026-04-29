import AsyncStorage from "@react-native-async-storage/async-storage";
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

  const handlePdfUpload = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    setPdfLoading(true);
    const formData = new FormData();
    formData.append("pdf", file);
    try {
      const response = await fetch(`${API_BASE_URL}/extract-pdf`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      setQuestion(data.text.slice(0, 1000));
    } catch (e) {
      setError("PDF読み込みに失敗しました。");
    } finally {
      setPdfLoading(false);
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
        date: new Date().toLocaleDateString("ja-JP"),
      };
      const raw = await AsyncStorage.getItem("history");
      const history = raw ? JSON.parse(raw) : [];
      await AsyncStorage.setItem(
        "history",
        JSON.stringify([...history, newItem]),
      );
    } catch (e) {
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
              style={[
                styles.subjectButton,
                subject === s && styles.subjectButtonActive,
              ]}
              onPress={() => setSubject(s)}
            >
              <Text
                style={[
                  styles.subjectText,
                  subject === s && styles.subjectTextActive,
                ]}
              >
                {s}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 問題文 */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📄 問題文</Text>
          <label style={{ cursor: "pointer" } as any}>
            <View style={styles.pdfButton}>
              {pdfLoading ? (
                <ActivityIndicator size="small" color="#2563eb" />
              ) : (
                <Text style={styles.pdfButtonText}>📎 PDFから読み込む</Text>
              )}
            </View>
            <input
              type="file"
              accept="application/pdf"
              style={{ display: "none" }}
              onChange={handlePdfUpload}
            />
          </label>
        </View>
        <TextInput
          style={styles.input}
          multiline
          placeholder="問題文を入力、またはPDFから読み込んでください"
          placeholderTextColor="#94a3b8"
          value={question}
          onChangeText={setQuestion}
        />
        <Text style={styles.charCount}>{question.length} 文字</Text>
      </View>

      {/* 答案 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>✏️ あなたの答案</Text>
        <TextInput
          style={styles.input}
          multiline
          placeholder="答案を入力してください"
          placeholderTextColor="#94a3b8"
          value={answer}
          onChangeText={setAnswer}
        />
        <Text style={styles.charCount}>{answer.length} 文字</Text>
      </View>

      {/* 採点ボタン */}
      <TouchableOpacity
        style={[styles.button, !isReady && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={!isReady || loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.buttonText}>🎯 採点する</Text>
        )}
      </TouchableOpacity>

      {!isReady && (
        <Text style={styles.hint}>問題文と答案を入力してください</Text>
      )}

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
  scroll: {
    backgroundColor: "#f1f5f9",
  },
  container: {
    padding: 20,
    paddingBottom: 60,
  },
  header: {
    backgroundColor: "#1e40af",
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 4,
  },
  headerSub: {
    fontSize: 14,
    color: "#bfdbfe",
  },
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
  sectionTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#1e40af",
    marginBottom: 10,
  },
  subjectGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  subjectButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  subjectButtonActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  subjectText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "600",
  },
  subjectTextActive: {
    color: "#fff",
  },
  pdfButton: {
    backgroundColor: "#eff6ff",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  pdfButtonText: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "600",
  },
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
  charCount: {
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "right",
    marginTop: 6,
  },
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
  buttonDisabled: {
    backgroundColor: "#94a3b8",
    shadowOpacity: 0,
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  hint: {
    textAlign: "center",
    color: "#94a3b8",
    fontSize: 13,
    marginBottom: 16,
  },
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
  errorText: {
    color: "#dc2626",
    fontSize: 14,
    flex: 1,
  },
  errorClose: {
    color: "#dc2626",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 8,
  },
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
  resultTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1e40af",
  },
  resultBadge: {
    backgroundColor: "#eff6ff",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  resultBadgeText: {
    color: "#2563eb",
    fontSize: 12,
    fontWeight: "600",
  },
  resultDivider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginBottom: 14,
  },
});

const markdownStyles = {
  body: { fontSize: 15, lineHeight: 24, color: "#334155" },
  heading1: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1e40af",
    marginVertical: 8,
  },
  heading2: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#2563eb",
    marginVertical: 6,
  },
  heading3: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#3b82f6",
    marginVertical: 4,
  },
  strong: { fontWeight: "bold" },
  bullet_list: { marginVertical: 4 },
  list_item: { marginVertical: 2 },
};
