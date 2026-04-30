import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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

export default function CompareScreen() {
  const [answerUri, setAnswerUri] = useState<string | null>(null);
  const [answerB64, setAnswerB64] = useState<string | null>(null);
  const [modelUri, setModelUri] = useState<string | null>(null);
  const [modelB64, setModelB64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const pickImage = async (
    setter: (uri: string) => void,
    b64Setter: (b64: string) => void,
  ) => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      base64: true,
      quality: 0.7,
    });
    if (!res.canceled && res.assets[0]) {
      setter(res.assets[0].uri);
      b64Setter(res.assets[0].base64 || '');
    }
  };

  const takePhoto = async (
    setter: (uri: string) => void,
    b64Setter: (b64: string) => void,
  ) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('カメラ権限が必要です');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
    if (!res.canceled && res.assets[0]) {
      setter(res.assets[0].uri);
      b64Setter(res.assets[0].base64 || '');
    }
  };

  const analyze = async () => {
    if (!answerB64 || !modelB64) {
      Alert.alert('答案と模範解答の両方が必要です');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const resp = await fetch(`${SERVER}/grade-compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answerImage: answerB64, modelAnswerImage: modelB64 }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e: any) {
      Alert.alert('エラー', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>📝 比較添削</Text>

        <Text style={styles.label}>① 自分の答案</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.btn} onPress={() => takePhoto(setAnswerUri, setAnswerB64)}>
            <Text style={styles.btnText}>📷 撮影</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={() => pickImage(setAnswerUri, setAnswerB64)}>
            <Text style={styles.btnText}>🖼️ 選択</Text>
          </TouchableOpacity>
        </View>
        {answerUri && <Image source={{ uri: answerUri }} style={styles.preview} />}

        <Text style={styles.label}>② 模範解答</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.btn} onPress={() => takePhoto(setModelUri, setModelB64)}>
            <Text style={styles.btnText}>📷 撮影</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={() => pickImage(setModelUri, setModelB64)}>
            <Text style={styles.btnText}>🖼️ 選択</Text>
          </TouchableOpacity>
        </View>
        {modelUri && <Image source={{ uri: modelUri }} style={styles.preview} />}

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

        {result && (
          <View style={styles.resultBox}>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreNum}>{result.score}点</Text>
              <View style={[styles.badge, result.passed ? styles.pass : styles.fail]}>
                <Text style={styles.badgeText}>
                  {result.passed ? '合格ライン達成' : '合格ライン未達'}
                </Text>
              </View>
            </View>
            {result.fatalErrors > 0 && (
              <Text style={styles.fatal}>致命的ミス：{result.fatalErrors}件</Text>
            )}
            {result.missingProcess && (
              <Text style={styles.warn}>⚠️ 途中式がないため精度が低下しています</Text>
            )}

            <Text style={styles.sectionTitle}>📌 指摘事項</Text>
            {result.feedbacks?.map((fb: any, i: number) => (
              <View key={i} style={[styles.feedbackCard, { borderLeftColor: COLOR_MAP[fb.color] || '#ccc' }]}>
                <Text style={styles.feedbackType}>{TYPE_ICON[fb.type] || '•'} {fb.type}</Text>
                <Text style={styles.feedbackPoint}>{fb.point}</Text>
              </View>
            ))}

            {result.textbookRef ? (
              <View style={styles.textbookBox}>
                <Text style={styles.sectionTitle}>📚 教科書参照</Text>
                <Text style={styles.textbookRef}>{result.textbookRef}</Text>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>🧠 思考ステップ比較</Text>
            {(['issueRecognition', 'premise', 'logic', 'conclusion'] as const).map((key) => {
              const labels: Record<string, string> = {
                issueRecognition: '論点認識',
                premise: '前提整理',
                logic: '計算/ロジック',
                conclusion: '結論',
              };
              const match = result.answerSteps?.[key] === result.modelSteps?.[key];
              return (
                <View key={key} style={styles.stepRow}>
                  <Text style={styles.stepLabel}>{labels[key]}</Text>
                  <Text style={styles.stepAnswer} numberOfLines={2}>
                    {result.answerSteps?.[key] || '-'}
                  </Text>
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
  btn: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12,
    alignItems: 'center', borderWidth: 1, borderColor: '#E5E5EA',
  },
  btnText: { fontSize: 14, color: '#007AFF' },
  preview: {
    width: '100%', height: 180, borderRadius: 10, marginTop: 8,
    resizeMode: 'contain', backgroundColor: '#E5E5EA',
  },
  analyzeBtn: {
    backgroundColor: '#007AFF', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 24,
  },
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
  feedbackCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    marginBottom: 10, borderLeftWidth: 4,
  },
  feedbackType: { fontSize: 12, fontWeight: '600', color: '#8E8E93', marginBottom: 4 },
  feedbackPoint: { fontSize: 14, color: '#1C1C1E', lineHeight: 20 },
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
