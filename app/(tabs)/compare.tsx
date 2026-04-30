import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SERVER = 'https://studyapp-production-66d5.up.railway.app';

const COLOR_MAP: Record<string, string> = { red: '#FF3B30', yellow: '#FF9500', green: '#34C759' };
const TYPE_ICON: Record<string, string> = {
  '論点誤認': '🔴', '思考プロセスミス': '🟡', '計算ミス': '🟠', '前提不足': '🔵',
};

type Feedback = { priority: number; type: string; point: string; color: string };
type Steps = { issueRecognition: string; premise: string; logic: string; conclusion: string };
type GradeResult = {
  score: number;
  passed: boolean;
  fatalErrors: number;
  missingProcess: boolean;
  feedbacks: Feedback[];
  answerSteps: Steps;
  modelSteps: Steps;
  textbookRef?: string;
};

export default function CompareScreen() {
  const [answerUri, setAnswerUri] = useState<string | null>(null);
  const [answerB64, setAnswerB64] = useState<string | null>(null);
  const [modelUri, setModelUri] = useState<string | null>(null);
  const [modelB64, setModelB64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);

  const pickImage = async (
    setter: (uri: string) => void,
    b64Setter: (b64: string) => void,
    label: string,
  ) => {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('フォトライブラリへのアクセス許可が必要です'); return; }
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', base64: true, quality: 0.7 });
    console.log(`[compare][${label}] canceled:`, res.canceled);
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0];
      console.log(`[compare][${label}] uri:`, asset.uri, 'b64 len:', asset.base64?.length ?? 'undef');
      if (!asset.base64) { Alert.alert('画像の読み込みに失敗しました', 'base64データを取得できませんでした'); return; }
      setter(asset.uri);
      b64Setter(asset.base64);
    }
  };

  const takePhoto = async (
    setter: (uri: string) => void,
    b64Setter: (b64: string) => void,
    label: string,
  ) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('カメラ権限が必要です'); return; }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', base64: true, quality: 0.7 });
    console.log(`[compare][${label}] camera canceled:`, res.canceled);
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0];
      console.log(`[compare][${label}] uri:`, asset.uri, 'b64 len:', asset.base64?.length ?? 'undef');
      if (!asset.base64) { Alert.alert('画像の読み込みに失敗しました', 'base64データを取得できませんでした'); return; }
      setter(asset.uri);
      b64Setter(asset.base64);
    }
  };

  const analyze = async () => {
    if (!answerB64 || !modelB64) { Alert.alert('答案と模範解答の両方が必要です'); return; }
    console.log('[compare][analyze] b64 len answer:', answerB64.length, 'model:', modelB64.length);
    setLoading(true);
    setResult(null);
    try {
      const resp = await fetch(`${SERVER}/grade-compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answerImage: answerB64, modelAnswerImage: modelB64 }),
      });
      console.log('[compare][analyze] status:', resp.status);
      const data = await resp.json();
      console.log('[compare][analyze] data:', JSON.stringify(data).slice(0, 300));
      if (data.error) throw new Error(data.error);
      const safe: GradeResult = {
        score: typeof data.score === 'number' ? data.score : 0,
        passed: Boolean(data.passed),
        fatalErrors: typeof data.fatalErrors === 'number' ? data.fatalErrors : 0,
        missingProcess: Boolean(data.missingProcess),
        feedbacks: Array.isArray(data.feedbacks) ? data.feedbacks.slice(0, 5) : [],
        answerSteps: data.answerSteps ?? { issueRecognition: '-', premise: '-', logic: '-', conclusion: '-' },
        modelSteps: data.modelSteps ?? { issueRecognition: '-', premise: '-', logic: '-', conclusion: '-' },
        textbookRef: data.textbookRef ?? undefined,
      };
      console.log('[compare][analyze] safe score:', safe.score, 'feedbacks:', safe.feedbacks.length);
      setResult(safe);
    } catch (e: any) {
      console.log('[compare][analyze] ERROR:', e.message);
      Alert.alert('エラー', e.message);
    } finally {
      setLoading(false);
    }
  };

  // 答案画像 — resultあり→オーバーレイ付き / なし→プレーン
  const renderAnswerImage = () => {
    if (!answerUri) {
      return (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>画像を選択してください</Text>
        </View>
      );
    }
    const feedbacks = result?.feedbacks ?? [];
    return (
      <View style={styles.imageContainer}>
        <Image source={{ uri: answerUri }} style={styles.fullImage} resizeMode="contain" />
        {result !== null && feedbacks.length > 0 && (
          <View style={styles.feedbackOverlay}>
            <View style={styles.overlayHeader}>
              <Text style={styles.overlayTitle}>📌 指摘事項</Text>
              <View style={styles.overlayBadge}>
                <Text style={styles.overlayBadgeText}>{feedbacks.length}件</Text>
              </View>
            </View>
            {feedbacks.map((fb, i) => (
              <View key={i} style={styles.overlayRow}>
                <View style={[styles.overlayDot, { backgroundColor: COLOR_MAP[fb.color] || '#999' }]} />
                <View style={styles.overlayTextWrap}>
                  <Text style={styles.overlayType}>{TYPE_ICON[fb.type] || '•'} {fb.type}</Text>
                  <Text style={styles.overlayPoint} numberOfLines={2}>{fb.point}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>📝 比較添削</Text>

        <Text style={styles.label}>① 自分の答案</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.btn} onPress={() => takePhoto(setAnswerUri, setAnswerB64, 'answer')}>
            <Text style={styles.btnText}>📷 撮影</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={() => pickImage(setAnswerUri, setAnswerB64, 'answer')}>
            <Text style={styles.btnText}>🖼️ 選択</Text>
          </TouchableOpacity>
        </View>
        {renderAnswerImage()}

        <Text style={styles.label}>② 模範解答</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.btn} onPress={() => takePhoto(setModelUri, setModelB64, 'model')}>
            <Text style={styles.btnText}>📷 撮影</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={() => pickImage(setModelUri, setModelB64, 'model')}>
            <Text style={styles.btnText}>🖼️ 選択</Text>
          </TouchableOpacity>
        </View>
        {modelUri ? (
          <Image source={{ uri: modelUri }} style={styles.preview} resizeMode="contain" />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>画像を選択してください</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.analyzeBtn, (!answerB64 || !modelB64) && styles.disabled]}
          onPress={analyze}
          disabled={!answerB64 || !modelB64 || loading}
        >
          <Text style={styles.analyzeBtnText}>🔍 思考ズレを分析する</Text>
        </TouchableOpacity>

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>思考プロセスを解析中...（最大60秒）</Text>
          </View>
        )}

        {result !== null && (
          <View style={styles.resultBox}>
            {/* スコア */}
            <View style={styles.scoreRow}>
              <Text style={styles.scoreNum}>{result.score}点</Text>
              <View style={[styles.badge, result.passed ? styles.pass : styles.fail]}>
                <Text style={styles.badgeText}>{result.passed ? '合格ライン達成' : '合格ライン未達'}</Text>
              </View>
            </View>
            {result.fatalErrors > 0 && (
              <Text style={styles.fatal}>致命的ミス：{result.fatalErrors}件</Text>
            )}
            {result.missingProcess && (
              <Text style={styles.warn}>⚠️ 途中式がないため精度が低下しています</Text>
            )}

            {/* 教科書参照 */}
            {Boolean(result.textbookRef) && (
              <View style={styles.textbookBox}>
                <Text style={styles.sectionTitle}>📚 教科書参照</Text>
                <Text style={styles.textbookRef}>{result.textbookRef}</Text>
              </View>
            )}

            {/* 思考ステップ比較 */}
            <Text style={styles.sectionTitle}>🧠 思考ステップ比較</Text>
            {(['issueRecognition', 'premise', 'logic', 'conclusion'] as const).map((key) => {
              const labels: Record<string, string> = {
                issueRecognition: '論点認識', premise: '前提整理', logic: '計算/ロジック', conclusion: '結論',
              };
              const match = result.answerSteps[key] === result.modelSteps[key];
              return (
                <View key={key} style={styles.stepRow}>
                  <Text style={styles.stepLabel}>{labels[key]}</Text>
                  <Text style={styles.stepAnswer} numberOfLines={2}>{result.answerSteps[key] || '-'}</Text>
                  <Text style={[styles.stepMark, { color: match ? '#34C759' : '#FF3B30' }]}>
                    {match ? '✓' : '✗'}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F2F2F7' },
  container: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, color: '#1C1C1E' },
  label: { fontSize: 15, fontWeight: '600', color: '#3A3A3C', marginTop: 16, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E5E5EA' },
  btnText: { fontSize: 14, color: '#007AFF' },

  /* 答案画像コンテナ（オーバーレイ用） */
  imageContainer: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
    backgroundColor: '#1C1C1E',
    minHeight: 180,
  },
  fullImage: { width: '100%', height: 220 },
  feedbackOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10, 12, 20, 0.84)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  overlayHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  overlayTitle: { fontSize: 12, fontWeight: '700', color: '#fff' },
  overlayBadge: { backgroundColor: '#FF3B30', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  overlayBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  overlayRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  overlayDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4, flexShrink: 0 },
  overlayTextWrap: { flex: 1 },
  overlayType: { fontSize: 11, fontWeight: '700', color: '#E5E5EA', marginBottom: 1 },
  overlayPoint: { fontSize: 11, color: '#C7C7CC', lineHeight: 15 },

  /* 模範解答プレビュー（オーバーレイなし） */
  preview: { width: '100%', height: 180, borderRadius: 10, marginTop: 8, backgroundColor: '#E5E5EA' },

  placeholder: {
    width: '100%', height: 100, borderRadius: 10, marginTop: 8,
    backgroundColor: '#E5E5EA', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#D1D1D6',
  },
  placeholderText: { color: '#8E8E93', fontSize: 13 },

  analyzeBtn: { backgroundColor: '#007AFF', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  analyzeBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  disabled: { opacity: 0.4 },
  loadingBox: { alignItems: 'center', marginTop: 30, gap: 12 },
  loadingText: { color: '#8E8E93', fontSize: 14 },

  resultBox: { marginTop: 24 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  scoreNum: { fontSize: 40, fontWeight: 'bold', color: '#1C1C1E' },
  badge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  pass: { backgroundColor: '#D1F5D3' },
  fail: { backgroundColor: '#FFD6D6' },
  badgeText: { fontSize: 13, fontWeight: '600' },
  fatal: { color: '#FF3B30', fontSize: 14, marginBottom: 4 },
  warn: { color: '#FF9500', fontSize: 13, marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#1C1C1E', marginTop: 20, marginBottom: 10 },
  textbookBox: { backgroundColor: '#EEF4FF', borderRadius: 10, padding: 14 },
  textbookRef: { fontSize: 13, color: '#3A3A3C', lineHeight: 18, fontStyle: 'italic' },
  stepRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 6,
  },
  stepLabel: { fontSize: 11, color: '#8E8E93', width: 60 },
  stepAnswer: { flex: 1, fontSize: 12, color: '#1C1C1E' },
  stepMark: { fontSize: 16, fontWeight: 'bold' },
});
