import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { calcSubjectAvgScore, AvgScoreResult } from "@/utils/subjectAvgScore";
import { supabase } from "@/utils/supabase";
import { updateCautionTopics } from "@/utils/cautionTopics";
import { buildAnswerShareText } from "@/utils/shareResult";
import { apiClient, TextbookMeta } from "@/utils/apiClient";
import { pageToX, xToPage, clampFrom, clampTo } from "@/utils/pageRangeSlider";
import { useAppTheme } from "@/contexts/ThemeContext";
import { AppColors } from "@/constants/theme";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import DraggableFlatList, { ScaleDecorator } from "react-native-draggable-flatlist";
import Markdown from "react-native-markdown-display";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function RangeSlider({ min, max, from, to, onFromChange, onToChange }: {
  min: number; max: number; from: number; to: number;
  onFromChange: (v: number) => void; onToChange: (v: number) => void;
}) {
  const { colors } = useAppTheme();
  const sliderStyles = createSliderStyles(colors);
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const fromStartXRef = useRef(0);
  const toStartXRef = useRef(0);
  const fromRef = useRef(from);
  const toRef = useRef(to);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  const onFromRef = useRef(onFromChange);
  const onToRef = useRef(onToChange);

  fromRef.current = from;
  toRef.current = to;
  minRef.current = min;
  maxRef.current = max;
  onFromRef.current = onFromChange;
  onToRef.current = onToChange;

  const fromPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      fromStartXRef.current = pageToX(fromRef.current, minRef.current, maxRef.current, trackWidthRef.current);
    },
    onPanResponderMove: (_, g) => {
      const tw = trackWidthRef.current;
      const mn = minRef.current;
      const mx = maxRef.current;
      if (tw === 0 || mx <= mn) return;
      const toX = pageToX(toRef.current, mn, mx, tw);
      const newX = Math.max(0, Math.min(toX - 4, fromStartXRef.current + g.dx));
      const newVal = clampFrom(xToPage(newX, mn, mx, tw), mn, toRef.current);
      if (newVal !== fromRef.current) onFromRef.current(newVal);
    },
  })).current;

  const toPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      toStartXRef.current = pageToX(toRef.current, minRef.current, maxRef.current, trackWidthRef.current);
    },
    onPanResponderMove: (_, g) => {
      const tw = trackWidthRef.current;
      const mn = minRef.current;
      const mx = maxRef.current;
      if (tw === 0 || mx <= mn) return;
      const fromX = pageToX(fromRef.current, mn, mx, tw);
      const newX = Math.min(tw, Math.max(fromX + 4, toStartXRef.current + g.dx));
      const newVal = clampTo(xToPage(newX, mn, mx, tw), fromRef.current, mx);
      if (newVal !== toRef.current) onToRef.current(newVal);
    },
  })).current;

  const fromX = pageToX(from, min, max, trackWidth);
  const toX = pageToX(to, min, max, trackWidth);

  return (
    <View style={sliderStyles.wrapper}>
      <View
        style={sliderStyles.track}
        onLayout={e => {
          const w = e.nativeEvent.layout.width;
          trackWidthRef.current = w;
          setTrackWidth(w);
        }}
      >
        {trackWidth > 0 && (
          <>
            <View style={[sliderStyles.fill, { left: fromX, width: Math.max(0, toX - fromX) }]} />
            <View
              {...fromPan.panHandlers}
              style={[sliderStyles.thumb, { left: fromX - 12 }]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            />
            <View
              {...toPan.panHandlers}
              style={[sliderStyles.thumb, { left: toX - 12 }]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            />
          </>
        )}
      </View>
      <View style={sliderStyles.minMaxLabels}>
        <Text style={sliderStyles.minMaxText}>{min}p</Text>
        <Text style={sliderStyles.minMaxText}>{max}p</Text>
      </View>
    </View>
  );
}

function createSliderStyles(colors: AppColors) {
  return StyleSheet.create({
    wrapper: { paddingVertical: 4 },
    track: { height: 4, backgroundColor: colors.cardBorder, borderRadius: 2, position: "relative", marginVertical: 16, marginHorizontal: 16 },
    fill: { position: "absolute", height: 4, backgroundColor: colors.accent, borderRadius: 2 },
    thumb: { position: "absolute", top: -10, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, borderWidth: 3, borderColor: colors.cardBg, elevation: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3 },
    minMaxLabels: { flexDirection: "row", justifyContent: "space-between", marginHorizontal: 8 },
    minMaxText: { fontSize: 11, color: colors.textMuted },
  });
}

const MAX_IMAGES = 10;

const SUBJECTS = ["財務会計論", "管理会計論", "監査論", "企業法", "租税法", "経営学"];

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function AnswerScreen() {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const markdownStyles = createMarkdownStyles(colors);
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const insets = useSafeAreaInsets();
  const router = useRouter();

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
  const [imagePreviewUri, setImagePreviewUri] = useState<string | null>(null);
  const [questionOcrLoading, setQuestionOcrLoading] = useState(false);
  const [questionOcrFileName, setQuestionOcrFileName] = useState("");
  const [questionOcrPreviewUri, setQuestionOcrPreviewUri] = useState<string | null>(null);
  const [pdfInfo, setPdfInfo] = useState<{
    totalPages: number; fromPage: number; toPage: number; imagePages?: number[];
  } | null>(null);
  const [allPages, setAllPages] = useState(false);
  const [sliderMax, setSliderMax] = useState(100);
  const [sliderFrom, setSliderFrom] = useState(1);
  const [sliderTo, setSliderTo] = useState(100);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Question source mode
  const [questionSourceMode, setQuestionSourceMode] = useState<"manual" | "textbook">("manual");
  const [sourceBookId, setSourceBookId] = useState<string>("");
  const [sourceFromPage, setSourceFromPage] = useState<string>("");
  const [sourceToPage, setSourceToPage] = useState<string>("");
  const [chunksLoading, setChunksLoading] = useState(false);

  // Topic evaluation
  const [topicList, setTopicList] = useState<string[]>([]);
  const [topicEvaluation, setTopicEvaluation] = useState<{
    present: string[];
    missing: string[];
    irrelevant: string[];
  } | null>(null);

  // Textbook selection
  const [availableBooks, setAvailableBooks] = useState<TextbookMeta[]>([]);
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());

  // Question images (passed as vision to Claude)
  const [questionImages, setQuestionImages] = useState<{ uri: string; base64: string }[]>([]);

  // Answer images
  const [answerImages, setAnswerImages] = useState<{ uri: string; base64: string }[]>([]);

  // Subject average score
  const [subjectAvgScore, setSubjectAvgScore] = useState<AvgScoreResult | null>(null);

  // Subject selection modal
  const [subjectModalVisible, setSubjectModalVisible] = useState(false);

  // Ref page modal
  const [refPageModalText, setRefPageModalText] = useState("");
  const [refPageModalTitle, setRefPageModalTitle] = useState("");

  // Copy toast
  const [copyToast, setCopyToast] = useState(false);

  useFocusEffect(useCallback(() => {
    loadBooks();
    loadSubjectAvg(subject);
  }, []));

  useEffect(() => {
    loadSubjectAvg(subject);
  }, [subject]);

  const loadSubjectAvg = async (s: string) => {
    try {
      const raw = await AsyncStorage.getItem("history");
      const history = raw ? JSON.parse(raw) : [];
      setSubjectAvgScore(calcSubjectAvgScore(history, s));
    } catch {
      setSubjectAvgScore(null);
    }
  };

  const loadBooks = async () => {
    try {
      const books = await apiClient.listTextbooks();
      setAvailableBooks(books);
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

  const loadChunksFromTextbook = async () => {
    if (!sourceBookId) { setError("教科書を選択してください。"); return; }
    setChunksLoading(true);
    setError("");
    try {
      const data = await apiClient.getChunksByPages({ bookId: sourceBookId, fromPage: sourceFromPage, toPage: sourceToPage });
      setQuestion(data.text);
    } catch (e: any) {
      setError("教科書の読み込みに失敗しました: " + e.message);
    } finally {
      setChunksLoading(false);
    }
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
    if (!allPages) {
      formData.append("fromPage", String(sliderFrom));
      formData.append("toPage", String(sliderTo));
    }

    try {
      const data = await apiClient.extractPdf(formData);
      setQuestion(data.text);
      setPdfInfo({ totalPages: data.totalPages, fromPage: data.fromPage, toPage: data.toPage, imagePages: data.imagePages || [] });
      setSliderMax(data.totalPages);
      setSliderFrom(f => Math.min(f, data.totalPages));
      setSliderTo(data.totalPages);
    } catch (e: any) {
      const msg: string = e.message || "";
      if (e.name === "AbortError" || msg.includes("aborted")) {
        setError("接続がタイムアウトしました（30秒）。ネットワーク環境をご確認ください。");
      } else if (msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("network")) {
        setError("サーバーへの接続に失敗しました。Wi-Fi接続を確認してください。");
      } else if (msg.includes("NO_FILE")) {
        setError("ファイルの送信に失敗しました。PDFを再選択してください。");
      } else if (msg.includes("NO_TEXT")) {
        setError(
          Platform.OS === "web"
            ? "テキストを抽出できませんでした。スキャン画像PDFは画像としてギャラリーからアップロードしてください。"
            : "テキストを抽出できませんでした。スキャン画像PDFは「カメラで撮影」機能をご利用ください。"
        );
      } else if (msg.includes("PARSE_ERROR")) {
        setError("PDFの解析に失敗しました。パスワード保護や破損ファイルは読み込めません。");
      } else {
        setError("PDF読み込みに失敗しました: " + msg);
      }
    } finally {
      setPdfLoading(false);
    }
  };

  const handleOcrImagePick = async (
    useCamera: boolean,
    setPreviewUri: (uri: string | null) => void,
    setLoading: (v: boolean) => void,
    setFileName: (name: string) => void,
    onText: (text: string) => void,
  ) => {
    let pickerResult;
    if (useCamera) {
      if (Platform.OS === "web") { setError("Webブラウザではカメラを使用できません。ギャラリーから画像を選択してください。"); return; }
      try {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError("カメラの使用許可が必要です。設定アプリ → StudyApp → カメラ をオンにしてください。");
          return;
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
    setPreviewUri(image.uri);
    setLoading(true);
    setFileName(fileName);

    const formData = new FormData();
    if (Platform.OS === "web") {
      const blob = await (await fetch(image.uri)).blob();
      formData.append("image", blob, fileName);
    } else {
      formData.append("image", { uri: image.uri, type: image.mimeType || "image/jpeg", name: fileName } as any);
    }
    try {
      const data = await apiClient.extractImage(formData);
      onText(data.text);
    } catch (e: any) {
      setError("画像の読み込みに失敗しました: " + e.message);
      setFileName("");
    } finally {
      setLoading(false);
    }
  };

  const handleImagePick = (useCamera: boolean) =>
    handleOcrImagePick(useCamera, setImagePreviewUri, setImageLoading, setImageFileName, setAnswer);

  const handleQuestionImagePick = (useCamera: boolean) =>
    handleOcrImagePick(useCamera, setQuestionOcrPreviewUri, setQuestionOcrLoading, setQuestionOcrFileName, setQuestion);

  const pickImagesFromGallery = async (
    setter: React.Dispatch<React.SetStateAction<{ uri: string; base64: string }[]>>,
    currentCount: number,
  ) => {
    if (Platform.OS !== "web") {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setError("フォトライブラリへのアクセス許可が必要です。"); return; }
    }
    const remaining = MAX_IMAGES - currentCount;
    if (remaining <= 0) { setError(`画像は最大${MAX_IMAGES}枚まで追加できます。`); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images", quality: 0.7, base64: true,
      allowsMultipleSelection: true, selectionLimit: remaining,
    });
    if (res.canceled || res.assets.length === 0) return;
    const valid = res.assets.filter(a => !!a.base64);
    if (valid.length === 0) { setError("画像の読み込みに失敗しました。"); return; }
    setter(prev => [...prev, ...valid.map(a => ({ uri: a.uri, base64: a.base64! }))].slice(0, MAX_IMAGES));
  };

  const takePhotoAndAdd = async (
    setter: React.Dispatch<React.SetStateAction<{ uri: string; base64: string }[]>>,
    currentCount: number,
  ) => {
    if (Platform.OS === "web") { setError("Webブラウザではカメラを使用できません。ギャラリーから選択してください。"); return; }
    if (currentCount >= MAX_IMAGES) { setError(`画像は最大${MAX_IMAGES}枚まで追加できます。`); return; }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { setError("カメラの使用許可が必要です。"); return; }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.7, base64: true });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    if (!asset.base64) { setError("画像の読み込みに失敗しました。"); return; }
    setter(prev => [...prev, { uri: asset.uri, base64: asset.base64! }].slice(0, MAX_IMAGES));
  };

  const handleSubmit = async () => {
    if (!question || !answer) return;
    setLoading(true);
    setResult("");
    setSummary("");
    setRefPages([]);
    setError("");
    setChatMessages([]);
    setTopicList([]);
    setTopicEvaluation(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? "unknown";
      const data = await apiClient.grade({
        question, answer, subject, userId,
        bookIds: [...selectedBookIds],
        questionImages: questionImages.map(i => i.base64),
        answerImages: answerImages.map(i => i.base64),
        ...(questionSourceMode === "textbook" && sourceBookId ? {
          sourceBookId, sourceFromPage, sourceToPage,
        } : {}),
      });
      setResult(data.result);
      setSummary(data.summary || "");
      setRefPages(data.refPages || []);
      setTopicList(data.topicList || []);
      setTopicEvaluation(data.topicEvaluation || null);

      const topics: string[] = data.topics ?? [];
      const wrongTopics: string[] = data.wrongTopics ?? [];
      const correctTopics = topics.filter(t => !wrongTopics.includes(t));

      const newItem = {
        id: Date.now().toString(),
        subject, question, answer,
        result: data.result,
        score: data.score ?? null,
        date: new Date().toLocaleDateString("ja-JP"),
        topics,
        wrongTopics,
      };
      const raw = await AsyncStorage.getItem("history");
      const history = raw ? JSON.parse(raw) : [];
      await AsyncStorage.setItem("history", JSON.stringify([...history, newItem]));

      if (wrongTopics.length > 0 || correctTopics.length > 0) {
        await updateCautionTopics(wrongTopics, correctTopics, subject);
      }
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
      const data = await apiClient.chat({ messages: msgs, subject, context: result });
      setChatMessages([...msgs, { role: "assistant", content: data.reply }]);
    } catch {
      setChatMessages([...msgs, { role: "assistant", content: "エラーが発生しました。もう一度お試しください。" }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleCopy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2000);
  };

  const handleCopyAll = () => {
    const lines: string[] = [];
    lines.push(`【${subject}】採点結果`);
    if (summary) { lines.push(""); lines.push("💡 解説まとめ"); lines.push(summary); }
    if (result) { lines.push(""); lines.push("📊 採点結果"); lines.push(result); }
    if (topicEvaluation) {
      lines.push(""); lines.push("🎯 論点評価");
      topicEvaluation.present.forEach(t => lines.push(`✅ ${t}`));
      topicEvaluation.missing.forEach(t => lines.push(`❌ ${t}`));
      topicEvaluation.irrelevant.forEach(t => lines.push(`⚠️ ${t}`));
    }
    handleCopy(lines.join("\n"));
  };

  const handleShare = async () => {
    const text = buildAnswerShareText({ subject, summary, result });
    try {
      await Share.share({ message: text });
    } catch {
      // silently ignore user cancellation
    }
  };

  const handleRefPageTap = async (refPage: string) => {
    setRefPageModalTitle(refPage);
    setRefPageModalText("検索中...");
    try {
      const data = await apiClient.searchTextbook({ query: refPage, subject });
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
      {/* Source mode toggle */}
      <View style={styles.sourceToggleRow}>
        <TouchableOpacity
          style={[styles.sourceToggleBtn, questionSourceMode === "manual" && styles.sourceToggleBtnActive]}
          onPress={() => setQuestionSourceMode("manual")}
        >
          <Text style={[styles.sourceToggleText, questionSourceMode === "manual" && styles.sourceToggleTextActive]}>✏️ テキスト入力</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sourceToggleBtn, questionSourceMode === "textbook" && styles.sourceToggleBtnActive]}
          onPress={() => setQuestionSourceMode("textbook")}
        >
          <Text style={[styles.sourceToggleText, questionSourceMode === "textbook" && styles.sourceToggleTextActive]}>📚 教科書から選択</Text>
        </TouchableOpacity>
      </View>

      {questionSourceMode === "manual" ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📄 問題文</Text>
            <TouchableOpacity style={styles.uploadButton} onPress={handlePdfUpload} disabled={pdfLoading}>
              {pdfLoading ? <ActivityIndicator size="small" color="#2563eb" /> : <Text style={styles.uploadButtonText}>📎 PDFから読み込む</Text>}
            </TouchableOpacity>
          </View>
          <View style={styles.imageButtonRow}>
            <TouchableOpacity
              style={[styles.imageButton, { backgroundColor: "#f0fdf4", borderColor: "#86efac" }]}
              onPress={() => handleQuestionImagePick(false)}
              disabled={questionOcrLoading}
            >
              {questionOcrLoading ? <ActivityIndicator size="small" color="#166534" /> : <Text style={[styles.imageButtonText, { color: "#166534" }]}>🖼 ギャラリー</Text>}
            </TouchableOpacity>
            {Platform.OS !== "web" && (
              <TouchableOpacity
                style={[styles.imageButton, { backgroundColor: "#fefce8", borderColor: "#fde047" }]}
                onPress={() => handleQuestionImagePick(true)}
                disabled={questionOcrLoading}
              >
                {questionOcrLoading ? <ActivityIndicator size="small" color="#854d0e" /> : <Text style={[styles.imageButtonText, { color: "#854d0e" }]}>📸 カメラで撮影</Text>}
              </TouchableOpacity>
            )}
          </View>
          {questionOcrPreviewUri && (
            <Image source={{ uri: questionOcrPreviewUri }} style={styles.imagePreview} resizeMode="contain" />
          )}
          {questionOcrLoading && (
            <View style={styles.ocrStatus}>
              <ActivityIndicator size="small" color="#166534" />
              <Text style={[styles.ocrStatusText, { color: "#166534" }]}>AIが問題文を読み取り中...</Text>
            </View>
          )}
          {!questionOcrLoading && questionOcrFileName !== "" && (
            <View style={styles.ocrDone}>
              <Text style={styles.ocrDoneText}>✅ 「{questionOcrFileName}」から問題文を読み取りました</Text>
            </View>
          )}
          <View style={styles.pageRangeSection}>
            <View style={styles.pageRangeHeader}>
              <Text style={styles.pageRangeLabel}>ページ範囲</Text>
              <TouchableOpacity
                style={[styles.allPagesToggle, allPages && styles.allPagesToggleActive]}
                onPress={() => {
                  const next = !allPages;
                  setAllPages(next);
                  if (next) {
                    setSliderFrom(1);
                    setSliderTo(sliderMax);
                  }
                }}
              >
                <Text style={[styles.allPagesToggleText, allPages && styles.allPagesToggleTextActive]}>全ページ</Text>
              </TouchableOpacity>
            </View>
            {!allPages && (
              <RangeSlider
                min={1}
                max={sliderMax}
                from={sliderFrom}
                to={sliderTo}
                onFromChange={setSliderFrom}
                onToChange={setSliderTo}
              />
            )}
            <Text style={styles.pageRangeDisplay}>
              {allPages ? `全ページ（1〜${sliderMax}p）` : `P.${sliderFrom} 〜 P.${sliderTo}`}
            </Text>
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
            placeholderTextColor={colors.textMuted}
            value={question}
            onChangeText={setQuestion}
          />
          <Text style={styles.charCount}>{question.length.toLocaleString()} 文字</Text>
        </>
      ) : (
        <>
          <Text style={styles.sectionTitle}>📚 問題文（教科書から選択）</Text>
          {availableBooks.length === 0 ? (
            <Text style={styles.noBooksText}>教科書が登録されていません。先に教科書タブから登録してください。</Text>
          ) : (
            <>
              {availableBooks.map(book => (
                <TouchableOpacity key={book.bookId} style={styles.bookSelectRow} onPress={() => setSourceBookId(book.bookId)}>
                  <View style={[styles.bookCheckbox, sourceBookId === book.bookId && styles.bookCheckboxActive]}>
                    {sourceBookId === book.bookId && <Text style={styles.bookCheckmark}>✓</Text>}
                  </View>
                  <Text style={styles.bookSelectName}>{book.bookName}</Text>
                  <Text style={styles.bookSelectPages}>{book.subject} / {book.totalPages}p</Text>
                </TouchableOpacity>
              ))}
              <View style={styles.pageRangeRow}>
                <Text style={styles.pageRangeLabel}>ページ範囲：P.</Text>
                <TextInput style={styles.pageInput} value={sourceFromPage} onChangeText={setSourceFromPage} placeholder="開始" keyboardType="numeric" placeholderTextColor={colors.textMuted} />
                <Text style={styles.pageRangeSep}>〜P.</Text>
                <TextInput style={styles.pageInput} value={sourceToPage} onChangeText={setSourceToPage} placeholder="終了" keyboardType="numeric" placeholderTextColor={colors.textMuted} />
              </View>
              <TouchableOpacity
                style={[styles.loadChunksButton, (!sourceBookId || chunksLoading) && styles.buttonDisabled]}
                onPress={loadChunksFromTextbook}
                disabled={!sourceBookId || chunksLoading}
              >
                {chunksLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.loadChunksButtonText}>📖 このページを読み込む</Text>}
              </TouchableOpacity>
            </>
          )}
          {question !== "" && (
            <>
              <View style={styles.pdfPreview}>
                <Text style={styles.pdfPreviewText}>読み込み済み：{question.length.toLocaleString()} 文字</Text>
              </View>
              <TextInput
                style={[styles.input, styles.inputReadonly]}
                multiline
                value={question}
                onChangeText={setQuestion}
                placeholderTextColor={colors.textMuted}
              />
            </>
          )}
        </>
      )}


      {/* 問題文画像追加 */}
      <View style={styles.answerImagesSection}>
        <View style={styles.answerImagesHeader}>
          <Text style={styles.answerImagesLabel}>📷 問題文の画像を追加（任意・最大{MAX_IMAGES}枚）</Text>
          <Text style={styles.imageCountBadge}>{questionImages.length}/{MAX_IMAGES}</Text>
        </View>
        <View style={styles.imageButtonRow}>
          <TouchableOpacity
            style={[styles.imageButton, { backgroundColor: "#f0fdf4", borderColor: "#86efac" }]}
            onPress={() => pickImagesFromGallery(setQuestionImages, questionImages.length)}
          >
            <Text style={[styles.imageButtonText, { color: "#166534" }]}>🖼 ギャラリー</Text>
          </TouchableOpacity>
          {Platform.OS !== "web" && (
            <TouchableOpacity
              style={[styles.imageButton, { backgroundColor: "#fefce8", borderColor: "#fde047" }]}
              onPress={() => takePhotoAndAdd(setQuestionImages, questionImages.length)}
            >
              <Text style={[styles.imageButtonText, { color: "#854d0e" }]}>📸 カメラ</Text>
            </TouchableOpacity>
          )}
        </View>
        {questionImages.length > 0 && (
          <DraggableFlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={questionImages}
            keyExtractor={item => item.uri}
            onDragEnd={({ data }) => setQuestionImages(data)}
            containerStyle={styles.thumbnailRow}
            renderItem={({ item, drag, isActive }) => (
              <ScaleDecorator>
                <View style={[styles.thumbnailContainer, isActive && styles.thumbnailDragging]}>
                  <TouchableOpacity onLongPress={drag} delayLongPress={150} activeOpacity={0.8}>
                    <Image source={{ uri: item.uri }} style={styles.thumbnail} />
                    {questionImages.length > 1 && (
                      <View style={styles.dragHandle}>
                        <Text style={styles.dragHandleText}>≡</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.thumbnailDelete}
                    onPress={() => setQuestionImages(prev => prev.filter(img => img.uri !== item.uri))}
                  >
                    <Text style={styles.thumbnailDeleteText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </ScaleDecorator>
            )}
          />
        )}
      </View>
    </View>
  );

  const answerSection = (
    <View style={[styles.section, isTablet && styles.tabletHalf]}>
      <Text style={styles.sectionTitle}>✏️ あなたの答案</Text>
      <View style={styles.imageButtonRow}>
        <TouchableOpacity style={[styles.imageButton, { backgroundColor: "#f5f3ff", borderColor: "#c4b5fd" }]} onPress={() => handleImagePick(false)} disabled={imageLoading}>
          {imageLoading ? <ActivityIndicator size="small" color="#7c3aed" /> : <Text style={[styles.imageButtonText, { color: "#7c3aed" }]}>🖼 ギャラリー</Text>}
        </TouchableOpacity>
        {Platform.OS !== "web" && (
          <TouchableOpacity style={[styles.imageButton, { backgroundColor: "#fdf4ff", borderColor: "#e879f9" }]} onPress={() => handleImagePick(true)} disabled={imageLoading}>
            {imageLoading ? <ActivityIndicator size="small" color="#a21caf" /> : <Text style={[styles.imageButtonText, { color: "#a21caf" }]}>📸 カメラ</Text>}
          </TouchableOpacity>
        )}
      </View>
      {imagePreviewUri && (
        <Image source={{ uri: imagePreviewUri }} style={styles.imagePreview} resizeMode="contain" />
      )}
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
        placeholderTextColor={colors.textMuted}
        value={answer}
        onChangeText={setAnswer}
      />
      <Text style={styles.charCount}>{answer.length.toLocaleString()} 文字</Text>

      {/* 図・表画像追加 */}
      <View style={styles.answerImagesSection}>
        <View style={styles.answerImagesHeader}>
          <Text style={styles.answerImagesLabel}>📊 答案の画像を追加（任意・最大{MAX_IMAGES}枚）</Text>
          <Text style={styles.imageCountBadge}>{answerImages.length}/{MAX_IMAGES}</Text>
        </View>
        <View style={styles.imageButtonRow}>
          <TouchableOpacity
            style={[styles.imageButton, { backgroundColor: "#f5f3ff", borderColor: "#c4b5fd" }]}
            onPress={() => pickImagesFromGallery(setAnswerImages, answerImages.length)}
          >
            <Text style={[styles.imageButtonText, { color: "#7c3aed" }]}>🖼 ギャラリー</Text>
          </TouchableOpacity>
          {Platform.OS !== "web" && (
            <TouchableOpacity
              style={[styles.imageButton, { backgroundColor: "#fdf4ff", borderColor: "#e879f9" }]}
              onPress={() => takePhotoAndAdd(setAnswerImages, answerImages.length)}
            >
              <Text style={[styles.imageButtonText, { color: "#a21caf" }]}>📸 カメラ</Text>
            </TouchableOpacity>
          )}
        </View>
        {answerImages.length > 0 && (
          <DraggableFlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={answerImages}
            keyExtractor={item => item.uri}
            onDragEnd={({ data }) => setAnswerImages(data)}
            containerStyle={styles.thumbnailRow}
            renderItem={({ item, drag, isActive }) => (
              <ScaleDecorator>
                <View style={[styles.thumbnailContainer, isActive && styles.thumbnailDragging]}>
                  <TouchableOpacity onLongPress={drag} delayLongPress={150} activeOpacity={0.8}>
                    <Image source={{ uri: item.uri }} style={styles.thumbnail} />
                    {answerImages.length > 1 && (
                      <View style={styles.dragHandle}>
                        <Text style={styles.dragHandleText}>≡</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.thumbnailDelete}
                    onPress={() => setAnswerImages(prev => prev.filter(img => img.uri !== item.uri))}
                  >
                    <Text style={styles.thumbnailDeleteText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </ScaleDecorator>
            )}
          />
        )}
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>✏️ 答案採点</Text>
          <Text style={styles.headerSub}>問題と答案を入力してAI採点</Text>
        </View>

        {/* 教科書未登録 CTA バナー */}
        {availableBooks.length === 0 && (
          <View style={styles.ctaBanner}>
            <Text style={styles.ctaBannerText}>📚 教科書を登録すると採点精度が上がります</Text>
            <TouchableOpacity style={styles.ctaBannerButton} onPress={() => router.push("/(tabs)/textbook" as any)}>
              <Text style={styles.ctaBannerButtonText}>教科書を登録する</Text>
            </TouchableOpacity>
          </View>
        )}

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
          {subjectAvgScore !== null && (
            <View style={styles.avgScoreBanner}>
              {subjectAvgScore.type === "none" ? (
                <Text style={styles.avgScoreFirstText}>🎉 初挑戦！</Text>
              ) : (
                <Text style={styles.avgScoreText}>📈 この科目の平均: <Text style={styles.avgScoreValue}>{subjectAvgScore.value}%</Text></Text>
              )}
            </View>
          )}
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

        <TouchableOpacity style={[styles.button, !isReady && styles.buttonDisabled]} onPress={() => setSubjectModalVisible(true)} disabled={!isReady || loading}>
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
                <View style={styles.summaryHeader}>
                  <Text style={styles.summaryTitle}>💡 解説まとめ</Text>
                  <TouchableOpacity style={styles.copyIconBtn} onPress={() => handleCopy(summary)}>
                    <Text style={styles.copyIconText}>📋</Text>
                  </TouchableOpacity>
                </View>
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
                <TouchableOpacity style={styles.copyIconBtn} onPress={() => handleCopy(result)}>
                  <Text style={styles.copyIconText}>📋</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
                  <Text style={styles.shareButtonText}>🔗 シェア</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.resultDivider} />
              <Markdown style={markdownStyles}>{result}</Markdown>
              <TouchableOpacity style={styles.copyAllButton} onPress={handleCopyAll}>
                <Text style={styles.copyAllButtonText}>📋 採点結果全体をコピー</Text>
              </TouchableOpacity>
            </View>

            {/* 論点評価 */}
            {topicEvaluation && (
              <View style={styles.topicEvalCard}>
                <Text style={styles.topicEvalTitle}>🎯 論点評価</Text>
                {topicList.length > 0 && (
                  <View style={styles.topicListSection}>
                    <Text style={styles.topicListTitle}>抽出論点：</Text>
                    {topicList.map((t, i) => (
                      <Text key={i} style={styles.topicItem}>• {t}</Text>
                    ))}
                  </View>
                )}
                {topicEvaluation.present.map((t, i) => (
                  <View key={`p${i}`} style={styles.topicRow}>
                    <Text style={[styles.topicPresent, { flex: 1 }]}>✅ {t}</Text>
                    <TouchableOpacity onPress={() => handleCopy(`✅ ${t}`)}>
                      <Text style={styles.copyIconText}>📋</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {topicEvaluation.missing.map((t, i) => (
                  <View key={`m${i}`} style={styles.topicRow}>
                    <Text style={[styles.topicMissing, { flex: 1 }]}>❌ {t}</Text>
                    <TouchableOpacity onPress={() => handleCopy(`❌ ${t}`)}>
                      <Text style={styles.copyIconText}>📋</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {topicEvaluation.irrelevant.map((t, i) => (
                  <View key={`ir${i}`} style={styles.topicRow}>
                    <Text style={[styles.topicIrrelevant, { flex: 1 }]}>⚠️ {t}</Text>
                    <TouchableOpacity onPress={() => handleCopy(`⚠️ ${t}`)}>
                      <Text style={styles.copyIconText}>📋</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

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
                  placeholderTextColor={colors.textMuted}
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

      {/* コピートースト */}
      {copyToast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>✅ コピーしました</Text>
        </View>
      )}

      {/* 科目選択モーダル */}
      <Modal visible={subjectModalVisible} animationType="slide" transparent onRequestClose={() => setSubjectModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.subjectModal}>
            <Text style={styles.subjectModalTitle}>📌 採点する科目を選択</Text>
            <View style={styles.subjectGrid}>
              {SUBJECTS.map(s => (
                <TouchableOpacity key={s} style={[styles.subjectButton, subject === s && styles.subjectButtonActive]} onPress={() => setSubject(s)}>
                  <Text style={[styles.subjectText, subject === s && styles.subjectTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.subjectModalActions}>
              <TouchableOpacity style={styles.subjectModalCancel} onPress={() => setSubjectModalVisible(false)}>
                <Text style={styles.subjectModalCancelText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.subjectModalConfirm} onPress={() => { setSubjectModalVisible(false); handleSubmit(); }}>
                <Text style={styles.subjectModalConfirmText}>この科目で採点</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    scroll: { backgroundColor: colors.screenBg },
    container: { padding: 20 },
    header: { backgroundColor: colors.accentDark, borderRadius: 16, padding: 24, marginBottom: 20, alignItems: "center" },
    headerTitle: { fontSize: 24, fontWeight: "bold", color: colors.textInverse, marginBottom: 4 },
    headerSub: { fontSize: 14, color: colors.accentBorder },
    section: {
      backgroundColor: colors.cardBg, borderRadius: 14, padding: 16, marginBottom: 16,
      borderWidth: 1, borderColor: colors.cardBorder,
      shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
    },
    tabletRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
    tabletHalf: { flex: 1, marginBottom: 0 },
    sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    sectionTitle: { fontSize: 15, fontWeight: "bold", color: colors.textAccent, marginBottom: 10 },
    subjectGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    subjectButton: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, borderColor: colors.inputBorderAlt, backgroundColor: colors.inputBg },
    subjectButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    subjectText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
    subjectTextActive: { color: colors.textInverse },
    bookSelectRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.screenBg, gap: 10 },
    bookCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.inputBorderAlt, alignItems: "center", justifyContent: "center" },
    bookCheckboxActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    bookCheckmark: { color: colors.textInverse, fontSize: 13, fontWeight: "bold" },
    bookSelectName: { flex: 1, fontSize: 14, color: colors.textPrimary },
    bookSelectPages: { fontSize: 12, color: colors.textMuted },
    uploadButton: { backgroundColor: colors.accentBg, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.accentBorder, minWidth: 44, alignItems: "center" },
    uploadButtonText: { color: colors.accent, fontSize: 13, fontWeight: "600" },
    pageRangeSection: { marginBottom: 10 },
    pageRangeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
    pageRangeLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: "600" },
    allPagesToggle: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1.5, borderColor: colors.inputBorderAlt, backgroundColor: colors.inputBg },
    allPagesToggleActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    allPagesToggleText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
    allPagesToggleTextActive: { color: colors.textInverse },
    pageRangeDisplay: { fontSize: 13, color: colors.accent, fontWeight: "600", textAlign: "center", marginTop: 2 },
    pdfPreview: { backgroundColor: colors.successBg, borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: colors.successBorder, flexDirection: "row", justifyContent: "space-between" },
    pdfPreviewText: { fontSize: 12, color: colors.successDark },
    imagePagesWarning: { backgroundColor: colors.warningBgAlt, borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: colors.warningBorderAlt },
    imagePagesWarningText: { fontSize: 12, color: colors.warningDark },
    input: { backgroundColor: colors.inputBg, borderRadius: 10, padding: 14, fontSize: 15, minHeight: 140, borderWidth: 1.5, borderColor: colors.inputBorder, textAlignVertical: "top", color: colors.textPrimary, lineHeight: 22 },
    charCount: { fontSize: 12, color: colors.textMuted, textAlign: "right", marginTop: 6 },
    imageButtonRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
    imageButton: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1.5, alignItems: "center" },
    imageButtonText: { fontSize: 13, fontWeight: "600" },
    imagePreview: { width: "100%", height: 160, borderRadius: 10, backgroundColor: colors.cardBorder, marginBottom: 10 },
    ocrStatus: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.purpleBg, borderRadius: 8, padding: 10, marginBottom: 10 },
    ocrStatusText: { color: colors.purple, fontSize: 13 },
    ocrDone: { backgroundColor: colors.successBg, borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: colors.successBorder },
    ocrDoneText: { color: colors.successDark, fontSize: 13 },
    answerImagesSection: { marginTop: 10 },
    answerImagesHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
    answerImagesLabel: { fontSize: 13, color: colors.textSecondary, flex: 1 },
    imageCountBadge: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
    thumbnailRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    thumbnailContainer: { position: "relative", marginRight: 8 },
    thumbnail: { width: 72, height: 72, borderRadius: 8, borderWidth: 1, borderColor: colors.cardBorder },
    thumbnailDelete: { position: "absolute", top: -6, right: -6, backgroundColor: colors.dangerText, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    thumbnailDeleteText: { color: colors.textInverse, fontSize: 11, fontWeight: "bold" },
    thumbnailDragging: { borderWidth: 2, borderColor: colors.accent, borderRadius: 8, opacity: 0.9 },
    dragHandle: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(37,99,235,0.7)", borderBottomLeftRadius: 8, borderBottomRightRadius: 8, alignItems: "center", paddingVertical: 1 },
    dragHandleText: { color: colors.textInverse, fontSize: 9, letterSpacing: 1 },
    button: { backgroundColor: colors.accent, paddingVertical: 16, borderRadius: 14, alignItems: "center", marginBottom: 8, shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
    buttonDisabled: { backgroundColor: colors.textMuted, shadowOpacity: 0 },
    buttonText: { color: colors.textInverse, fontSize: 18, fontWeight: "bold" },
    hint: { textAlign: "center", color: colors.textMuted, fontSize: 13, marginBottom: 16 },
    errorBox: { backgroundColor: colors.dangerBgAlt, borderRadius: 10, padding: 14, marginBottom: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: colors.dangerBorderAlt },
    errorText: { color: colors.dangerText, fontSize: 14, flex: 1 },
    errorClose: { color: colors.dangerText, fontSize: 18, fontWeight: "bold", marginLeft: 8 },
    summaryCard: { backgroundColor: colors.warningBgAlt, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.warningBorderAlt },
    summaryTitle: { fontSize: 15, fontWeight: "bold", color: colors.amberText },
    summaryText: { fontSize: 14, color: colors.amberTextDark, lineHeight: 22 },
    resultCard: { backgroundColor: colors.cardBg, borderRadius: 14, padding: 20, marginTop: 8, borderWidth: 1, borderColor: colors.cardBorder, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6 },
    resultHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    resultTitle: { fontSize: 18, fontWeight: "bold", color: colors.textAccent },
    resultBadge: { backgroundColor: colors.accentBg, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, borderColor: colors.accentBorder },
    resultBadgeText: { color: colors.accent, fontSize: 12, fontWeight: "600" },
    resultDivider: { height: 1, backgroundColor: colors.cardBorder, marginBottom: 14 },
    refPagesCard: { backgroundColor: colors.cardBg, borderRadius: 14, padding: 16, marginTop: 10, borderWidth: 1, borderColor: colors.cardBorder },
    refPagesTitle: { fontSize: 14, fontWeight: "bold", color: colors.textAccent, marginBottom: 10 },
    refPagesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    refPageChip: { backgroundColor: colors.accentBg, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.accentBorder },
    refPageChipText: { color: colors.accent, fontSize: 13, fontWeight: "600" },
    chatSection: { backgroundColor: colors.cardBg, borderRadius: 14, padding: 16, marginTop: 12, borderWidth: 1, borderColor: colors.cardBorder },
    chatTitle: { fontSize: 15, fontWeight: "bold", color: colors.textAccent, marginBottom: 12 },
    bubble: { maxWidth: "85%", borderRadius: 12, padding: 12, marginBottom: 8 },
    bubbleUser: { backgroundColor: colors.accent, alignSelf: "flex-end", borderBottomRightRadius: 4 },
    bubbleAssistant: { backgroundColor: colors.screenBg, alignSelf: "flex-start", borderBottomLeftRadius: 4 },
    bubbleText: { fontSize: 14, lineHeight: 20 },
    bubbleTextUser: { color: colors.textInverse },
    bubbleTextAssistant: { color: colors.textPrimary },
    chatInputRow: { flexDirection: "row", gap: 8, marginTop: 8, alignItems: "flex-end" },
    chatInput: { flex: 1, backgroundColor: colors.inputBg, borderRadius: 10, padding: 12, fontSize: 14, borderWidth: 1.5, borderColor: colors.inputBorder, color: colors.textPrimary, maxHeight: 100 },
    chatSendButton: { backgroundColor: colors.accent, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10 },
    chatSendButtonDisabled: { backgroundColor: colors.textMuted },
    chatSendText: { color: colors.textInverse, fontSize: 14, fontWeight: "bold" },
    modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "center", alignItems: "center", padding: 20 },
    refModal: { backgroundColor: colors.cardBg, borderRadius: 16, padding: 20, width: "100%", maxHeight: "70%" },
    refModalTitle: { fontSize: 16, fontWeight: "bold", color: colors.textAccent, marginBottom: 12 },
    refModalScroll: { maxHeight: 300, marginBottom: 16 },
    refModalText: { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
    refModalClose: { backgroundColor: colors.accent, borderRadius: 10, padding: 12, alignItems: "center" },
    refModalCloseText: { color: colors.textInverse, fontWeight: "bold", fontSize: 15 },
    subjectModal: { backgroundColor: colors.cardBg, borderRadius: 20, padding: 24, width: "100%" },
    subjectModalTitle: { fontSize: 17, fontWeight: "bold", color: colors.textAccent, marginBottom: 16, textAlign: "center" },
    subjectModalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
    subjectModalCancel: { flex: 1, backgroundColor: colors.statCardBg, borderRadius: 12, padding: 14, alignItems: "center" },
    subjectModalCancelText: { color: colors.textSecondary, fontSize: 15, fontWeight: "600" },
    subjectModalConfirm: { flex: 2, backgroundColor: colors.accent, borderRadius: 12, padding: 14, alignItems: "center" },
    subjectModalConfirmText: { color: colors.textInverse, fontSize: 15, fontWeight: "bold" },
    sourceToggleRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
    sourceToggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: colors.inputBorderAlt, backgroundColor: colors.inputBg, alignItems: "center" },
    sourceToggleBtnActive: { backgroundColor: colors.accentDark, borderColor: colors.accentDark },
    sourceToggleText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
    sourceToggleTextActive: { color: colors.textInverse },
    noBooksText: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginVertical: 12 },
    loadChunksButton: { backgroundColor: colors.cyan, paddingVertical: 12, borderRadius: 10, alignItems: "center", marginTop: 10 },
    loadChunksButtonText: { color: colors.textInverse, fontSize: 14, fontWeight: "bold" },
    inputReadonly: { backgroundColor: colors.infoBg, borderColor: colors.infoBorder },
    topicEvalCard: { backgroundColor: colors.cardBg, borderRadius: 14, padding: 16, marginTop: 10, borderWidth: 1, borderColor: colors.cardBorder },
    topicEvalTitle: { fontSize: 15, fontWeight: "bold", color: colors.textAccent, marginBottom: 10 },
    topicListSection: { backgroundColor: colors.statCardBg, borderRadius: 8, padding: 10, marginBottom: 10 },
    topicListTitle: { fontSize: 13, fontWeight: "600", color: colors.textSecondary, marginBottom: 4 },
    topicItem: { fontSize: 13, color: colors.textSecondary, marginBottom: 2 },
    topicRow: { paddingVertical: 4, flexDirection: "row" as const, alignItems: "center" as const },
    topicPresent: { fontSize: 14, color: colors.successText },
    topicMissing: { fontSize: 14, color: colors.dangerText },
    topicIrrelevant: { fontSize: 14, color: colors.warningText },
    ctaBanner: { backgroundColor: colors.accentBg, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.accentBorder, flexDirection: "row", alignItems: "center", gap: 12 },
    ctaBannerText: { flex: 1, fontSize: 13, color: colors.textAccent, fontWeight: "600" },
    ctaBannerButton: { backgroundColor: colors.accent, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
    ctaBannerButtonText: { color: colors.textInverse, fontSize: 13, fontWeight: "bold" },
    shareButton: { backgroundColor: colors.successBg, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.successBorder },
    shareButtonText: { color: colors.successDark, fontSize: 13, fontWeight: "600" },
    summaryHeader: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, marginBottom: 8 },
    copyIconBtn: { padding: 4 },
    copyIconText: { fontSize: 16 },
    copyAllButton: { marginTop: 12, backgroundColor: colors.accentBg, borderRadius: 10, paddingVertical: 10, alignItems: "center" as const, borderWidth: 1, borderColor: colors.accentBorder },
    copyAllButtonText: { color: colors.accent, fontSize: 14, fontWeight: "600" as const },
    toast: { position: "absolute" as const, bottom: 80, alignSelf: "center" as const, backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 20, paddingVertical: 10, paddingHorizontal: 20 },
    toastText: { color: "#fff", fontSize: 14, fontWeight: "600" as const },
    pageRangeRow: { flexDirection: "row" as const, alignItems: "center" as const, marginBottom: 10, gap: 6 },
    pageInput: { width: 56, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 8, padding: 6, fontSize: 13, textAlign: "center" as const, color: colors.textPrimary, backgroundColor: colors.inputBg },
    pageRangeSep: { fontSize: 13, color: colors.textMuted },
    avgScoreBanner: { marginTop: 12, backgroundColor: colors.accentBg, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.accentBorder, alignSelf: "flex-start" as const },
    avgScoreText: { fontSize: 13, color: colors.textAccent, fontWeight: "600" as const },
    avgScoreValue: { color: colors.accent, fontWeight: "bold" as const },
    avgScoreFirstText: { fontSize: 13, color: colors.successText, fontWeight: "600" as const },
  });
}

function createMarkdownStyles(colors: AppColors) {
  return {
    body: { fontSize: 15, lineHeight: 24, color: colors.textSecondary },
    heading1: { fontSize: 20, fontWeight: "bold" as const, color: colors.textAccent, marginVertical: 8 },
    heading2: { fontSize: 17, fontWeight: "bold" as const, color: colors.accent, marginVertical: 6 },
    heading3: { fontSize: 15, fontWeight: "bold" as const, color: colors.accent, marginVertical: 4 },
    strong: { fontWeight: "bold" as const },
    bullet_list: { marginVertical: 4 },
    list_item: { marginVertical: 2 },
  };
}
