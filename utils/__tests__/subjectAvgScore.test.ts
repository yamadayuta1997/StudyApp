import { calcSubjectAvgScore } from '../subjectAvgScore';

describe('calcSubjectAvgScore', () => {
  test('履歴が空のとき none を返す', () => {
    expect(calcSubjectAvgScore([], '財務会計論')).toEqual({ type: 'none' });
  });

  test('対象科目のスコアが存在しないとき none を返す', () => {
    const history = [{ subject: '管理会計論', score: 80 }];
    expect(calcSubjectAvgScore(history, '財務会計論')).toEqual({ type: 'none' });
  });

  test('score が null のみのとき none を返す', () => {
    const history = [{ subject: '財務会計論', score: null }];
    expect(calcSubjectAvgScore(history, '財務会計論')).toEqual({ type: 'none' });
  });

  test('1件のスコアをそのまま返す', () => {
    const history = [{ subject: '財務会計論', score: 70 }];
    expect(calcSubjectAvgScore(history, '財務会計論')).toEqual({ type: 'avg', value: 70 });
  });

  test('複数件の平均を四捨五入して返す', () => {
    const history = [
      { subject: '財務会計論', score: 70 },
      { subject: '財務会計論', score: 80 },
      { subject: '財務会計論', score: 75 },
    ];
    expect(calcSubjectAvgScore(history, '財務会計論')).toEqual({ type: 'avg', value: 75 });
  });

  test('小数点以下が四捨五入される', () => {
    const history = [
      { subject: '監査論', score: 70 },
      { subject: '監査論', score: 71 },
    ];
    expect(calcSubjectAvgScore(history, '監査論')).toEqual({ type: 'avg', value: 71 });
  });

  test('他科目のスコアは無視される', () => {
    const history = [
      { subject: '財務会計論', score: 80 },
      { subject: '管理会計論', score: 20 },
    ];
    expect(calcSubjectAvgScore(history, '財務会計論')).toEqual({ type: 'avg', value: 80 });
  });

  test('null スコアは平均計算から除外される', () => {
    const history = [
      { subject: '企業法', score: 60 },
      { subject: '企業法', score: null },
      { subject: '企業法', score: 80 },
    ];
    expect(calcSubjectAvgScore(history, '企業法')).toEqual({ type: 'avg', value: 70 });
  });
});
