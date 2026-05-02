import {
  detectImagePageNums,
  buildPageContent,
  hasAnyDiagram,
  filterDiagramPages,
  type DiagramPage,
} from '../diagramUtils';

const makePage = (overrides: Partial<DiagramPage> = {}): DiagramPage => ({
  pageNum: 1,
  text: 'テキスト内容',
  ...overrides,
});

// ---- detectImagePageNums ----

describe('detectImagePageNums — 図解候補ページの検出', () => {
  test('テキストが閾値未満のページを返す', () => {
    const pages: DiagramPage[] = [
      makePage({ pageNum: 1, text: 'あ' }),        // 1文字 → 候補
      makePage({ pageNum: 2, text: 'a'.repeat(50) }), // 50文字 → ギリギリ含まない
      makePage({ pageNum: 3, text: '' }),            // 空 → 候補
    ];
    expect(detectImagePageNums(pages)).toEqual([1, 3]);
  });

  test('デフォルト閾値 50 で動作する', () => {
    const pages = [
      makePage({ pageNum: 5, text: 'a'.repeat(49) }),
      makePage({ pageNum: 6, text: 'a'.repeat(50) }),
    ];
    expect(detectImagePageNums(pages)).toEqual([5]);
  });

  test('カスタム閾値を指定できる', () => {
    const pages = [
      makePage({ pageNum: 1, text: 'abc' }),
      makePage({ pageNum: 2, text: 'a'.repeat(100) }),
    ];
    expect(detectImagePageNums(pages, 10)).toEqual([1]);
    expect(detectImagePageNums(pages, 200)).toEqual([1, 2]);
  });

  test('全ページがテキスト十分なら空配列を返す', () => {
    const pages = [makePage({ pageNum: 1, text: 'a'.repeat(100) })];
    expect(detectImagePageNums(pages)).toEqual([]);
  });

  test('空配列を渡しても空配列を返す', () => {
    expect(detectImagePageNums([])).toEqual([]);
  });
});

// ---- buildPageContent ----

describe('buildPageContent — テキスト + 図解説明の結合', () => {
  test('diagramDescription がない場合はテキストのみ返す', () => {
    const page = makePage({ text: '会計基準の説明' });
    expect(buildPageContent(page)).toBe('会計基準の説明');
  });

  test('diagramDescription がある場合は【図解】prefix で結合する', () => {
    const page = makePage({ text: '損益計算書', diagramDescription: '縦軸が金額、横軸が期間のグラフ' });
    const result = buildPageContent(page);
    expect(result).toContain('損益計算書');
    expect(result).toContain('【図解】縦軸が金額、横軸が期間のグラフ');
  });

  test('テキストが空で図解説明のみの場合も正しく結合する', () => {
    const page = makePage({ text: '', diagramDescription: 'フローチャート' });
    expect(buildPageContent(page)).toBe('【図解】フローチャート');
  });

  test('maxLen で切り捨てられる', () => {
    const page = makePage({ text: 'a'.repeat(600) });
    expect(buildPageContent(page, 100)).toHaveLength(100);
  });

  test('前後のスペースをトリムする', () => {
    const page = makePage({ text: '  テキスト  ', diagramDescription: '  図解  ' });
    const result = buildPageContent(page);
    expect(result.startsWith(' ')).toBe(false);
  });
});

// ---- hasAnyDiagram ----

describe('hasAnyDiagram — 図解有無の判定', () => {
  test('isImage=true のページがあれば true を返す', () => {
    const pages = [makePage({ isImage: true })];
    expect(hasAnyDiagram(pages)).toBe(true);
  });

  test('diagramDescription がある場合も true を返す', () => {
    const pages = [makePage({ diagramDescription: '説明あり' })];
    expect(hasAnyDiagram(pages)).toBe(true);
  });

  test('全ページに図解情報がなければ false を返す', () => {
    const pages = [makePage(), makePage({ pageNum: 2 })];
    expect(hasAnyDiagram(pages)).toBe(false);
  });

  test('空配列は false を返す', () => {
    expect(hasAnyDiagram([])).toBe(false);
  });
});

// ---- filterDiagramPages ----

describe('filterDiagramPages — 図解ページのフィルタリング', () => {
  const pages: DiagramPage[] = [
    makePage({ pageNum: 1, text: '通常テキスト' }),
    makePage({ pageNum: 2, isImage: true, text: '' }),
    makePage({ pageNum: 3, diagramDescription: '棒グラフ' }),
    makePage({ pageNum: 4, text: '別の通常テキスト' }),
  ];

  test('isImage=true または diagramDescription を持つページのみ返す', () => {
    const result = filterDiagramPages(pages);
    expect(result.map((p) => p.pageNum)).toEqual([2, 3]);
  });

  test('図解ページがなければ空配列を返す', () => {
    const plainPages = [makePage({ pageNum: 1 }), makePage({ pageNum: 2 })];
    expect(filterDiagramPages(plainPages)).toHaveLength(0);
  });

  test('元の配列を変更しない', () => {
    filterDiagramPages(pages);
    expect(pages).toHaveLength(4);
  });

  test('isImage=false でも diagramDescription があれば含まれる', () => {
    const p = makePage({ pageNum: 5, isImage: false, diagramDescription: '表' });
    expect(filterDiagramPages([p])).toHaveLength(1);
  });
});

// ---- RAG 統合シナリオ ----

describe('図解対応 RAG — 統合シナリオ', () => {
  const textbookPages: DiagramPage[] = [
    { pageNum: 1, text: '貸借対照表とは資産・負債・純資産を表す財務諸表である。', isImage: false },
    { pageNum: 2, text: '', isImage: true, diagramDescription: '縦棒グラフ。左列が資産合計500万円、右列が負債200万円・純資産300万円を示す。' },
    { pageNum: 3, text: '損益計算書は収益と費用の差額として利益を計算する。', isImage: false },
  ];

  test('図解ページが検出される', () => {
    const imageNums = detectImagePageNums(textbookPages);
    expect(imageNums).toContain(2);
  });

  test('図解ページの RAG コンテンツに図解説明が含まれる', () => {
    const content = buildPageContent(textbookPages[1]);
    expect(content).toContain('【図解】');
    expect(content).toContain('500万円');
  });

  test('テキストページは通常のコンテンツのみ返す', () => {
    const content = buildPageContent(textbookPages[0]);
    expect(content).not.toContain('【図解】');
    expect(content).toContain('貸借対照表');
  });

  test('図解有無フラグが正しく判定される', () => {
    expect(hasAnyDiagram(textbookPages)).toBe(true);
    expect(hasAnyDiagram([textbookPages[0], textbookPages[2]])).toBe(false);
  });
});
