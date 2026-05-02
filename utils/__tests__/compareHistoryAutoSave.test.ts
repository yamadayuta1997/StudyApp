// compare.tsx 自動保存ロジックのテスト

type GradeResult = {
  score: number;
  passed: boolean;
  fatalErrors: number;
  missingProcess: boolean;
  feedbacks: { priority: number; type: string; point: string; color: string }[];
  answerSteps: { issueRecognition: string; premise: string; logic: string; conclusion: string };
  modelSteps: { issueRecognition: string; premise: string; logic: string; conclusion: string };
  textbookRef?: string;
};

type CompareHistoryItem = {
  id: string;
  date: string;
  result: GradeResult;
  answerUri?: string;
};

const MAX_HISTORY = 20;

const makeResult = (overrides: Partial<GradeResult> = {}): GradeResult => ({
  score: 75,
  passed: true,
  fatalErrors: 0,
  missingProcess: false,
  feedbacks: [],
  answerSteps: { issueRecognition: 'A', premise: 'B', logic: 'C', conclusion: 'D' },
  modelSteps: { issueRecognition: 'A', premise: 'B', logic: 'C', conclusion: 'D' },
  ...overrides,
});

// analyze() 完了後に呼ばれる保存ロジック（compare.tsx の saveResult から抽出）
function appendToHistory(
  items: CompareHistoryItem[],
  gradeResult: GradeResult,
  answerUri: string | null,
  id: string,
  date: string,
): CompareHistoryItem[] {
  const newItem: CompareHistoryItem = {
    id,
    date,
    result: gradeResult,
    answerUri: answerUri ?? undefined,
  };
  return [...items, newItem].slice(-MAX_HISTORY);
}

describe('compareHistoryAutoSave — 自動保存ロジック', () => {
  test('採点完了後に新しいアイテムがリストの末尾に追加される', () => {
    const existing: CompareHistoryItem[] = [
      { id: '1', date: '2026/1/1', result: makeResult({ score: 60 }) },
    ];
    const newResult = makeResult({ score: 80 });
    const updated = appendToHistory(existing, newResult, null, '2', '2026/1/2');
    expect(updated).toHaveLength(2);
    expect(updated[updated.length - 1].result.score).toBe(80);
    expect(updated[0].result.score).toBe(60);
  });

  test('MAX_HISTORY(20件)を超えた場合、古いアイテムが削除される', () => {
    const existing: CompareHistoryItem[] = Array.from({ length: MAX_HISTORY }, (_, i) => ({
      id: String(i),
      date: `2026/1/${i + 1}`,
      result: makeResult({ score: i }),
    }));
    const newResult = makeResult({ score: 99 });
    const updated = appendToHistory(existing, newResult, null, 'new', '2026/2/1');
    expect(updated).toHaveLength(MAX_HISTORY);
    expect(updated[updated.length - 1].result.score).toBe(99);
    expect(updated[0].id).toBe('1');
  });

  test('answerUri が null の場合は undefined として保存される', () => {
    const updated = appendToHistory([], makeResult(), null, 'x', '2026/1/1');
    expect(updated[0].answerUri).toBeUndefined();
  });

  test('answerUri が指定された場合は正しく保存される', () => {
    const updated = appendToHistory([], makeResult(), 'file:///tmp/answer.jpg', 'x', '2026/1/1');
    expect(updated[0].answerUri).toBe('file:///tmp/answer.jpg');
  });

  test('スコアが 0 のとき（採点失敗ケース）も保存される', () => {
    const updated = appendToHistory([], makeResult({ score: 0, passed: false }), null, 'x', '2026/1/1');
    expect(updated[0].result.score).toBe(0);
    expect(updated[0].result.passed).toBe(false);
  });

  test('空の履歴に保存すると 1 件になる', () => {
    const updated = appendToHistory([], makeResult(), null, 'x', '2026/1/1');
    expect(updated).toHaveLength(1);
  });

  test('再採点時は追加で新規アイテムが作成される（履歴が増える）', () => {
    const first = appendToHistory([], makeResult({ score: 60 }), null, '1', '2026/1/1 10:00:00');
    const second = appendToHistory(first, makeResult({ score: 80 }), null, '2', '2026/1/1 10:05:00');
    expect(second).toHaveLength(2);
    expect(second[0].result.score).toBe(60);
    expect(second[1].result.score).toBe(80);
  });
});
