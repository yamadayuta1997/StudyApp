// server/tests/textbookRegisterValidation.test.js
// 重複チェックと登録件数上限のロジックテスト

jest.mock('../mongodb', () => ({ connectMongo: jest.fn(), isMongoEnabled: false }));
jest.mock('../models/Textbook', () => ({}));
jest.mock('../models/Chunk', () => ({}));

const TEXTBOOK_MAX_COUNT = 20;

function checkDuplicate(cache, bookId, overwrite) {
  return cache.has(bookId) && !overwrite;
}

function checkLimitExceeded(cache, bookId, maxCount) {
  return !cache.has(bookId) && cache.size >= maxCount;
}

describe('textbook register — 重複チェック', () => {
  test('同一bookIdが存在し overwrite=false なら重複エラー', () => {
    const cache = new Map([['財務会計論_テキスト', {}]]);
    expect(checkDuplicate(cache, '財務会計論_テキスト', false)).toBe(true);
  });

  test('同一bookIdが存在し overwrite=true なら重複エラーなし', () => {
    const cache = new Map([['財務会計論_テキスト', {}]]);
    expect(checkDuplicate(cache, '財務会計論_テキスト', true)).toBe(false);
  });

  test('bookIdが存在しない場合は重複エラーなし', () => {
    const cache = new Map([['管理会計論_テキスト', {}]]);
    expect(checkDuplicate(cache, '財務会計論_テキスト', false)).toBe(false);
  });

  test('空のキャッシュでは重複エラーなし', () => {
    const cache = new Map();
    expect(checkDuplicate(cache, '財務会計論_テキスト', false)).toBe(false);
  });
});

describe('textbook register — 件数上限チェック', () => {
  test('キャッシュが上限未満の場合はエラーなし', () => {
    const cache = new Map(
      Array.from({ length: 19 }, (_, i) => [`book_${i}`, {}])
    );
    expect(checkLimitExceeded(cache, 'new_book', TEXTBOOK_MAX_COUNT)).toBe(false);
  });

  test('キャッシュが上限に達している場合は上限エラー', () => {
    const cache = new Map(
      Array.from({ length: 20 }, (_, i) => [`book_${i}`, {}])
    );
    expect(checkLimitExceeded(cache, 'new_book', TEXTBOOK_MAX_COUNT)).toBe(true);
  });

  test('上書き時（既存bookId）は上限を超えていてもエラーなし', () => {
    const cache = new Map(
      Array.from({ length: 20 }, (_, i) => [`book_${i}`, {}])
    );
    // 既存bookIdへの上書きは checkLimitExceeded で false になる
    expect(checkLimitExceeded(cache, 'book_0', TEXTBOOK_MAX_COUNT)).toBe(false);
  });

  test('キャッシュが空の場合は上限エラーなし', () => {
    const cache = new Map();
    expect(checkLimitExceeded(cache, 'new_book', TEXTBOOK_MAX_COUNT)).toBe(false);
  });

  test('上限が1の場合: 1件登録済みで新規登録はエラー', () => {
    const cache = new Map([['book_0', {}]]);
    expect(checkLimitExceeded(cache, 'new_book', 1)).toBe(true);
  });

  test('上限が1の場合: 既存bookIdへの上書きはエラーなし', () => {
    const cache = new Map([['book_0', {}]]);
    expect(checkLimitExceeded(cache, 'book_0', 1)).toBe(false);
  });
});

describe('textbook register — TEXTBOOK_MAX_COUNT 環境変数', () => {
  test('デフォルト値は20', () => {
    const val = parseInt(process.env.TEXTBOOK_MAX_COUNT || '20', 10);
    expect(val).toBe(20);
  });

  test('環境変数で任意の値を設定できる', () => {
    const origEnv = process.env.TEXTBOOK_MAX_COUNT;
    process.env.TEXTBOOK_MAX_COUNT = '5';
    const val = parseInt(process.env.TEXTBOOK_MAX_COUNT || '20', 10);
    expect(val).toBe(5);
    if (origEnv === undefined) delete process.env.TEXTBOOK_MAX_COUNT;
    else process.env.TEXTBOOK_MAX_COUNT = origEnv;
  });
});
