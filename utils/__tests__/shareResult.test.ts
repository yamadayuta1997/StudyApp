import { buildAnswerShareText, buildCompareShareText } from '../shareResult';

describe('buildAnswerShareText', () => {
  test('科目・サマリー・結果がすべて含まれる', () => {
    const text = buildAnswerShareText({
      subject: '財務会計論',
      summary: '売上原価の算定が重要です',
      result: '## 採点結果\n**得点**: 80点',
    });
    expect(text).toContain('財務会計論');
    expect(text).toContain('売上原価の算定が重要です');
    expect(text).toContain('得点');
    expect(text).toContain('80点');
  });

  test('markdownの#と**がプレーンテキストに変換される', () => {
    const text = buildAnswerShareText({
      subject: '監査論',
      summary: '',
      result: '## 見出し\n**太字**テキスト',
    });
    expect(text).not.toContain('##');
    expect(text).not.toContain('**');
  });

  test('summaryが空のときサマリーブロックが省略される', () => {
    const text = buildAnswerShareText({ subject: '企業法', summary: '', result: '合格' });
    expect(text).not.toContain('解説まとめ');
    expect(text).toContain('企業法');
    expect(text).toContain('合格');
  });

  test('ハッシュタグが末尾に含まれる', () => {
    const text = buildAnswerShareText({ subject: '租税法', summary: '', result: '' });
    expect(text).toContain('#CPA試験');
  });
});

describe('buildCompareShareText', () => {
  test('科目・スコア・合否が含まれる', () => {
    const text = buildCompareShareText({
      subject: '管理会計論',
      score: 75,
      passed: true,
      feedbacks: [],
    });
    expect(text).toContain('管理会計論');
    expect(text).toContain('75点');
    expect(text).toContain('合格ライン達成');
  });

  test('不合格時は合格ライン未達が含まれる', () => {
    const text = buildCompareShareText({
      subject: '経営学',
      score: 50,
      passed: false,
      feedbacks: [],
    });
    expect(text).toContain('合格ライン未達');
  });

  test('feedbacksの先頭3件が含まれ、4件目以降は含まれない', () => {
    const feedbacks = [
      { priority: 1, type: '論点誤認', point: 'ポイントA', color: 'red' },
      { priority: 2, type: '計算ミス', point: 'ポイントB', color: 'yellow' },
      { priority: 3, type: '前提不足', point: 'ポイントC', color: 'green' },
      { priority: 4, type: '思考プロセスミス', point: 'ポイントD', color: 'red' },
    ];
    const text = buildCompareShareText({ subject: '財務会計論', score: 60, passed: false, feedbacks });
    expect(text).toContain('ポイントA');
    expect(text).toContain('ポイントB');
    expect(text).toContain('ポイントC');
    expect(text).not.toContain('ポイントD');
  });

  test('feedbacksが空のとき「主な指摘」ブロックが省略される', () => {
    const text = buildCompareShareText({ subject: '監査論', score: 70, passed: true, feedbacks: [] });
    expect(text).not.toContain('主な指摘');
  });

  test('ハッシュタグが末尾に含まれる', () => {
    const text = buildCompareShareText({ subject: '企業法', score: 80, passed: true, feedbacks: [] });
    expect(text).toContain('#CPA試験');
    expect(text).toContain('#比較添削');
  });
});
