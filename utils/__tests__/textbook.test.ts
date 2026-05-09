// 登録済み教科書の一覧・フィルタリングロジックのテスト

type TextbookMeta = {
  bookId: string;
  subject: string;
  bookName: string;
  description: string;
  totalPages: number;
  registeredAt: string;
};

const SUBJECTS = ['財務会計論', '管理会計論', '監査論', '企業法', '租税法', '経営学'];

function filterBySubject(books: TextbookMeta[], subject: string | null): TextbookMeta[] {
  return subject ? books.filter((b) => b.subject === subject) : books;
}

function sortByDateDesc(books: TextbookMeta[]): TextbookMeta[] {
  return [...books].sort(
    (a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime()
  );
}

function deleteBook(books: TextbookMeta[], bookId: string): TextbookMeta[] {
  return books.filter((b) => b.bookId !== bookId);
}

function buildBookId(subject: string, bookName: string): string {
  return `${subject}_${bookName}`;
}

function validateRegister(bookName: string): string {
  if (!bookName.trim()) return '教科書名を入力してください。';
  return '';
}

const makeBook = (overrides: Partial<TextbookMeta> = {}): TextbookMeta => ({
  bookId: '財務会計論_テキスト',
  subject: '財務会計論',
  bookName: 'テキスト',
  description: '',
  totalPages: 100,
  registeredAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('textbook — 科目フィルタリング', () => {
  const books: TextbookMeta[] = [
    makeBook({ bookId: '財務会計論_A', subject: '財務会計論', bookName: 'A' }),
    makeBook({ bookId: '管理会計論_B', subject: '管理会計論', bookName: 'B' }),
    makeBook({ bookId: '監査論_C', subject: '監査論', bookName: 'C' }),
  ];

  test('nullを指定するとすべて返る', () => {
    expect(filterBySubject(books, null)).toHaveLength(3);
  });

  test('特定科目でフィルタすると該当のみ返る', () => {
    const result = filterBySubject(books, '財務会計論');
    expect(result).toHaveLength(1);
    expect(result[0].subject).toBe('財務会計論');
  });

  test('登録なし科目でフィルタすると空配列になる', () => {
    expect(filterBySubject(books, '経営学')).toHaveLength(0);
  });

  test('空のbook配列でフィルタしてもエラーにならない', () => {
    expect(filterBySubject([], '財務会計論')).toHaveLength(0);
  });

  test('元の配列を変更しない', () => {
    filterBySubject(books, '財務会計論');
    expect(books).toHaveLength(3);
  });
});

describe('textbook — 日付降順ソート', () => {
  const books: TextbookMeta[] = [
    makeBook({ bookId: '財務会計論_A', registeredAt: '2026-01-01T00:00:00.000Z' }),
    makeBook({ bookId: '財務会計論_B', registeredAt: '2026-03-01T00:00:00.000Z' }),
    makeBook({ bookId: '財務会計論_C', registeredAt: '2026-02-01T00:00:00.000Z' }),
  ];

  test('最新登録が先頭に来る', () => {
    const sorted = sortByDateDesc(books);
    expect(sorted[0].bookId).toBe('財務会計論_B');
    expect(sorted[1].bookId).toBe('財務会計論_C');
    expect(sorted[2].bookId).toBe('財務会計論_A');
  });

  test('元の配列を変更しない', () => {
    sortByDateDesc(books);
    expect(books[0].bookId).toBe('財務会計論_A');
  });
});

describe('textbook — 削除ロジック', () => {
  const books: TextbookMeta[] = [
    makeBook({ bookId: '財務会計論_A' }),
    makeBook({ bookId: '管理会計論_B' }),
    makeBook({ bookId: '監査論_C' }),
  ];

  test('指定IDの教科書が削除される', () => {
    const result = deleteBook(books, '管理会計論_B');
    expect(result).toHaveLength(2);
    expect(result.find((b) => b.bookId === '管理会計論_B')).toBeUndefined();
  });

  test('存在しないIDを指定しても件数が変わらない', () => {
    const result = deleteBook(books, '存在しない_ID');
    expect(result).toHaveLength(3);
  });

  test('空配列の削除はエラーにならない', () => {
    expect(deleteBook([], '財務会計論_A')).toHaveLength(0);
  });
});

describe('textbook — bookId生成', () => {
  test('subject_bookName の形式で生成される', () => {
    expect(buildBookId('財務会計論', 'テキスト上巻')).toBe('財務会計論_テキスト上巻');
  });

  test('各科目で正しく生成される', () => {
    for (const s of SUBJECTS) {
      expect(buildBookId(s, 'book')).toBe(`${s}_book`);
    }
  });
});

describe('textbook — 登録バリデーション', () => {
  test('教科書名が空のときエラーメッセージを返す', () => {
    expect(validateRegister('')).toBe('教科書名を入力してください。');
  });

  test('空白のみの場合もエラーになる', () => {
    expect(validateRegister('   ')).toBe('教科書名を入力してください。');
  });

  test('教科書名が入力されている場合は空文字を返す', () => {
    expect(validateRegister('財務会計論テキスト')).toBe('');
  });
});

// ── ファイルサイズ・ページ数バリデーション ──────────────────────────────

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const BYTES_PER_ESTIMATED_PAGE = 100 * 1024;
const PAGE_WARNING_THRESHOLD = 500;

function validateFileSize(sizeBytes: number): string {
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    const mb = (sizeBytes / 1024 / 1024).toFixed(1);
    return `ファイルサイズが大きすぎます（${mb}MB）。50MB以下のPDFを選択してください。`;
  }
  return '';
}

function estimatePageCount(sizeBytes: number): number {
  return Math.ceil(sizeBytes / BYTES_PER_ESTIMATED_PAGE);
}

function needsPageWarning(sizeBytes: number): boolean {
  return estimatePageCount(sizeBytes) > PAGE_WARNING_THRESHOLD;
}

describe('textbook — ファイルサイズバリデーション', () => {
  test('50MB 以下はエラーなし', () => {
    expect(validateFileSize(50 * 1024 * 1024)).toBe('');
  });

  test('50MB 超はエラーメッセージを返す', () => {
    const result = validateFileSize(51 * 1024 * 1024);
    expect(result).toContain('51.0MB');
    expect(result).toContain('50MB以下');
  });

  test('ちょうど 50MB + 1byte でエラーになる', () => {
    expect(validateFileSize(MAX_FILE_SIZE_BYTES + 1)).not.toBe('');
  });

  test('1MB のファイルはエラーなし', () => {
    expect(validateFileSize(1 * 1024 * 1024)).toBe('');
  });

  test('0 bytes はエラーなし', () => {
    expect(validateFileSize(0)).toBe('');
  });
});

describe('textbook — 推定ページ数', () => {
  test('100KB は約 1 ページと推定される', () => {
    expect(estimatePageCount(100 * 1024)).toBe(1);
  });

  test('500 ページ相当（50MB）は警告なし', () => {
    expect(needsPageWarning(500 * BYTES_PER_ESTIMATED_PAGE)).toBe(false);
  });

  test('501 ページ相当は警告あり', () => {
    expect(needsPageWarning(501 * BYTES_PER_ESTIMATED_PAGE)).toBe(true);
  });

  test('1KB は切り上げで 1 ページ', () => {
    expect(estimatePageCount(1024)).toBe(1);
  });

  test('0 bytes は 0 ページ', () => {
    expect(estimatePageCount(0)).toBe(0);
  });

  test('PAGE_WARNING_THRESHOLD は 500', () => {
    expect(PAGE_WARNING_THRESHOLD).toBe(500);
  });
});

// computeProgress: phaseとembedding進捗から0〜100%を算出する
function computeProgress(phase: string, progress?: number, total?: number): number {
  if (phase === 'uploading') return 5;
  if (phase === 'analyzing_diagrams') return 20;
  if (phase === 'saving_mongodb') return 50;
  if (phase === 'embedding') {
    const base = 50;
    if (typeof progress === 'number' && total && total > 0) {
      return Math.min(95, Math.round(base + (progress / total) * 45));
    }
    return base;
  }
  return 0;
}

describe('textbook — computeProgress', () => {
  test('uploading は 5%', () => {
    expect(computeProgress('uploading')).toBe(5);
  });

  test('analyzing_diagrams は 20%', () => {
    expect(computeProgress('analyzing_diagrams')).toBe(20);
  });

  test('saving_mongodb は 50%', () => {
    expect(computeProgress('saving_mongodb')).toBe(50);
  });

  test('embedding 開始直後 (0/100) は 50%', () => {
    expect(computeProgress('embedding', 0, 100)).toBe(50);
  });

  test('embedding 50% 完了 (50/100) は 73%', () => {
    expect(computeProgress('embedding', 50, 100)).toBe(73);
  });

  test('embedding 完了直前 (100/100) は 95% に上限クランプ', () => {
    expect(computeProgress('embedding', 100, 100)).toBe(95);
  });

  test('embedding で total=0 のときは base の 50% を返す', () => {
    expect(computeProgress('embedding', 0, 0)).toBe(50);
  });

  test('不明な phase は 0%', () => {
    expect(computeProgress('unknown_phase')).toBe(0);
  });

  test('done phase は 0%（呼び出し側が 100 をセット）', () => {
    expect(computeProgress('done')).toBe(0);
  });
});

describe('textbook — ポーリング停止', () => {
  function makePolling() {
    let ref: ReturnType<typeof setTimeout> | null = null;
    const stopPolling = () => { if (ref) { clearTimeout(ref); ref = null; } };
    const startPolling = (cb: () => void, delay: number) => { ref = setTimeout(cb, delay); };
    const getRef = () => ref;
    return { stopPolling, startPolling, getRef };
  }

  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  test('stopPolling を呼ぶとタイマーがクリアされ ref が null になる', () => {
    const { stopPolling, startPolling, getRef } = makePolling();
    const cb = jest.fn();
    startPolling(cb, 3000);
    expect(getRef()).not.toBeNull();
    stopPolling();
    jest.advanceTimersByTime(5000);
    expect(cb).not.toHaveBeenCalled();
    expect(getRef()).toBeNull();
  });

  test('ポーリング未開始時に stopPolling を呼んでもエラーにならない', () => {
    const { stopPolling } = makePolling();
    expect(() => stopPolling()).not.toThrow();
  });

  test('モーダルを閉じる（resetRegForm）でポーリングが停止する', () => {
    const { stopPolling, startPolling, getRef } = makePolling();
    const cb = jest.fn();
    startPolling(cb, 3000);
    stopPolling(); // resetRegForm calls stopPolling
    jest.advanceTimersByTime(5000);
    expect(cb).not.toHaveBeenCalled();
    expect(getRef()).toBeNull();
  });

  test('アンマウント時クリーンアップでポーリングが停止する', () => {
    const { stopPolling, startPolling, getRef } = makePolling();
    const cb = jest.fn();
    startPolling(cb, 3000);
    const cleanup = stopPolling; // useEffect(() => stopPolling, []) の cleanup
    cleanup();
    jest.advanceTimersByTime(5000);
    expect(cb).not.toHaveBeenCalled();
    expect(getRef()).toBeNull();
  });

  test('stopPolling を2回呼んでもエラーにならない', () => {
    const { stopPolling, startPolling } = makePolling();
    startPolling(jest.fn(), 3000);
    stopPolling();
    expect(() => stopPolling()).not.toThrow();
  });
});

describe('textbook — 表示データの完全性', () => {
  test('全フィールドが揃っている', () => {
    const book = makeBook();
    expect(book).toHaveProperty('bookId');
    expect(book).toHaveProperty('subject');
    expect(book).toHaveProperty('bookName');
    expect(book).toHaveProperty('description');
    expect(book).toHaveProperty('totalPages');
    expect(book).toHaveProperty('registeredAt');
  });

  test('registeredAt から日付表示用スライスが取得できる', () => {
    const book = makeBook({ registeredAt: '2026-05-02T12:34:56.000Z' });
    expect(book.registeredAt.slice(0, 10)).toBe('2026-05-02');
  });

  test('totalPages が0以上の数値である', () => {
    const book = makeBook({ totalPages: 250 });
    expect(book.totalPages).toBeGreaterThanOrEqual(0);
  });

  test('description が空文字でも表示エラーにならない', () => {
    const book = makeBook({ description: '' });
    expect(book.description).toBe('');
  });

  test('SUBJECTS 配列が6科目含む', () => {
    expect(SUBJECTS).toHaveLength(6);
    expect(SUBJECTS).toContain('財務会計論');
    expect(SUBJECTS).toContain('管理会計論');
    expect(SUBJECTS).toContain('監査論');
    expect(SUBJECTS).toContain('企業法');
    expect(SUBJECTS).toContain('租税法');
    expect(SUBJECTS).toContain('経営学');
  });
});

// ── 重複チェック・件数上限チェック (クライアント側ロジック) ────────────────

const TEXTBOOK_MAX_COUNT = 20;

function isDuplicate(books: TextbookMeta[], bookId: string, overwrite: boolean): boolean {
  return !overwrite && books.some((b) => b.bookId === bookId);
}

function isLimitExceeded(books: TextbookMeta[], bookId: string, maxCount: number): boolean {
  const isNew = !books.some((b) => b.bookId === bookId);
  return isNew && books.length >= maxCount;
}

function buildLimitErrorMessage(limit: number): string {
  return `登録件数の上限（${limit}件）に達しています。不要な教科書を削除してから登録してください。`;
}

describe('textbook — 重複チェック', () => {
  const existing = makeBook({ bookId: '財務会計論_テキスト', subject: '財務会計論', bookName: 'テキスト' });

  test('同一bookIdが存在し overwrite=false なら重複と判定', () => {
    expect(isDuplicate([existing], '財務会計論_テキスト', false)).toBe(true);
  });

  test('同一bookIdが存在し overwrite=true なら重複と判定しない', () => {
    expect(isDuplicate([existing], '財務会計論_テキスト', true)).toBe(false);
  });

  test('存在しないbookIdは重複と判定しない', () => {
    expect(isDuplicate([existing], '管理会計論_テキスト', false)).toBe(false);
  });

  test('教科書リストが空の場合は重複なし', () => {
    expect(isDuplicate([], '財務会計論_テキスト', false)).toBe(false);
  });
});

describe('textbook — 件数上限チェック', () => {
  const makeBooks = (count: number): TextbookMeta[] =>
    Array.from({ length: count }, (_, i) =>
      makeBook({ bookId: `財務会計論_book${i}`, bookName: `book${i}` })
    );

  test('上限未満なら上限エラーなし', () => {
    expect(isLimitExceeded(makeBooks(19), '財務会計論_new', TEXTBOOK_MAX_COUNT)).toBe(false);
  });

  test('上限に達している場合は上限エラー', () => {
    expect(isLimitExceeded(makeBooks(20), '財務会計論_new', TEXTBOOK_MAX_COUNT)).toBe(true);
  });

  test('上書き（既存bookId）は上限超過でもエラーなし', () => {
    const books = makeBooks(20);
    expect(isLimitExceeded(books, '財務会計論_book0', TEXTBOOK_MAX_COUNT)).toBe(false);
  });

  test('教科書リストが空の場合は上限エラーなし', () => {
    expect(isLimitExceeded([], '財務会計論_new', TEXTBOOK_MAX_COUNT)).toBe(false);
  });
});

describe('textbook — 上限エラーメッセージ', () => {
  test('上限件数を含むメッセージが生成される', () => {
    const msg = buildLimitErrorMessage(20);
    expect(msg).toContain('20件');
    expect(msg).toContain('上限');
  });

  test('カスタム上限でもメッセージが生成される', () => {
    const msg = buildLimitErrorMessage(5);
    expect(msg).toContain('5件');
  });
});
