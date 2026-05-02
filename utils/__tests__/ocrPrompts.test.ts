import {
  HANDWRITING_OCR_PROMPT,
  MODEL_ANSWER_OCR_PROMPT,
  GENERAL_OCR_PROMPT,
  getOcrPrompt,
  type OcrMode,
} from '../ocrPrompts';

describe('getOcrPrompt — モード別プロンプト選択', () => {
  test('"handwriting" モードは HANDWRITING_OCR_PROMPT を返す', () => {
    expect(getOcrPrompt('handwriting')).toBe(HANDWRITING_OCR_PROMPT);
  });

  test('"model_answer" モードは MODEL_ANSWER_OCR_PROMPT を返す', () => {
    expect(getOcrPrompt('model_answer')).toBe(MODEL_ANSWER_OCR_PROMPT);
  });

  test('"general" モードは GENERAL_OCR_PROMPT を返す', () => {
    expect(getOcrPrompt('general')).toBe(GENERAL_OCR_PROMPT);
  });
});

describe('HANDWRITING_OCR_PROMPT — 手書き答案用プロンプトの内容検証', () => {
  test('崩し字・略字への対応指示が含まれる', () => {
    expect(HANDWRITING_OCR_PROMPT).toContain('崩し字');
  });

  test('会計記号（¥, %, ÷）の転写指示が含まれる', () => {
    expect(HANDWRITING_OCR_PROMPT).toContain('¥');
    expect(HANDWRITING_OCR_PROMPT).toContain('%');
    expect(HANDWRITING_OCR_PROMPT).toContain('÷');
  });

  test('T字勘定（借方・貸方）への対応指示が含まれる', () => {
    expect(HANDWRITING_OCR_PROMPT).toContain('T字勘定');
    expect(HANDWRITING_OCR_PROMPT).toContain('借方');
    expect(HANDWRITING_OCR_PROMPT).toContain('貸方');
  });

  test('不明箇所を【不明】と記載する指示が含まれる', () => {
    expect(HANDWRITING_OCR_PROMPT).toContain('【不明】');
  });

  test('余分な説明を出力しない指示が含まれる', () => {
    expect(HANDWRITING_OCR_PROMPT).toContain('転写結果のみ');
  });
});

describe('MODEL_ANSWER_OCR_PROMPT — 手書き模範解答用プロンプトの内容検証', () => {
  test('採点基準キーワードの正確な転写指示が含まれる', () => {
    expect(MODEL_ANSWER_OCR_PROMPT).toContain('採点基準');
  });

  test('勘定科目名を正式名称で転写する指示が含まれる', () => {
    expect(MODEL_ANSWER_OCR_PROMPT).toContain('勘定科目名');
    expect(MODEL_ANSWER_OCR_PROMPT).toContain('正式名称');
  });

  test('金額の桁区切り転写指示が含まれる', () => {
    expect(MODEL_ANSWER_OCR_PROMPT).toContain('1,000,000');
  });

  test('T字勘定（借方・貸方）への対応指示が含まれる', () => {
    expect(MODEL_ANSWER_OCR_PROMPT).toContain('T字勘定');
  });

  test('不明箇所を【不明】と記載する指示が含まれる', () => {
    expect(MODEL_ANSWER_OCR_PROMPT).toContain('【不明】');
  });
});

describe('GENERAL_OCR_PROMPT — 汎用プロンプトの内容検証', () => {
  test('手書き・印刷の両方に対応する指示が含まれる', () => {
    expect(GENERAL_OCR_PROMPT).toContain('手書き文字');
    expect(GENERAL_OCR_PROMPT).toContain('印刷文字');
  });

  test('不鮮明箇所を【不明】と記載する指示が含まれる', () => {
    expect(GENERAL_OCR_PROMPT).toContain('【不明】');
  });
});

describe('プロンプトの差異検証', () => {
  test('HANDWRITING と MODEL_ANSWER は異なる内容を持つ', () => {
    expect(HANDWRITING_OCR_PROMPT).not.toBe(MODEL_ANSWER_OCR_PROMPT);
  });

  test('HANDWRITING_OCR_PROMPT は GENERAL_OCR_PROMPT より詳細（文字数が多い）', () => {
    expect(HANDWRITING_OCR_PROMPT.length).toBeGreaterThan(GENERAL_OCR_PROMPT.length);
  });

  test('MODEL_ANSWER_OCR_PROMPT は GENERAL_OCR_PROMPT より詳細（文字数が多い）', () => {
    expect(MODEL_ANSWER_OCR_PROMPT.length).toBeGreaterThan(GENERAL_OCR_PROMPT.length);
  });
});
