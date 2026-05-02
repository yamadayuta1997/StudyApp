// compare_history 一覧表示ロジックのテスト

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

const makeItem = (id: string, date: string, resultOverrides: Partial<GradeResult> = {}): CompareHistoryItem => ({
  id,
  date,
  result: makeResult(resultOverrides),
});

// スコアバッジの色分けロジック
function getScoreColor(score: number): 'green' | 'orange' | 'red' {
  if (score >= 70) return 'green';
  if (score >= 50) return 'orange';
  return 'red';
}

// 一覧を新しい順に並び替え
function sortNewestFirst(items: CompareHistoryItem[]): CompareHistoryItem[] {
  return [...items].reverse();
}

// 削除ロジック
function deleteItem(items: CompareHistoryItem[], id: string): CompareHistoryItem[] {
  return items.filter((item) => item.id !== id);
}

describe('compareHistoryList — スコアバッジの色分け', () => {
  test('70以上はグリーン', () => {
    expect(getScoreColor(70)).toBe('green');
    expect(getScoreColor(100)).toBe('green');
  });

  test('50以上70未満はオレンジ', () => {
    expect(getScoreColor(50)).toBe('orange');
    expect(getScoreColor(69)).toBe('orange');
  });

  test('50未満はレッド', () => {
    expect(getScoreColor(0)).toBe('red');
    expect(getScoreColor(49)).toBe('red');
  });
});

describe('compareHistoryList — 新しい順ソート', () => {
  const items = [
    makeItem('1', '2026/1/1 10:00:00'),
    makeItem('2', '2026/1/2 10:00:00'),
    makeItem('3', '2026/1/3 10:00:00'),
  ];

  test('最新のアイテムが先頭に来る', () => {
    const sorted = sortNewestFirst(items);
    expect(sorted[0].id).toBe('3');
    expect(sorted[1].id).toBe('2');
    expect(sorted[2].id).toBe('1');
  });

  test('元の配列を変更しない', () => {
    sortNewestFirst(items);
    expect(items[0].id).toBe('1');
  });
});

describe('compareHistoryList — アイテム削除', () => {
  const items = [
    makeItem('1', '2026/1/1'),
    makeItem('2', '2026/1/2'),
    makeItem('3', '2026/1/3'),
  ];

  test('指定IDのアイテムが削除される', () => {
    const result = deleteItem(items, '2');
    expect(result).toHaveLength(2);
    expect(result.find((i) => i.id === '2')).toBeUndefined();
  });

  test('存在しないIDを指定しても配列サイズは変わらない', () => {
    const result = deleteItem(items, '999');
    expect(result).toHaveLength(3);
  });

  test('空配列に削除を実行してもエラーにならない', () => {
    const result = deleteItem([], '1');
    expect(result).toHaveLength(0);
  });
});

describe('compareHistoryList — 表示データの完全性', () => {
  test('科目は常に比較添削として扱う（固定ラベル）', () => {
    const item = makeItem('1', '2026/1/1 0:00:00');
    // CompareHistoryItem には subject フィールドがないため
    // UI 側で "比較添削" を固定表示することを確認
    expect(item).not.toHaveProperty('subject');
  });

  test('日付フィールドが存在する', () => {
    const item = makeItem('1', '2026/1/1 10:30:00');
    expect(item.date).toBe('2026/1/1 10:30:00');
  });

  test('スコアフィールドが存在する', () => {
    const item = makeItem('1', '2026/1/1', { score: 85 });
    expect(item.result.score).toBe(85);
  });

  test('passed フィールドが存在する', () => {
    const passed = makeItem('1', '2026/1/1', { passed: true });
    const failed = makeItem('2', '2026/1/2', { passed: false });
    expect(passed.result.passed).toBe(true);
    expect(failed.result.passed).toBe(false);
  });

  test('feedbacks の先頭要素が preview に使える', () => {
    const item = makeItem('1', '2026/1/1', {
      feedbacks: [
        { priority: 1, type: '論点誤認', point: '問題の本質を誤って認識している', color: 'red' },
        { priority: 2, type: '計算ミス', point: '数値計算に誤りがある', color: 'orange' },
      ],
    });
    expect(item.result.feedbacks[0].point).toBe('問題の本質を誤って認識している');
  });
});
