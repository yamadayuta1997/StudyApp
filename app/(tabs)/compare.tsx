import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { moveItem } from '@/utils/imageReorder';
import { DAILY_LIMIT, checkAndIncrement, getDeviceId, getUsageCount, isDevDevice } from '@/utils/usageLimit';
import { updateCautionTopics } from '@/utils/cautionTopics';
import { isCloseEnough, jaccardSim } from '@/utils/jaccardSim';
import {
  ActivityIndicator,
  Alert,
  Image,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';

// Android で LayoutAnimation を有効化
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { SafeAreaView } from 'react-native-safe-area-context';

const SERVER = 'https://studyapp-production-66d5.up.railway.app';

const SUBJECTS = ['財務会計論', '管理会計論', '監査論', '企業法', '租税法', '経営学'];

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

type CompareHistoryItem = {
  id: string;
  date: string;
  subject: string;
  result: GradeResult;
  answerUri?: string;
};

const STORAGE_KEY = 'compare_history';
const MAX_HISTORY = 20;


const MAX_IMAGES = 10;

export default function CompareScreen() {
  const [answerUris, setAnswerUris] = useState<string[]>([]);
  const [answerB64s, setAnswerB64s] = useState<string[]>([]);
  const [modelUris, setModelUris] = useState<string[]>([]);
  const [modelB64s, setModelB64s] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastSavedDate, setLastSavedDate] = useState<string | null>(null);
const [usageCount, setUsageCount] = useState(0);
  const [limitReached, setLimitReached] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [evalScore, setEvalScore] = useState<number | null>(null);
  const [improvements, setImprovements] = useState<string[]>([]);
  const [promptTips, setPromptTips] = useState<string[]>([]);
  const [showOverlay, setShowOverlay] = useState(true);
  const [subject, setSubject] = useState('財務会計論');
  const [subjectModalVisible, setSubjectModalVisible] = useState(false);

  useFocusEffect(useCallback(() => {
    loadLastSaved();
    refreshUsage();
    loadPromptTips();
  }, []));

  const loadPromptTips = async () => {
    try {
      const raw = await AsyncStorage.getItem('compare_prompt_tips');
      const tips: string[] = raw ? JSON.parse(raw) : [];
      setPromptTips(tips);
      console.log('[compare][promptTips] loaded:', tips.length, 'tips');
    } catch (e: any) {
      console.log('[compare][promptTips] load error:', e.message);
    }
  };

  const resetPromptTips = () => {
    Alert.alert(
      'AIヒントをリセット',
      `蓄積された改善ヒント（${promptTips.length}件）を削除しますか？\n次回の分析から反映されなくなります。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'リセット',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('compare_prompt_tips');
              setPromptTips([]);
              console.log('[compare][promptTips] reset');
            } catch (e: any) {
              console.log('[compare][promptTips] reset error:', e.message);
              Alert.alert('エラー', 'リセットに失敗しました');
            }
          },
        },
      ],
    );
  };

  const refreshUsage = async () => {
    const dev = await isDevDevice();
    setIsDev(dev);
    const count = await getUsageCount();
    setUsageCount(count);
    setLimitReached(!dev && count >= DAILY_LIMIT);
    console.log('[compare][usage] isDev:', dev, 'count:', count, 'limitReached:', !dev && count >= DAILY_LIMIT);
  };

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
        if (latest.answerUri) setAnswerUris([latest.answerUri]);
        setSaveStatus('saved');
        console.log('[compare][load] restored score:', latest.result.score, 'answerUri:', latest.answerUri ?? 'none', 'date:', latest.date);
      }
    } catch (e: any) {
      console.log('[compare][load] ERROR:', e.message);
    }
  };

  const saveResult = async (r?: GradeResult, impsArg?: string[]) => {
    const gradeResult = r ?? result;
    const improvementsToSave = impsArg ?? improvements;
    if (!gradeResult) return;
    setSaveStatus('saving');
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const items: CompareHistoryItem[] = raw ? JSON.parse(raw) : [];
      const newItem: CompareHistoryItem = {
        id: Date.now().toString(),
        date: new Date().toLocaleString('ja-JP'),
        subject,
        result: gradeResult,
        answerUri: answerUris[0] ?? undefined,
      };
      const updated = [...items, newItem].slice(-MAX_HISTORY);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setLastSavedDate(newItem.date);
      setSaveStatus('saved');
      console.log('[compare][save] saved id:', newItem.id, 'score:', gradeResult.score, 'total items:', updated.length);
      // 改善案を promptTips に蓄積（次回分析に反映）
      if (improvementsToSave.length > 0) {
        const newTips = [...promptTips, ...improvementsToSave].slice(-10);
        await AsyncStorage.setItem('compare_prompt_tips', JSON.stringify(newTips));
        setPromptTips(newTips);
        console.log('[compare][save] promptTips updated:', newTips.length);
      }
    } catch (e: any) {
      setSaveStatus('idle');
      console.log('[compare][save] ERROR:', e.message);
      Alert.alert('保存エラー', e.message);
    }
  };

  const pickImages = async (
    urisSetter: React.Dispatch<React.SetStateAction<string[]>>,
    b64sSetter: React.Dispatch<React.SetStateAction<string[]>>,
    currentCount: number,
    label: string,
  ) => {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('フォトライブラリへのアクセス許可が必要です'); return; }
    }
    const remaining = MAX_IMAGES - currentCount;
    if (remaining <= 0) { Alert.alert(`最大${MAX_IMAGES}枚まで選択できます`); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      base64: true,
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    console.log(`[compare][${label}] canceled:`, res.canceled, 'assets:', res.assets?.length ?? 0);
    if (!res.canceled && res.assets.length > 0) {
      const validAssets = res.assets.filter(a => !!a.base64);
      if (validAssets.length < res.assets.length) {
        Alert.alert('一部の画像を読み込めませんでした', 'base64データを取得できなかった画像はスキップされました');
      }
      if (validAssets.length === 0) return;
      urisSetter(prev => [...prev, ...validAssets.map(a => a.uri)].slice(0, MAX_IMAGES));
      b64sSetter(prev => [...prev, ...validAssets.map(a => a.base64!)].slice(0, MAX_IMAGES));
      console.log(`[compare][${label}] added ${validAssets.length} images`);
    }
  };

  const takePhoto = async (
    urisSetter: React.Dispatch<React.SetStateAction<string[]>>,
    b64sSetter: React.Dispatch<React.SetStateAction<string[]>>,
    currentCount: number,
    label: string,
  ) => {
    if (Platform.OS === 'web') { Alert.alert('Webブラウザではカメラを使用できません。画像を選択してください。'); return; }
    if (currentCount >= MAX_IMAGES) { Alert.alert(`最大${MAX_IMAGES}枚まで選択できます`); return; }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('カメラ権限が必要です'); return; }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', base64: true, quality: 0.7 });
    console.log(`[compare][${label}] camera canceled:`, res.canceled);
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0];
      console.log(`[compare][${label}] uri:`, asset.uri, 'b64 len:', asset.base64?.length ?? 'undef');
      if (!asset.base64) { Alert.alert('画像の読み込みに失敗しました', 'base64データを取得できませんでした'); return; }
      urisSetter(prev => [...prev, asset.uri].slice(0, MAX_IMAGES));
      b64sSetter(prev => [...prev, asset.base64!].slice(0, MAX_IMAGES));
    }
  };

  const removeImage = (
    index: number,
    urisSetter: React.Dispatch<React.SetStateAction<string[]>>,
    b64sSetter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    urisSetter(prev => prev.filter((_, i) => i !== index));
    b64sSetter(prev => prev.filter((_, i) => i !== index));
  };

  const analyze = async () => {
    if (answerB64s.length === 0 || modelB64s.length === 0) { Alert.alert('答案と模範解答の両方が必要です'); return; }

    // 利用回数チェック
    const usage = await checkAndIncrement();
    setUsageCount(usage.count);
    if (!usage.allowed) {
      setLimitReached(true);
      console.log('[compare][analyze] LIMIT REACHED count:', usage.count);
      return;
    }
    console.log('[compare][analyze] usage count:', usage.count, 'remaining:', usage.remaining);

    console.log('[compare][analyze] answerImages:', answerB64s.length, 'modelImages:', modelB64s.length, 'promptTips:', promptTips.length);
    setLoading(true);
    setResult(null);
    setEvalScore(null);
    setImprovements([]);
    try {
      const deviceId = await getDeviceId();
      const resp = await fetch(`${SERVER}/grade-compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answerImages: answerB64s, modelAnswerImages: modelB64s, promptTips, deviceId, subject }),
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
      const es = typeof data.evalScore === 'number' ? data.evalScore : null;
      const imps: string[] = Array.isArray(data.improvements) ? data.improvements : [];
      console.log('[compare][analyze] safe score:', safe.score, 'evalScore:', es, 'retryCount:', data.retryCount, 'improvements:', imps.length);
      setResult(safe);
      setEvalScore(es);
      setImprovements(imps);
      await saveResult(safe, imps);

      // 科目を論点名の代わりに使い、スコアで正誤を判定
      if (safe.score >= 70) {
        await updateCautionTopics([], [subject], subject);
      } else if (safe.score < 60) {
        await updateCautionTopics([subject], [], subject);
      }
    } catch (e: any) {
      console.log('[compare][analyze] ERROR:', e.message);
      Alert.alert('エラー', e.message);
    } finally {
      setLoading(false);
    }
  };

  const renderImageStrip = (
    uris: string[],
    b64s: string[],
    urisSetter: React.Dispatch<React.SetStateAction<string[]>>,
    b64sSetter: React.Dispatch<React.SetStateAction<string[]>>,
    withOverlay?: boolean,
  ) => {
    if (uris.length === 0) {
      return (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>画像を選択してください</Text>
        </View>
      );
    }
    const feedbacks = result?.feedbacks ?? [];
    return (
      <View>
        {uris.map((uri, idx) => (
          <View key={uri} style={[styles.imageContainer, { marginBottom: idx < uris.length - 1 ? 6 : 0 }]}>
            <Image source={{ uri }} style={styles.fullImage} resizeMode="contain" />
            <View style={styles.pageIndexBadge}>
              <Text style={styles.pageIndexText}>{idx + 1}/{uris.length}</Text>
            </View>
            <TouchableOpacity
              style={styles.removeImageBtn}
              onPress={() => removeImage(idx, urisSetter, b64sSetter)}
              hitSlop={8}
            >
              <Text style={styles.removeImageText}>✕</Text>
            </TouchableOpacity>
            {uris.length > 1 && (
              <View style={styles.reorderBtns}>
                <TouchableOpacity
                  style={[styles.reorderBtn, idx === 0 && styles.reorderBtnDisabled]}
                  onPress={() => {
                    urisSetter(moveItem(uris, idx, 'up'));
                    b64sSetter(moveItem(b64s, idx, 'up'));
                  }}
                  disabled={idx === 0}
                  hitSlop={4}
                >
                  <Text style={styles.reorderBtnText}>▲</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.reorderBtn, idx === uris.length - 1 && styles.reorderBtnDisabled]}
                  onPress={() => {
                    urisSetter(moveItem(uris, idx, 'down'));
                    b64sSetter(moveItem(b64s, idx, 'down'));
                  }}
                  disabled={idx === uris.length - 1}
                  hitSlop={4}
                >
                  <Text style={styles.reorderBtnText}>▼</Text>
                </TouchableOpacity>
              </View>
            )}
            {withOverlay && idx === 0 && result !== null && feedbacks.length > 0 && showOverlay && (
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
        ))}
      </View>
    );
  };

  const closeFeedbackModal = () => {
    console.log('[compare][modal] close');
    setSelectedFeedback(null);
  };

  const toggleOverlay = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowOverlay(prev => !prev);
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

        {/* ステップインジケーター */}
        {(() => {
          const step = answerB64s.length === 0 ? 0 : modelB64s.length === 0 ? 1 : result === null ? 2 : 3;
          const hints = [
            '① 自分の答案を選んでください',
            '② 模範解答を選んでください',
            '「分析する」で思考ズレを確認',
            saveStatus === 'saved' ? '✅ 保存済み。次の問題にチャレンジ！' : '結果を保存して弱点に反映しましょう',
          ];
          console.log('[compare][ux] step:', step, 'hint:', hints[step]);
          return (
            <>
              <View style={styles.stepBar}>
                {['答案', '模範', '分析'].map((label, i) => (
                  <React.Fragment key={label}>
                    <View style={styles.stepItem}>
                      <View style={[styles.stepDot, i <= step - (step === 3 ? 1 : 0) ? styles.stepDotDone : i === step && step < 3 ? styles.stepDotActive : styles.stepDotPending]}>
                        <Text style={[styles.stepDotText, (i < step || (i === step && step < 3)) ? styles.stepDotTextActive : styles.stepDotTextPending]}>
                          {i + 1}
                        </Text>
                      </View>
                      <Text style={[styles.stepLabel2, i === step && step < 3 ? styles.stepLabelActive : styles.stepLabelMuted]}>{label}</Text>
                    </View>
                    {i < 2 && <View style={[styles.stepLine, i < step ? styles.stepLineDone : styles.stepLinePending]} />}
                  </React.Fragment>
                ))}
              </View>
              <View style={[styles.hintBanner, step === 3 && saveStatus !== 'saved' ? styles.hintBannerHighlight : styles.hintBannerNeutral]}>
                <Text style={[styles.hintText, step === 3 && saveStatus !== 'saved' ? styles.hintTextHighlight : styles.hintTextNeutral]}>
                  {hints[step]}
                </Text>
              </View>
            </>
          );
        })()}

        {/* AIヒント蓄積状態 */}
        {promptTips.length > 0 && (
          <View style={styles.promptTipsRow}>
            <Text style={styles.promptTipsText}>🤖 AI改善ヒント: {promptTips.length}件蓄積中</Text>
            <TouchableOpacity style={styles.promptTipsResetBtn} onPress={resetPromptTips}>
              <Text style={styles.promptTipsResetText}>🗑 リセット</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ① 自分の答案 */}
        <View style={styles.labelRow}>
          <Text style={styles.label}>① 自分の答案</Text>
          {answerUris.length > 0 && (
            <Text style={styles.imageCountBadge}>{answerUris.length}/{MAX_IMAGES}枚</Text>
          )}
        </View>
        <View style={styles.row}>
          {Platform.OS !== 'web' && (
            <TouchableOpacity style={styles.btnSecondary} onPress={() => takePhoto(setAnswerUris, setAnswerB64s, answerUris.length, 'answer')}>
              <Text style={styles.btnSecondaryText}>📷 撮影</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.btnSecondary, answerB64s.length === 0 && styles.btnPrimary]}
            onPress={() => pickImages(setAnswerUris, setAnswerB64s, answerUris.length, 'answer')}
          >
            <Text style={[styles.btnSecondaryText, answerB64s.length === 0 && styles.btnPrimaryText]}>
              {answerB64s.length > 0 ? '🖼️ 追加選択' : '🖼️ 選択'}
            </Text>
          </TouchableOpacity>
        </View>
        {renderImageStrip(answerUris, answerB64s, setAnswerUris, setAnswerB64s, true)}

        {/* ② 模範解答 */}
        <View style={styles.labelRow}>
          <Text style={styles.label}>② 模範解答</Text>
          {modelUris.length > 0 && (
            <Text style={styles.imageCountBadge}>{modelUris.length}/{MAX_IMAGES}枚</Text>
          )}
        </View>
        <View style={styles.row}>
          {Platform.OS !== 'web' && (
            <TouchableOpacity style={styles.btnSecondary} onPress={() => takePhoto(setModelUris, setModelB64s, modelUris.length, 'model')}>
              <Text style={styles.btnSecondaryText}>📷 撮影</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.btnSecondary, answerB64s.length > 0 && modelB64s.length === 0 && styles.btnPrimary]}
            onPress={() => pickImages(setModelUris, setModelB64s, modelUris.length, 'model')}
          >
            <Text style={[styles.btnSecondaryText, answerB64s.length > 0 && modelB64s.length === 0 && styles.btnPrimaryText]}>
              {modelB64s.length > 0 ? '🖼️ 追加選択' : '🖼️ 選択'}
            </Text>
          </TouchableOpacity>
        </View>
        {renderImageStrip(modelUris, modelB64s, setModelUris, setModelB64s)}

        {/* プライマリ CTA: 分析ボタン（両画像揃ったら強調） */}
        {limitReached && !isDev ? (
          <View style={styles.limitBox}>
            <Text style={styles.limitTitle}>🚫 本日の無料利用回数を超えています</Text>
            <Text style={styles.limitSub}>日付が変わるとリセットされます（毎日{DAILY_LIMIT}回無料）</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.analyzeBtn, (answerB64s.length === 0 || modelB64s.length === 0 || loading) && styles.analyzeBtnDim]}
            onPress={() => setSubjectModalVisible(true)}
            disabled={answerB64s.length === 0 || modelB64s.length === 0 || loading}
          >
            {loading ? (
              <View style={styles.analyzeBtnInner}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.analyzeBtnText}>解析中...（最大60秒）</Text>
              </View>
            ) : (
              <Text style={styles.analyzeBtnText}>🔍 思考ズレを分析する</Text>
            )}
          </TouchableOpacity>
        )}
        {!isDev && !limitReached && (
          <Text style={styles.usageText}>
            本日の残り：{Math.max(0, DAILY_LIMIT - usageCount)}/{DAILY_LIMIT} 回
          </Text>
        )}
        {isDev && (
          <Text style={styles.devBadge}>DEV MODE: 制限なし</Text>
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
              const isClose = isCloseEnough(answerText, sim);
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

            {/* 品質評価バッジ */}
            {evalScore !== null && (() => {
              const qual = evalScore >= 80 ? { label: '高品質', color: '#065F46', bg: '#D1FAE5' }
                : evalScore >= 60 ? { label: '普通', color: '#92400E', bg: '#FEF3C7' }
                : { label: '低品質（再生成推奨）', color: '#991B1B', bg: '#FEE2E2' };
              return (
                <View style={[styles.evalBadge, { backgroundColor: qual.bg }]}>
                  <Text style={[styles.evalBadgeText, { color: qual.color }]}>
                    🤖 AI自己採点: {evalScore}点（{qual.label}）
                  </Text>
                </View>
              );
            })()}

            {/* 改善案（低品質時のみ表示） */}
            {evalScore !== null && evalScore < 60 && improvements.length > 0 && (
              <View style={styles.improvementsCard}>
                <Text style={styles.improvementsTitle}>💡 改善ポイント（次回に反映）</Text>
                {improvements.map((imp, i) => (
                  <Text key={i} style={styles.improvementItem}>• {imp}</Text>
                ))}
                <TouchableOpacity style={styles.retryBtn} onPress={analyze}>
                  <Text style={styles.retryBtnText}>🔄 再生成する</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 保存ボタン（プライマリ CTA） */}
            <TouchableOpacity
              style={[styles.saveBtn, saveStatus === 'saved' && styles.saveBtnDone]}
              onPress={() => saveResult()}
              disabled={saveStatus !== 'idle'}
            >
              {saveStatus === 'saving' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>
                  {saveStatus === 'saved' ? '✅ 保存済み' : '💾 弱点分析に保存する'}
                </Text>
              )}
            </TouchableOpacity>
            {saveStatus === 'idle' && (
              <Text style={styles.saveSub}>保存すると「ミスの傾向」に反映されます</Text>
            )}
            {lastSavedDate !== null && saveStatus === 'saved' && (
              <Text style={styles.savedDateText}>最終保存: {lastSavedDate}</Text>
            )}
          </View>
        )}
      </ScrollView>

      {result !== null && (result.feedbacks?.length ?? 0) > 0 && (
        <TouchableOpacity style={styles.fab} onPress={toggleOverlay} activeOpacity={0.8}>
          <Text style={styles.fabText}>
            {showOverlay ? '∧ 閉じる' : '✎ 添削を見る'}
          </Text>
        </TouchableOpacity>
      )}

      {/* 科目選択モーダル */}
      <Modal visible={subjectModalVisible} animationType="slide" transparent onRequestClose={() => setSubjectModalVisible(false)}>
        <View style={styles.subjectModalOverlay}>
          <View style={styles.subjectModalCard}>
            <Text style={styles.subjectModalTitle}>📌 科目を選択してください</Text>
            <View style={styles.subjectGrid}>
              {SUBJECTS.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.subjectBtn, subject === s && styles.subjectBtnActive]}
                  onPress={() => setSubject(s)}
                >
                  <Text style={[styles.subjectBtnText, subject === s && styles.subjectBtnTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.subjectModalActions}>
              <TouchableOpacity style={styles.subjectCancelBtn} onPress={() => setSubjectModalVisible(false)}>
                <Text style={styles.subjectCancelText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.subjectConfirmBtn}
                onPress={() => { setSubjectModalVisible(false); analyze(); }}
              >
                <Text style={styles.subjectConfirmText}>この科目で分析</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F2F2F7' },
  container: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, color: '#1C1C1E' },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 8 },
  label: { fontSize: 15, fontWeight: '600', color: '#3A3A3C' },
  imageCountBadge: { marginLeft: 8, fontSize: 12, fontWeight: '700', color: '#007AFF', backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
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
  pageIndexBadge: {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  pageIndexText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  removeImageBtn: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(255,59,48,0.85)', borderRadius: 12,
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
  },
  removeImageText: { color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 16 },
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

  /* 評価ループ */
  evalBadge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 12, alignItems: 'center' },
  evalBadgeText: { fontSize: 13, fontWeight: '600' },
  improvementsCard: {
    backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: '#FECACA',
  },
  improvementsTitle: { fontSize: 13, fontWeight: '700', color: '#991B1B', marginBottom: 8 },
  improvementItem: { fontSize: 13, color: '#7F1D1D', lineHeight: 20, marginBottom: 4 },
  retryBtn: {
    backgroundColor: '#DC2626', borderRadius: 10, padding: 12,
    alignItems: 'center', marginTop: 10,
  },
  retryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  /* 制限 */
  limitBox: {
    backgroundColor: '#FEF2F2', borderRadius: 12, padding: 16, marginTop: 24,
    borderWidth: 1, borderColor: '#FECACA', alignItems: 'center',
  },
  limitTitle: { fontSize: 15, fontWeight: '700', color: '#991B1B', marginBottom: 4 },
  limitSub: { fontSize: 12, color: '#B91C1C', textAlign: 'center' },
  usageText: { textAlign: 'center', fontSize: 12, color: '#6B7280', marginTop: 8 },
  devBadge: { textAlign: 'center', fontSize: 11, color: '#059669', marginTop: 6, fontWeight: '600' },

  /* ステップインジケーター */
  stepBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  stepItem: { alignItems: 'center', gap: 4 },
  stepDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepDotDone: { backgroundColor: '#34C759' },
  stepDotActive: { backgroundColor: '#007AFF' },
  stepDotPending: { backgroundColor: '#E5E5EA' },
  stepDotText: { fontSize: 13, fontWeight: '700' },
  stepDotTextActive: { color: '#fff' },
  stepDotTextPending: { color: '#8E8E93' },
  stepLine: { flex: 1, height: 2, marginHorizontal: 4, marginBottom: 14 },
  stepLineDone: { backgroundColor: '#34C759' },
  stepLinePending: { backgroundColor: '#E5E5EA' },
  stepLabel2: { fontSize: 10, fontWeight: '600' },
  stepLabelActive: { color: '#007AFF' },
  stepLabelMuted: { color: '#8E8E93' },

  /* 次の行動バナー */
  hintBanner: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16, alignItems: 'center' },
  hintBannerHighlight: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  hintBannerNeutral: { backgroundColor: '#F2F2F7' },
  hintText: { fontSize: 14, fontWeight: '600' },
  hintTextHighlight: { color: '#1D4ED8' },
  hintTextNeutral: { color: '#6B7280' },

  /* セカンダリ / プライマリ 画像ボタン */
  btnSecondary: {
    flex: 1, borderRadius: 10, padding: 11, alignItems: 'center',
    borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#fff',
  },
  btnSecondaryText: { fontSize: 13, color: '#6B7280' },
  btnPrimary: { borderColor: '#007AFF', backgroundColor: '#EFF6FF' },
  btnPrimaryText: { color: '#007AFF', fontWeight: '600' },

  /* 分析ボタン */
  analyzeBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  analyzeBtnDim: { opacity: 0.45 },

  /* 保存ボタン */
  saveBtn: {
    backgroundColor: '#007AFF', borderRadius: 12, padding: 14,
    alignItems: 'center', marginTop: 20,
  },
  saveBtnDone: { backgroundColor: '#34C759' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  saveSub: { textAlign: 'center', fontSize: 12, color: '#6B7280', marginTop: 6 },
  savedDateText: { textAlign: 'center', fontSize: 12, color: '#8E8E93', marginTop: 6 },

  /* AIヒント蓄積状態行 */
  promptTipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  promptTipsText: { fontSize: 13, color: '#166534', fontWeight: '600', flex: 1 },
  promptTipsResetBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 8,
  },
  promptTipsResetText: { fontSize: 12, color: '#fff', fontWeight: '700' },

  /* 赤ペンオーバーレイ FAB */
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: '#007AFF',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  fabText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  /* 並び替えボタン */
  reorderBtns: { position: 'absolute', top: 8, left: 8, flexDirection: 'column', gap: 4 },
  reorderBtn: { backgroundColor: 'rgba(0,122,255,0.85)', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  reorderBtnDisabled: { backgroundColor: 'rgba(0,0,0,0.25)' },
  reorderBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' as const, lineHeight: 14 },

  /* 科目選択モーダル */
  subjectModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', padding: 16 },
  subjectModalCard: { backgroundColor: '#fff', borderRadius: 20, padding: 24 },
  subjectModalTitle: { fontSize: 17, fontWeight: 'bold', color: '#1C1C1E', marginBottom: 16, textAlign: 'center' },
  subjectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  subjectBtn: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, borderColor: '#D1D5DB', backgroundColor: '#F9FAFB' },
  subjectBtnActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  subjectBtnText: { color: '#6B7280', fontSize: 13, fontWeight: '600' },
  subjectBtnTextActive: { color: '#fff' },
  subjectModalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  subjectCancelBtn: { flex: 1, backgroundColor: '#F2F2F7', borderRadius: 12, padding: 14, alignItems: 'center' },
  subjectCancelText: { color: '#6B7280', fontSize: 15, fontWeight: '600' },
  subjectConfirmBtn: { flex: 2, backgroundColor: '#007AFF', borderRadius: 12, padding: 14, alignItems: 'center' },
  subjectConfirmText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});
