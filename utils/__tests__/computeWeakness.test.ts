import { computeWeakness } from '../computeWeakness';

type Feedback = { priority: number; type: string; point: string; color: string };
type GradeResult = {
  score: number;
  passed: boolean;
  fatalErrors: number;
  missingProcess: boolean;
  feedbacks: Feedback[];
  answerSteps: { issueRecognition: string; premise: string; logic: string; conclusion: string };
  modelSteps: { issueRecognition: string; premise: string; logic: string; conclusion: string };
};
type CompareItem = { id: string; date: string; result: GradeResult; answerUri?: string };
type RegularItem = {
  id: string; subject: string; question: string; answer: string;
  result: string; score: number | null; date: string;
  topics?: string[]; wrongTopics?: string[];
};

const EMPTY_STEPS = { issueRecognition: '', premise: '', logic: '', conclusion: '' };
function makeCompare(feedbackTypes: string[]): CompareItem {
  return {
    id: '1',
    date: '2026/1/1',
    result: {
      score: 70, passed: true, fatalErrors: 0, missingProcess: false,
      feedbacks: feedbackTypes.map(type => ({ priority: 1, type, point: '', color: 'red' })),
      answerSteps: EMPTY_STEPS, modelSteps: EMPTY_STEPS,
    },
  };
}
function makeRegular(wrongTopics: string[]): RegularItem {
  return {
    id: '2', subject: '財務会計論', question: 'Q', answer: 'A',
    result: '合格', score: 80, date: '2026/1/2', wrongTopics,
  };
}

describe('computeWeakness — 統合弱点集計', () => {
  test('compare_historyのみのとき feedbacks.type を集計して TOP3 を返す', () => {
    const items = [
      makeCompare(['論点誤認', '論点誤認', '計算ミス']),
    ];
    const result = computeWeakness(items, []);
    expect(result).toEqual([
      { type: '論点誤認', count: 2 },
      { type: '計算ミス', count: 1 },
    ]);
  });

  test('通常historyのみのとき wrongTopics を集計して TOP3 を返す', () => {
    const items = [
      makeRegular(['現金主義', '現金主義', '企業会計原則']),
    ];
    const result = computeWeakness([], items);
    expect(result).toEqual([
      { type: '現金主義', count: 2 },
      { type: '企業会計原則', count: 1 },
    ]);
  });

  test('両方を統合して count の高い順に TOP3 を返す', () => {
    const compareItems = [
      makeCompare(['論点誤認', '論点誤認', '論点誤認', '計算ミス']),
    ];
    const regularItems = [
      makeRegular(['計算ミス', '計算ミス', '現金主義']),
    ];
    const result = computeWeakness(compareItems, regularItems);
    expect(result[0]).toEqual({ type: '論点誤認', count: 3 });
    expect(result[1]).toEqual({ type: '計算ミス', count: 3 });
    expect(result[2]).toEqual({ type: '現金主義', count: 1 });
    expect(result.length).toBe(3);
  });

  test('両方が空のとき空配列を返す', () => {
    expect(computeWeakness([], [])).toEqual([]);
  });

  test('limit 引数で上限数を変更できる', () => {
    const compareItems = [
      makeCompare(['論点誤認', '計算ミス', '前提不足', '思考プロセスミス']),
    ];
    const result = computeWeakness(compareItems, [], 2);
    expect(result.length).toBe(2);
  });

  test('wrongTopics が undefined の item はスキップされる', () => {
    const items: RegularItem[] = [
      { id: '1', subject: '監査論', question: 'Q', answer: 'A', result: '合格', score: 60, date: '2026/1/1' },
    ];
    const result = computeWeakness([], items);
    expect(result).toEqual([]);
  });

  test('feedbacks が undefined の compare item はスキップされる', () => {
    const item = { id: '1', date: '2026/1/1', result: { score: 70, passed: true, fatalErrors: 0, missingProcess: false, feedbacks: undefined as any, answerSteps: EMPTY_STEPS, modelSteps: EMPTY_STEPS } };
    const result = computeWeakness([item], []);
    expect(result).toEqual([]);
  });
});
