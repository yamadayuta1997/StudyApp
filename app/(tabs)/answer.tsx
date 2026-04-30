import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";

const API_BASE_URL = "https://studyapp-production-66d5.up.railway.app";

const SUBJECTS = ["財務会計論", "管理会計論", "監査論", "企業法", "租税法", "経営学"];

type ChatMessage = { role: "user" | "assistant"; content: string };
type TextbookMeta = { bookId: string; subject: string; bookName: string; totalPages: number };

export default function AnswerScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [subject, setSubject] = useState("財務会計論");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState("");
  const [summary, setSummary] = useState("");
  const [refPages, setRefPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageFileName, setImageFileName] = useState("");
  const [pdfInfo, setPdfInfo] = useState<{
    totalPages: number; fromPage: number; toPage: number; imagePages?: number[];
  } | null>(null);
  const [fromPage, setFromPage] = useState("1");
  const [toPage, setToPage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Textbook selection
  const [availableBooks, setAvailableBooks] = useState<TextbookMeta[]>([]);
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());

  // Answer images
  const [answerImages, setAnswerImages] = useState<{ uri: string; base64: string }[]>([]);

  // Ref page modal
  const [refPageModalText, setRefPageModalText] = useState("");
  const [refPageModalTitle, setRefPageModalTitle] = useState("");

  useFocusEffect(useCallback(() => {
    loadBooks();
  }, []));

  const loadBooks = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/textbook/list`);
      const data = await res.json();
      setAvailableBooks(data.books || []);
    } catch {
      setAvailableBooks([]);
    }
  };

  const toggleBook = (bookId: string) => {
    setSelectedBookIds(prev => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  };

  const handlePdfUpload = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    if (picked.canceled) return;

    const file = picked.assets[0];
    setPdfLoading(true);
    setPdfInfo(null);
    setError("");

    const formData = new FormData();
    if (Platform.OS === "web" && (file as any).file) {
      formData.append("pdf", (file as any).file, file.name || "document.pdf");
    } else if (Platform.OS === "web") {
      try {
        const blob = await (await fetch(file.uri)).blob();
        formData.append("pdf", blob, file.name || "document.pdf");
      } catch {
        setError("PDFファイルの読み込みに失敗しました。");
        setPdfLoading(false);
        return;
      }
    } else {
      formData.append("pdf", { uri: file.uri, type: "application/pdf", name: file.name } as any);
    }
    if (fromPage) formData.append("fromPage", fromPage);
    if (toPage) formData.append("toPage", toPage);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${API_BASE_URL}/extract-pdf`, {
        method: "POST", body: formData, signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setQuestion(data.text);
      setPdfInfo({ totalPages: data.totalPages, fromPage: data.fromPage, toPage: data.toPage, imagePages: data.imagePages || [] });
    } catch (e: any) {
      clearTimeout(timeoutId);
      const msg: string = e.message || "";
      if (e.name === "AbortError" || msg.includes("aborted")) {
        setError("接続がタイムアウトしました（30秒）。ネットワーク環境をご確認ください。");
      } else if (msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("network")) {
        setError("サーバーへの接続に失敗しました。Wi-Fi接続を確認してください。");
      } else if (msg.includes("NO_FILE")) {
        setError("ファイルの送信に失敗しました。PDFを再選択してください。");
      } else if (msg.includes("NO_TEXT")) {
        setError("テキストを抽出できませんでした。スキャン画像PDFは「カメラで撮影」機能をご利用ください。");
      } else if (msg.includes("PARSE_ERROR")) {
        setError("PDFの解析に失敗しました。パスワード保護や破損ファイルは読み込めません。");
      } else {
        setError("PDF読み込みに失敗しました: " + msg);
      }
    } finally {
      setPdfLoading(false);
    }
  };

  const handleImagePick = async (useCamera: boolean) => {
    let pickerResult;
    if (useCamera) {
      try {
        if (Platform.OS !== "web") {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            setError("カメラの使用許可が必要です。設定アプリ → StudyApp → カメラ をオンにしてください。");
            return;
          }
        }
        pickerResult = await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.8 });
      } catch (e: any) {
        setError("カメラの起動に失敗しました: " + e.message);
        return;
      }
    } else {
      try {
        if (Platform.OS !== "web") {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            setError("フォトライブラリへのアクセス許可が必要です。設定アプリ → StudyApp → 写真 をオンにしてください。");
            return;
          }
        }
        pickerResult = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.8 });
      } catch (e: any) {
        setError("ギャラリーの起動に失敗しました: " + e.message);
        return;
      }
    }
    if (pickerResult.canceled) return;

    const image = pickerResult.assets[0];
    const fileName = image.fileName || (useCamera ? "camera.jpg" : "image.jpg");
    console.log("[handleImagePick] image:", { uri: image.uri, mimeType: image.mimeType, fileName, width: image.width, height: image.height });
    setImageLoading(true);
    setImageFileName(fileName);

    const formData = new FormData();
    if (Platform.OS === "web") {
      const blob = await (await fetch(image.uri)).blob();
      formData.append("image", blob, fileName);
      console.log("[handleImagePick] web: blob appended, size:", blob.size);
    } else {
      const fileEntry = { uri: image.uri, type: image.mimeType || "image/jpeg", name: fileName };
      console.log("[handleImagePick] native: appending fileEntry:", fileEntry);
      formData.append("image", fileEntry as any);
    }
    try {
      console.log("[handleImagePick] sending to", `${API_BASE_URL}/extract-image`);
      const res = await fetch(`${API_BASE_URL}/extract-image`, { method: "POST", body: formData });
      console.log("[handleImagePick] response status:", res.status);
      const data = await res.json();
      console.log("[handleImagePick] response data keys:", Object.keys(data));
      if (data.error) throw new Error(data.error);
      setAnswer(data.text);
    } catch (e: any) {
      console.log("[handleImagePick] ERROR:", e.message);
      setError("画像の読み込みに失敗しました: " + e.message);
      setImageFileName("");
    } finally {
      setImageLoading(false);
    }
  };

  const handleAddAnswerImage = async () => {
    if (answerImages.length >= 3) { setError("画像は最大3枚まで追加できます。"); return; }
    if (Platform.OS !== "web") {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setError("フォトライブラリへのアクセス許可が必要です。"); return; }
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.7, base64: true });
    if (result.canceled) return;
    const img = result.assets[0];
    if (img.base64) {
      setAnswerImages(prev => [...prev, { uri: img.uri, base64: img.base64! }]);
    }
  };

  const handleSubmit = async () => {
    if (!question || !answer) return;
    setLoading(true);
    setResult("");
    setSummary("");
    setRefPages([]);
    setError("");
    setChatMessages([]);
    try {
      const res = await fetch(`${API_BASE_URL}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question, answer, subject,
          bookIds: [...selectedBookIds],
          answerImages: answerImages.map(i => i.base64),
        }),
      });
      const data = await res.json();
      setResult(data.result);
      setSummary(data.summary || "");
      setRefPages(data.refPages || []);

      const newItem = {
        id: Date.now().toString(),
        subject, question, answer,
        result: data.result,
        score: data.score ?? null,
        date: new Date().toLocaleDateString("ja-JP"),
        topics: data.topics ?? [],
        wrongTopics: data.wrongTopics ?? [],
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

  const handleChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput.trim() };
    const msgs = [...chatMessages, userMsg];
    setChatMessages(msgs);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgs, subject, context: result }),
      });
      const data = await res.json();
      setChatMessages([...msgs, { role: "assistant", content: data.reply }]);
    } catch {
      setChatMessages([...msgs, { role: "assistant", content: "エラーが発生しました。もう一度お試しください。" }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleRefPageTap = async (refPage: string) => {
    setRefPageModalTitle(refPage);
    setRefPageModalText("検索中...");
    try {
      const res = await fetch(`${API_BASE_URL}/textbook/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: refPage, subject }),
      });
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        setRefPageModalText(data.results[0].excerpt);
      } else {
        setRefPageModalText("該当するテキストが見つかりませんでした。");
      }
    } catch {
      setRefPageModalText("取得に失敗しました。");
    }
  };

  const isReady = question.length > 0 && answer.length > 0;
  const booksForSubject = availableBooks.filter(b => b.subject === subject);

  const questionSection = (
    <View style={[styles.section, isTablet && styles.tabletHalf]}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>📄 問題文</Text>
        <TouchableOpacity style={styles.uploadButton} onPress={handlePdfUpload} disabled={pdfLoading}>
          {pdfLoading ? <ActivityIndicator size="small" color="#2563eb" /> : <Text style={styles.uploadButtonText}>📎 PDFから読み込む</Text>}
        </TouchableOpacity>
      </View>
      <View style={styles.pageRangeRow}>
        <Text style={styles.pageRangeLabel}>ページ範囲：</Text>
        <TextInput style={styles.pageInput} value={fromPage} onChangeText={setFromPage} placeholder="開始" keyboardType="numeric" placeholderTextColor="#94a3b8" />
        <Text style={styles.pageRangeSep}>〜</Text>
        <TextInput style={styles.pageInput} value={toPage} onChangeText={setToPage} placeholder="終了" keyboardType="numeric" placeholderTextColor="#94a3b8" />
        <Text style={styles.pageRangeHint}>（空欄=全ページ）</Text>
      </View>
      {pdfInfo && (
        <View style={styles.pdfPreview}>
          <Text style={styles.pdfPreviewText}>全{pdfInfo.totalPages}ページ中 {pdfInfo.fromPage}〜{pdfInfo.toPage}ページ読込済</Text>
          <Text style={styles.pdfPreviewText}>{question.length.toLocaleString()} 文字</Text>
        </View>
      )}
      {pdfInfo?.imagePages && pdfInfo.imagePages.length > 0 && (
        <View style={styles.imagePagesWarning}>
          <Text style={styles.imagePagesWarningText}>
            ⚠️ {pdfInfo.imagePages.length}ページに図・画像が含まれています。精度向上のため画像でも取り込むことをお勧めします
          </Text>
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
  );

  const answerSection = (
    <View style={[styles.section, isTablet && styles.tabletHalf]}>
      <Text style={styles.sectionTitle}>✏️ あなたの答案</Text>
      <View style={styles.imageButtonRow}>
        <TouchableOpacity style={[styles.imageButton, { backgroundColor: "#f5f3ff", borderColor: "#c4b5fd" }]} onPress={() => handleImagePick(false)} disabled={imageLoading}>
          {imageLoading ? <ActivityIndicator size="small" color="#7c3aed" /> : <Text style={[styles.imageButtonText, { color: "#7c3aed" }]}>🖼 ギャラリー</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.imageButton, { backgroundColor: "#fdf4ff", borderColor: "#e879f9" }]} onPress={() => handleImagePick(true)} disabled={imageLoading}>
          {imageLoading ? <ActivityIndicator size="small" color="#a21caf" /> : <Text style={[styles.imageButtonText, { color: "#a21caf" }]}>📸 カメラ</Text>}
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

      {/* 図・表画像追加 */}
      <View style={styles.answerImagesSection}>
        <View style={styles.answerImagesHeader}>
          <Text style={styles.answerImagesLabel}>📊 図・表の画像を追加（任意・最大3枚）</Text>
          {answerImages.length < 3 && (
            <TouchableOpacity style={styles.addImageButton} onPress={handleAddAnswerImage}>
              <Text style={styles.addImageButtonText}>＋</Text>
            </TouchableOpacity>
          )}
        </View>
        {answerImages.length > 0 && (
          <View style={styles.thumbnailRow}>
            {answerImages.map((img, i) => (
              <View key={i} style={styles.thumbnailContainer}>
                <Image source={{ uri: img.uri }} style={styles.thumbnail} />
                <TouchableOpacity
                  style={styles.thumbnailDelete}
                  onPress={() => setAnswerImages(prev => prev.filter((_, idx) => idx !== i))}
                >
                  <Text style={styles.thumbnailDeleteText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>✏️ 答案採点</Text>
          <Text style={styles.headerSub}>問題と答案を入力してAI採点</Text>
        </View>

        {/* 科目選択 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📌 科目</Text>
          <View style={styles.subjectGrid}>
            {SUBJECTS.map(s => (
              <TouchableOpacity key={s} style={[styles.subjectButton, subject === s && styles.subjectButtonActive]} onPress={() => setSubject(s)}>
                <Text style={[styles.subjectText, subject === s && styles.subjectTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 参照教科書 */}
        {booksForSubject.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📚 参照教科書（採点精度向上）</Text>
            {booksForSubject.map(book => (
              <TouchableOpacity key={book.bookId} style={styles.bookSelectRow} onPress={() => toggleBook(book.bookId)}>
                <View style={[styles.bookCheckbox, selectedBookIds.has(book.bookId) && styles.bookCheckboxActive]}>
                  {selectedBookIds.has(book.bookId) && <Text style={styles.bookCheckmark}>✓</Text>}
                </View>
                <Text style={styles.bookSelectName}>{book.bookName}</Text>
                <Text style={styles.bookSelectPages}>{book.totalPages}p</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {isTablet ? (
          <View style={styles.tabletRow}>
            {questionSection}
            {answerSection}
          </View>
        ) : (
          <>
            {questionSection}
            {answerSection}
          </>
        )}

        <TouchableOpacity style={[styles.button, !isReady && styles.buttonDisabled]} onPress={handleSubmit} disabled={!isReady || loading}>
          {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.buttonText}>🎯 採点する</Text>}
        </TouchableOpacity>

        {!isReady && <Text style={styles.hint}>問題文と答案を入力してください</Text>}

        {error !== "" && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
            <TouchableOpacity onPress={() => setError("")}>
              <Text style={styles.errorClose}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {result !== "" && (
          <>
            {/* 解説まとめ */}
            {summary !== "" && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>💡 解説まとめ</Text>
                <Text style={styles.summaryText}>{summary}</Text>
              </View>
            )}

            {/* 採点結果 */}
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

            {/* 参考ページ */}
            {refPages.length > 0 && (
              <View style={styles.refPagesCard}>
                <Text style={styles.refPagesTitle}>📖 参考ページ</Text>
                <View style={styles.refPagesRow}>
                  {refPages.map((rp, i) => (
                    <TouchableOpacity key={i} style={styles.refPageChip} onPress={() => handleRefPageTap(rp)}>
                      <Text style={styles.refPageChipText}>{rp}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* チャット */}
            <View style={styles.chatSection}>
              <Text style={styles.chatTitle}>💬 採点結果について質問する</Text>
              {chatMessages.map((msg, i) => (
                <View key={i} style={[styles.bubble, msg.role === "user" ? styles.bubbleUser : styles.bubbleAssistant]}>
                  <Text style={[styles.bubbleText, msg.role === "user" ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
                    {msg.content}
                  </Text>
                </View>
              ))}
              {chatLoading && (
                <View style={[styles.bubble, styles.bubbleAssistant]}>
                  <ActivityIndicator size="small" color="#2563eb" />
                </View>
              )}
              <View style={styles.chatInputRow}>
                <TextInput
                  style={styles.chatInput}
                  value={chatInput}
                  onChangeText={setChatInput}
                  placeholder="採点結果について質問..."
                  placeholderTextColor="#94a3b8"
                  multiline
                  maxLength={500}
                />
                <TouchableOpacity
                  style={[styles.chatSendButton, (!chatInput.trim() || chatLoading) && styles.chatSendButtonDisabled]}
                  onPress={handleChat}
                  disabled={chatLoading || !chatInput.trim()}
                >
                  <Text style={styles.chatSendText}>送信</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* 参考ページモーダル */}
      <Modal visible={refPageModalText !== ""} animationType="fade" transparent onRequestClose={() => setRefPageModalText("")}>
        <View style={styles.modalOverlay}>
          <View style={styles.refModal}>
            <Text style={styles.refModalTitle}>📖 {refPageModalTitle}</Text>
            <ScrollView style={styles.refModalScroll}>
              <Text style={styles.refModalText}>{refPageModalText}</Text>
            </ScrollView>
            <TouchableOpacity style={styles.refModalClose} onPress={() => setRefPageModalText("")}>
              <Text style={styles.refModalCloseText}>閉じる</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { backgroundColor: "#f1f5f9" },
  container: { padding: 20, paddingBottom: 60 },
  header: { backgroundColor: "#1e40af", borderRadius: 16, padding: 24, marginBottom: 20, alignItems: "center" },
  headerTitle: { fontSize: 24, fontWeight: "bold", color: "#fff", marginBottom: 4 },
  headerSub: { fontSize: 14, color: "#bfdbfe" },
  section: {
    backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: "#e2e8f0",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  tabletRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  tabletHalf: { flex: 1, marginBottom: 0 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "bold", color: "#1e40af", marginBottom: 10 },
  subjectGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  subjectButton: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, borderColor: "#cbd5e1", backgroundColor: "#f8fafc" },
  subjectButtonActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  subjectText: { color: "#64748b", fontSize: 13, fontWeight: "600" },
  subjectTextActive: { color: "#fff" },
  bookSelectRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f1f5f9", gap: 10 },
  bookCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "#cbd5e1", alignItems: "center", justifyContent: "center" },
  bookCheckboxActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  bookCheckmark: { color: "#fff", fontSize: 13, fontWeight: "bold" },
  bookSelectName: { flex: 1, fontSize: 14, color: "#1e293b" },
  bookSelectPages: { fontSize: 12, color: "#94a3b8" },
  uploadButton: { backgroundColor: "#eff6ff", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: "#bfdbfe", minWidth: 44, alignItems: "center" },
  uploadButtonText: { color: "#2563eb", fontSize: 13, fontWeight: "600" },
  pageRangeRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 6 },
  pageRangeLabel: { fontSize: 13, color: "#64748b" },
  pageInput: { width: 56, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 6, fontSize: 13, textAlign: "center", color: "#1e293b", backgroundColor: "#f8fafc" },
  pageRangeSep: { fontSize: 13, color: "#64748b" },
  pageRangeHint: { fontSize: 11, color: "#94a3b8" },
  pdfPreview: { backgroundColor: "#f0fdf4", borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: "#bbf7d0", flexDirection: "row", justifyContent: "space-between" },
  pdfPreviewText: { fontSize: 12, color: "#166534" },
  imagePagesWarning: { backgroundColor: "#fffbeb", borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: "#fde68a" },
  imagePagesWarningText: { fontSize: 12, color: "#92400e" },
  input: { backgroundColor: "#f8fafc", borderRadius: 10, padding: 14, fontSize: 15, minHeight: 140, borderWidth: 1.5, borderColor: "#e2e8f0", textAlignVertical: "top", color: "#1e293b", lineHeight: 22 },
  charCount: { fontSize: 12, color: "#94a3b8", textAlign: "right", marginTop: 6 },
  imageButtonRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  imageButton: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1.5, alignItems: "center" },
  imageButtonText: { fontSize: 13, fontWeight: "600" },
  ocrStatus: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#f5f3ff", borderRadius: 8, padding: 10, marginBottom: 10 },
  ocrStatusText: { color: "#7c3aed", fontSize: 13 },
  ocrDone: { backgroundColor: "#f0fdf4", borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: "#bbf7d0" },
  ocrDoneText: { color: "#166534", fontSize: 13 },
  answerImagesSection: { marginTop: 10 },
  answerImagesHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  answerImagesLabel: { fontSize: 13, color: "#64748b", flex: 1 },
  addImageButton: { backgroundColor: "#eff6ff", width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#bfdbfe" },
  addImageButtonText: { color: "#2563eb", fontSize: 18, fontWeight: "bold" },
  thumbnailRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  thumbnailContainer: { position: "relative" },
  thumbnail: { width: 72, height: 72, borderRadius: 8, borderWidth: 1, borderColor: "#e2e8f0" },
  thumbnailDelete: { position: "absolute", top: -6, right: -6, backgroundColor: "#dc2626", width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  thumbnailDeleteText: { color: "#fff", fontSize: 11, fontWeight: "bold" },
  button: { backgroundColor: "#2563eb", paddingVertical: 16, borderRadius: 14, alignItems: "center", marginBottom: 8, shadowColor: "#2563eb", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  buttonDisabled: { backgroundColor: "#94a3b8", shadowOpacity: 0 },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  hint: { textAlign: "center", color: "#94a3b8", fontSize: 13, marginBottom: 16 },
  errorBox: { backgroundColor: "#fef2f2", borderRadius: 10, padding: 14, marginBottom: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: "#fecaca" },
  errorText: { color: "#dc2626", fontSize: 14, flex: 1 },
  errorClose: { color: "#dc2626", fontSize: 18, fontWeight: "bold", marginLeft: 8 },
  summaryCard: { backgroundColor: "#fefce8", borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#fde68a" },
  summaryTitle: { fontSize: 15, fontWeight: "bold", color: "#854d0e", marginBottom: 8 },
  summaryText: { fontSize: 14, color: "#78350f", lineHeight: 22 },
  resultCard: { backgroundColor: "#fff", borderRadius: 14, padding: 20, marginTop: 8, borderWidth: 1, borderColor: "#e2e8f0", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6 },
  resultHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  resultTitle: { fontSize: 18, fontWeight: "bold", color: "#1e40af" },
  resultBadge: { backgroundColor: "#eff6ff", paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, borderColor: "#bfdbfe" },
  resultBadgeText: { color: "#2563eb", fontSize: 12, fontWeight: "600" },
  resultDivider: { height: 1, backgroundColor: "#e2e8f0", marginBottom: 14 },
  refPagesCard: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginTop: 10, borderWidth: 1, borderColor: "#e2e8f0" },
  refPagesTitle: { fontSize: 14, fontWeight: "bold", color: "#1e40af", marginBottom: 10 },
  refPagesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  refPageChip: { backgroundColor: "#eff6ff", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: "#bfdbfe" },
  refPageChipText: { color: "#2563eb", fontSize: 13, fontWeight: "600" },
  chatSection: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginTop: 12, borderWidth: 1, borderColor: "#e2e8f0" },
  chatTitle: { fontSize: 15, fontWeight: "bold", color: "#1e40af", marginBottom: 12 },
  bubble: { maxWidth: "85%", borderRadius: 12, padding: 12, marginBottom: 8 },
  bubbleUser: { backgroundColor: "#2563eb", alignSelf: "flex-end", borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: "#f1f5f9", alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextUser: { color: "#fff" },
  bubbleTextAssistant: { color: "#1e293b" },
  chatInputRow: { flexDirection: "row", gap: 8, marginTop: 8, alignItems: "flex-end" },
  chatInput: { flex: 1, backgroundColor: "#f8fafc", borderRadius: 10, padding: 12, fontSize: 14, borderWidth: 1.5, borderColor: "#e2e8f0", color: "#1e293b", maxHeight: 100 },
  chatSendButton: { backgroundColor: "#2563eb", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10 },
  chatSendButtonDisabled: { backgroundColor: "#94a3b8" },
  chatSendText: { color: "#fff", fontSize: 14, fontWeight: "bold" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  refModal: { backgroundColor: "#fff", borderRadius: 16, padding: 20, width: "100%", maxHeight: "70%" },
  refModalTitle: { fontSize: 16, fontWeight: "bold", color: "#1e40af", marginBottom: 12 },
  refModalScroll: { maxHeight: 300, marginBottom: 16 },
  refModalText: { fontSize: 14, color: "#334155", lineHeight: 22 },
  refModalClose: { backgroundColor: "#2563eb", borderRadius: 10, padding: 12, alignItems: "center" },
  refModalCloseText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
});

const markdownStyles = {
  body: { fontSize: 15, lineHeight: 24, color: "#334155" },
  heading1: { fontSize: 20, fontWeight: "bold" as const, color: "#1e40af", marginVertical: 8 },
  heading2: { fontSize: 17, fontWeight: "bold" as const, color: "#2563eb", marginVertical: 6 },
  heading3: { fontSize: 15, fontWeight: "bold" as const, color: "#3b82f6", marginVertical: 4 },
  strong: { fontWeight: "bold" as const },
  bullet_list: { marginVertical: 4 },
  list_item: { marginVertical: 2 },
};
