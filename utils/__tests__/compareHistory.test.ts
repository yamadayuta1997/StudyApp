// answerUri の保存・復元ロジックを検証する

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

const DUMMY_RESULT: GradeResult = {
  score: 80,
  passed: true,
  fatalErrors: 0,
  missingProcess: false,
  feedbacks: [],
  answerSteps: { issueRecognition: 'A', premise: 'B', logic: 'C', conclusion: 'D' },
  modelSteps: { issueRecognition: 'A', premise: 'B', logic: 'C', conclusion: 'D' },
};

describe('CompareHistoryItem — answerUri の保存と復元', () => {
  test('answerUri を含む item が JSON に正しくシリアライズされる', () => {
    const item: CompareHistoryItem = {
      id: '1234',
      date: '2026/1/1 0:00:00',
      result: DUMMY_RESULT,
      answerUri: 'file:///tmp/answer.jpg',
    };
    const json = JSON.stringify(item);
    const parsed: CompareHistoryItem = JSON.parse(json);
    expect(parsed.answerUri).toBe('file:///tmp/answer.jpg');
  });

  test('answerUri なしの item は undefined として復元される', () => {
    const item: CompareHistoryItem = {
      id: '5678',
      date: '2026/1/2 0:00:00',
      result: DUMMY_RESULT,
    };
    const json = JSON.stringify(item);
    const parsed: CompareHistoryItem = JSON.parse(json);
    expect(parsed.answerUri).toBeUndefined();
  });

  test('複数 item のリストから最新 item の answerUri を復元できる', () => {
    const items: CompareHistoryItem[] = [
      { id: '1', date: '2026/1/1', result: DUMMY_RESULT, answerUri: 'file:///tmp/old.jpg' },
      { id: '2', date: '2026/1/2', result: DUMMY_RESULT, answerUri: 'file:///tmp/latest.jpg' },
    ];
    const json = JSON.stringify(items);
    const parsed: CompareHistoryItem[] = JSON.parse(json);
    const latest = parsed[parsed.length - 1];
    expect(latest.answerUri).toBe('file:///tmp/latest.jpg');
  });

  test('result の score は正しく保持される', () => {
    const item: CompareHistoryItem = {
      id: '9',
      date: '2026/1/3',
      result: { ...DUMMY_RESULT, score: 65 },
      answerUri: 'file:///tmp/test.jpg',
    };
    const parsed: CompareHistoryItem = JSON.parse(JSON.stringify(item));
    expect(parsed.result.score).toBe(65);
    expect(parsed.answerUri).toBe('file:///tmp/test.jpg');
  });
});
