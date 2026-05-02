import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

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

export type CompareHistoryItem = {
  id: string;
  date: string;
  result: GradeResult;
  answerUri?: string;
};

const STORAGE_KEY = 'compare_history';

const TYPE_COLOR: Record<string, string> = {
  '論点誤認': '#FF3B30',
  '思考プロセスミス': '#FF9500',
  '計算ミス': '#FF6B00',
  '前提不足': '#007AFF',
};

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626';
  const bg = score >= 70 ? '#dcfce7' : score >= 50 ? '#fef3c7' : '#fee2e2';
  return (
    <View style={[styles.scoreBadge, { backgroundColor: bg, borderColor: color }]}>
      <Text style={[styles.scoreBadgeText, { color }]}>{score}%</Text>
    </View>
  );
}

function PassBadge({ passed }: { passed: boolean }) {
  return (
    <View style={[styles.passBadge, { backgroundColor: passed ? '#dcfce7' : '#fee2e2', borderColor: passed ? '#16a34a' : '#dc2626' }]}>
      <Text style={[styles.passBadgeText, { color: passed ? '#16a34a' : '#dc2626' }]}>
        {passed ? '合格' : '不合格'}
      </Text>
    </View>
  );
}

export default function CompareHistoryScreen() {
  const [history, setHistory] = useState<CompareHistoryItem[]>([]);
  const [selected, setSelected] = useState<CompareHistoryItem | null>(null);

  const loadHistory = async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) setHistory(JSON.parse(raw));
  };

  useFocusEffect(useCallback(() => { loadHistory(); }, []));

  const deleteItem = async (id: string) => {
    const updated = history.filter((h) => h.id !== id);
    setHistory(updated);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setSelected(null);
  };

  const sorted = [...history].reverse();

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>📊 比較添削 履歴</Text>

        {sorted.length === 0 && (
          <Text style={styles.empty}>まだ履歴がありません{'\n'}比較添削タブで採点を保存してください</Text>
        )}

        {sorted.map((item) => (
          <TouchableOpacity key={item.id} style={styles.card} onPress={() => setSelected(item)}>
            <View style={styles.cardHeader}>
              <Text style={styles.subject}>比較添削</Text>
              <View style={styles.cardHeaderRight}>
                <ScoreBadge score={item.result.score} />
                <PassBadge passed={item.result.passed} />
              </View>
            </View>
            <Text style={styles.date}>{item.date}</Text>
            {item.result.fatalErrors > 0 && (
              <Text style={styles.fatalError}>重大ミス {item.result.fatalErrors}件</Text>
            )}
            {item.result.feedbacks.length > 0 && (
              <Text style={styles.feedbackPreview} numberOfLines={1}>
                {item.result.feedbacks[0].point}
              </Text>
            )}
            <Text style={styles.tapHint}>タップして詳細を見る →</Text>
          </TouchableOpacity>
        ))}

        <Modal visible={selected !== null} animationType="slide" onRequestClose={() => setSelected(null)}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalSubject}>比較添削</Text>
                <Text style={styles.modalDate}>{selected?.date}</Text>
              </View>
              {selected && (
                <View style={styles.modalBadges}>
                  <View style={styles.modalScoreBadge}>
                    <Text style={styles.modalScoreText}>{selected.result.score}%</Text>
                  </View>
                  <View style={[styles.modalPassBadge, { backgroundColor: selected.result.passed ? '#16a34a' : '#dc2626' }]}>
                    <Text style={styles.modalPassText}>{selected.result.passed ? '合格' : '不合格'}</Text>
                  </View>
                </View>
              )}
            </View>

            <ScrollView style={styles.modalScroll}>
              {selected && (
                <>
                  {selected.result.fatalErrors > 0 && (
                    <View style={styles.alertBox}>
                      <Text style={styles.alertText}>⚠️ 重大ミス {selected.result.fatalErrors}件</Text>
                    </View>
                  )}
                  {selected.result.missingProcess && (
                    <View style={styles.alertBox}>
                      <Text style={styles.alertText}>⚠️ 思考プロセス不足</Text>
                    </View>
                  )}

                  {selected.result.feedbacks.length > 0 && (
                    <>
                      <Text style={styles.sectionLabel}>📌 指摘事項</Text>
                      {selected.result.feedbacks.map((fb, i) => (
                        <View key={i} style={[styles.feedbackCard, { borderLeftColor: TYPE_COLOR[fb.type] ?? '#999' }]}>
                          <Text style={[styles.feedbackType, { color: TYPE_COLOR[fb.type] ?? '#999' }]}>{fb.type}</Text>
                          <Text style={styles.feedbackPoint}>{fb.point}</Text>
                        </View>
                      ))}
                    </>
                  )}

                  <Text style={styles.sectionLabel}>🧠 あなたの思考ステップ</Text>
                  <View style={styles.stepsCard}>
                    <Text style={styles.stepLabel}>問題認識</Text>
                    <Text style={styles.stepText}>{selected.result.answerSteps.issueRecognition}</Text>
                    <Text style={styles.stepLabel}>前提</Text>
                    <Text style={styles.stepText}>{selected.result.answerSteps.premise}</Text>
                    <Text style={styles.stepLabel}>論理</Text>
                    <Text style={styles.stepText}>{selected.result.answerSteps.logic}</Text>
                    <Text style={styles.stepLabel}>結論</Text>
                    <Text style={styles.stepText}>{selected.result.answerSteps.conclusion}</Text>
                  </View>

                  <Text style={styles.sectionLabel}>📖 模範解答の思考ステップ</Text>
                  <View style={styles.stepsCard}>
                    <Text style={styles.stepLabel}>問題認識</Text>
                    <Text style={styles.stepText}>{selected.result.modelSteps.issueRecognition}</Text>
                    <Text style={styles.stepLabel}>前提</Text>
                    <Text style={styles.stepText}>{selected.result.modelSteps.premise}</Text>
                    <Text style={styles.stepLabel}>論理</Text>
                    <Text style={styles.stepText}>{selected.result.modelSteps.logic}</Text>
                    <Text style={styles.stepLabel}>結論</Text>
                    <Text style={styles.stepText}>{selected.result.modelSteps.conclusion}</Text>
                  </View>

                  {selected.result.textbookRef && (
                    <>
                      <Text style={styles.sectionLabel}>📚 教科書参照</Text>
                      <Text style={styles.textbookRef}>{selected.result.textbookRef}</Text>
                    </>
                  )}
                </>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.closeButton} onPress={() => setSelected(null)}>
                <Text style={styles.closeButtonText}>閉じる</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => selected && deleteItem(selected.id)}
              >
                <Text style={styles.deleteButtonText}>削除</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: '#f5f5f5' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  empty: { textAlign: 'center', color: '#999', fontSize: 15, marginTop: 40, lineHeight: 26 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subject: { fontWeight: 'bold', color: '#7c3aed', fontSize: 14 },
  date: { color: '#999', fontSize: 12, marginBottom: 4 },
  fatalError: { fontSize: 12, color: '#dc2626', fontWeight: '600', marginBottom: 2 },
  feedbackPreview: { fontSize: 13, color: '#555', marginBottom: 4 },
  tapHint: { fontSize: 12, color: '#7c3aed', textAlign: 'right', marginTop: 4 },
  scoreBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  scoreBadgeText: { fontSize: 12, fontWeight: 'bold' },
  passBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  passBadgeText: { fontSize: 11, fontWeight: '600' },
  modalContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  modalHeader: {
    backgroundColor: '#7c3aed',
    padding: 24,
    paddingTop: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  modalSubject: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  modalDate: { color: '#ddd6fe', fontSize: 13 },
  modalBadges: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  modalScoreBadge: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 4, paddingHorizontal: 12 },
  modalScoreText: { color: '#7c3aed', fontSize: 20, fontWeight: 'bold' },
  modalPassBadge: { borderRadius: 12, paddingVertical: 4, paddingHorizontal: 10 },
  modalPassText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  modalScroll: { flex: 1, padding: 20 },
  alertBox: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  alertText: { color: '#dc2626', fontWeight: '600', fontSize: 14 },
  sectionLabel: { fontSize: 15, fontWeight: 'bold', color: '#7c3aed', marginTop: 16, marginBottom: 8 },
  feedbackCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  feedbackType: { fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
  feedbackPoint: { fontSize: 13, color: '#333', lineHeight: 20 },
  stepsCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  stepLabel: { fontSize: 12, fontWeight: 'bold', color: '#7c3aed', marginTop: 8, marginBottom: 2 },
  stepText: { fontSize: 13, color: '#333', lineHeight: 20 },
  textbookRef: {
    fontSize: 13,
    color: '#333',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    lineHeight: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  closeButton: { flex: 1, backgroundColor: '#7c3aed', padding: 14, borderRadius: 10, alignItems: 'center' },
  closeButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  deleteButton: { flex: 1, backgroundColor: '#fee2e2', padding: 14, borderRadius: 10, alignItems: 'center' },
  deleteButtonText: { color: '#dc2626', fontWeight: 'bold', fontSize: 16 },
});
