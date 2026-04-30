import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SERVER = 'https://studyapp-production-66d5.up.railway.app';

const COLOR_MAP: Record<string, string> = { red: '#FF3B30', yellow: '#FF9500', green: '#34C759' };

// 日本語対応のJaccard類似度（1文字単位で分割）
function jaccardSim(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const setA = new Set(a.replace(/\s+/g, '').split(''));
  const setB = new Set(b.replace(/\s+/g, '').split(''));
  let intersection = 0;
  setA.forEach((c) => { if (setB.has(c)) intersection++; });
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}
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

type CompareHistoryItem = {
  id: string;
  date: string;
  result: GradeResult;
};

const STORAGE_KEY = 'compare_history';
const MAX_HISTORY = 20;

export default function CompareScreen() {
  const [answerUri, setAnswerUri] = useState<string | null>(null);
  const [answerB64, setAnswerB64] = useState<string | null>(null);
  const [modelUri, setModelUri] = useState<string | null>(null);
  const [modelB64, setModelB64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastSavedDate, setLastSavedDate] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    loadLastSaved();
  }, []));

  const loadLastSaved = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) { console.log('[compare][load] no saved data'); return; }
      const items: CompareHistoryItem[] = JSON.parse(raw);
      console.log('[compare][load] items count:', items.length);
      if (items.length === 0) return;
      const latest = items[items.length - 1];
      setLastSavedDate(latest.date);
      if (result === null) {
        setResult(latest.result);
        setSaveStatus('saved');
        console.log('[compare][load] restored score:', latest.result.score, 'date:', latest.date);
      }
    } catch (e: any) {
      console.log('[compare][load] ERROR:', e.message);
    }
  };

  const saveResult = async () => {
    if (!result) return;
    setSaveStatus('saving');
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const items: CompareHistoryItem[] = raw ? JSON.parse(raw) : [];
      const newItem: CompareHistoryItem = {
        id: Date.now().toString(),
        date: new Date().toLocaleString('ja-JP'),
        result,
      };
      const updated = [...items, newItem].slice(-MAX_HISTORY);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setLastSavedDate(newItem.date);
      setSaveStatus('saved');
      console.log('[compare][save] saved id:', newItem.id, 'score:', result.score, 'total items:', updated.length);
    } catch (e: any) {
      setSaveStatus('idle');
      console.log('[compare][save] ERROR:', e.message);
      Alert.alert('保存エラー', e.message);
    }
  };

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
      setSaveStatus('idle');
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
              <TouchableOpacity
                key={i}
                style={styles.overlayRow}
                activeOpacity={0.7}
                onPress={() => {
                  console.log('[compare][modal] open feedback:', fb.type, 'priority:', fb.priority);
                  setSelectedFeedback(fb);
                }}
              >
                <View style={[styles.overlayDot, { backgroundColor: COLOR_MAP[fb.color] || '#999' }]} />
                <View style={styles.overlayTextWrap}>
                  <Text style={styles.overlayType}>{TYPE_ICON[fb.type] || '•'} {fb.type}</Text>
                  <Text style={styles.overlayPoint} numberOfLines={2}>{fb.point}</Text>
                </View>
                <Text style={styles.overlayChevron}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  const closeFeedbackModal = () => {
    console.log('[compare][modal] close');
    setSelectedFeedback(null);
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* フィードバック詳細モーダル */}
      <Modal
        visible={selectedFeedback !== null}
        transparent
        animationType="fade"
        onRequestClose={closeFeedbackModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeFeedbackModal}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {selectedFeedback !== null && (
              <>
                <View style={styles.modalHeader}>
                  <View style={[styles.modalColorBar, { backgroundColor: COLOR_MAP[selectedFeedback.color] || '#999' }]} />
                  <View style={styles.modalTitleWrap}>
                    <Text style={styles.modalTypeIcon}>{TYPE_ICON[selectedFeedback.type] || '•'}</Text>
                    <Text style={styles.modalTypeName}>{selectedFeedback.type}</Text>
                  </View>
                  <TouchableOpacity onPress={closeFeedbackModal} style={styles.modalCloseBtn} hitSlop={8}>
                    <Text style={styles.modalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.modalPriorityRow}>
                  <Text style={styles.modalPriorityLabel}>優先度</Text>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <View
                      key={n}
                      style={[
                        styles.modalPriorityDot,
                        { backgroundColor: n <= selectedFeedback.priority ? COLOR_MAP[selectedFeedback.color] || '#999' : '#E5E5EA' },
                      ]}
                    />
                  ))}
                </View>
                <Text style={styles.modalPointLabel}>指摘内容</Text>
                <Text style={styles.modalPointText}>{selectedFeedback.point}</Text>
                <TouchableOpacity style={[styles.modalOkBtn, { backgroundColor: COLOR_MAP[selectedFeedback.color] || '#007AFF' }]} onPress={closeFeedbackModal}>
                  <Text style={styles.modalOkText}>閉じる</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

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

            {/* 思考ステップ差分 */}
            <Text style={styles.sectionTitle}>🧠 思考ステップ差分</Text>
            {(['issueRecognition', 'premise', 'logic', 'conclusion'] as const).map((key) => {
              const labels: Record<string, string> = {
                issueRecognition: '論点認識', premise: '前提整理', logic: '計算/ロジック', conclusion: '結論',
              };
              const answerText = result.answerSteps[key] || '';
              const modelText = result.modelSteps[key] || '';
              const sim = jaccardSim(answerText, modelText);
              const isClose = sim >= 0.25;
              console.log(`[compare][diff] ${key} sim=${sim.toFixed(2)} isClose=${isClose}`);
              return (
                <View key={key} style={styles.diffCard}>
                  <View style={styles.diffLabelRow}>
                    <Text style={styles.diffStepLabel}>{labels[key]}</Text>
                    <View style={[styles.diffBadge, { backgroundColor: isClose ? '#D1FAE5' : '#FEE2E2' }]}>
                      <Text style={[styles.diffBadgeText, { color: isClose ? '#065F46' : '#991B1B' }]}>
                        {isClose ? '✓ 類似' : '✗ 相違'}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.diffRow, { backgroundColor: isClose ? '#F0FFF4' : '#FFF5F5' }]}>
                    <Text style={styles.diffSideLabel}>自分</Text>
                    <Text style={styles.diffText}>{answerText || '-'}</Text>
                  </View>
                  <View style={styles.diffDivider} />
                  <View style={[styles.diffRow, styles.diffModelRow]}>
                    <Text style={styles.diffSideLabel}>模範</Text>
                    <Text style={styles.diffText}>{modelText || '-'}</Text>
                  </View>
                </View>
              );
            })}

            {/* 保存ボタン */}
            <TouchableOpacity
              style={[styles.saveBtn, saveStatus === 'saved' && styles.saveBtnDone]}
              onPress={saveResult}
              disabled={saveStatus !== 'idle'}
            >
              {saveStatus === 'saving' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>
                  {saveStatus === 'saved' ? '✅ 保存済み' : '💾 この結果を保存'}
                </Text>
              )}
            </TouchableOpacity>
            {lastSavedDate !== null && (
              <Text style={styles.savedDateText}>最終保存: {lastSavedDate}</Text>
            )}
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

  /* 思考ステップ差分 */
  diffCard: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 10,
    overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB',
  },
  diffLabelRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#F9FAFB',
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  diffStepLabel: { fontSize: 13, fontWeight: '700', color: '#374151' },
  diffBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  diffBadgeText: { fontSize: 11, fontWeight: '700' },
  diffRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10 },
  diffModelRow: { backgroundColor: '#F0FFF4' },
  diffSideLabel: {
    fontSize: 10, fontWeight: '700', color: '#6B7280',
    width: 28, paddingTop: 2, flexShrink: 0,
  },
  diffText: { flex: 1, fontSize: 13, color: '#1C1C1E', lineHeight: 18 },
  diffDivider: { height: 1, backgroundColor: '#E5E7EB' },

  /* フィードバック詳細モーダル */
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    width: '100%', backgroundColor: '#fff', borderRadius: 18,
    padding: 20, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, elevation: 8,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  modalColorBar: { width: 4, height: 28, borderRadius: 2 },
  modalTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalTypeIcon: { fontSize: 20 },
  modalTypeName: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  modalCloseBtn: { padding: 4 },
  modalCloseText: { fontSize: 18, color: '#8E8E93', fontWeight: '600' },
  modalPriorityRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  modalPriorityLabel: { fontSize: 12, color: '#8E8E93', marginRight: 4 },
  modalPriorityDot: { width: 10, height: 10, borderRadius: 5 },
  modalPointLabel: { fontSize: 12, fontWeight: '600', color: '#8E8E93', marginBottom: 8 },
  modalPointText: { fontSize: 15, color: '#1C1C1E', lineHeight: 22, marginBottom: 20 },
  modalOkBtn: { borderRadius: 12, padding: 14, alignItems: 'center' },
  modalOkText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  overlayChevron: { color: '#8E8E93', fontSize: 16, fontWeight: '600', alignSelf: 'center' },

  /* 保存ボタン */
  saveBtn: {
    backgroundColor: '#007AFF', borderRadius: 12, padding: 14,
    alignItems: 'center', marginTop: 20,
  },
  saveBtnDone: { backgroundColor: '#34C759' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  savedDateText: { textAlign: 'center', fontSize: 12, color: '#8E8E93', marginTop: 6 },
});
