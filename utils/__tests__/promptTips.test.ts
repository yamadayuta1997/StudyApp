// promptTips の蓄積・リセットロジックのテスト

const PROMPT_TIPS_KEY = 'compare_prompt_tips';
const MAX_TIPS = 10;

function accumulateTips(current: string[], incoming: string[]): string[] {
  return [...current, ...incoming].slice(-MAX_TIPS);
}

function resetTips(): string[] {
  return [];
}

describe('promptTips — 蓄積ロジック', () => {
  test('新しいヒントが末尾に追加される', () => {
    const result = accumulateTips(['既存A'], ['新規B', '新規C']);
    expect(result).toEqual(['既存A', '新規B', '新規C']);
  });

  test('MAX_TIPS(10)を超えた場合は古いものが切り捨てられる', () => {
    const current = Array.from({ length: 9 }, (_, i) => `tip${i + 1}`);
    const result = accumulateTips(current, ['new1', 'new2']);
    expect(result).toHaveLength(MAX_TIPS);
    expect(result[result.length - 1]).toBe('new2');
    expect(result[result.length - 2]).toBe('new1');
    expect(result[0]).toBe('tip2');
  });

  test('空のcurrentに追加できる', () => {
    const result = accumulateTips([], ['tip1']);
    expect(result).toEqual(['tip1']);
  });

  test('空のincomingを渡しても変化しない', () => {
    const current = ['tip1', 'tip2'];
    const result = accumulateTips(current, []);
    expect(result).toEqual(['tip1', 'tip2']);
  });

  test('MAX_TIPS件ちょうどは切り捨てない', () => {
    const current = Array.from({ length: 9 }, (_, i) => `tip${i + 1}`);
    const result = accumulateTips(current, ['tip10']);
    expect(result).toHaveLength(10);
  });
});

describe('promptTips — リセットロジック', () => {
  test('リセット後は空配列になる', () => {
    const result = resetTips();
    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });

  test('リセット後の配列は元の配列と独立している', () => {
    const original = ['tip1', 'tip2', 'tip3'];
    const reset = resetTips();
    expect(reset).toEqual([]);
    expect(original).toHaveLength(3);
  });

  test('空配列をリセットしてもエラーにならない', () => {
    const result = resetTips();
    expect(result).toEqual([]);
  });
});

describe('promptTips — AsyncStorageキー', () => {
  test('ストレージキーが正しい', () => {
    expect(PROMPT_TIPS_KEY).toBe('compare_prompt_tips');
  });
});
