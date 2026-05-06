// server/tests/rag.test.js
// 論点抽出AI + pgvector セマンティック検索のテスト (Issue #11)

// ---- モジュールモック（require より先に実行される） ----
jest.mock('../mongodb', () => ({ connectMongo: jest.fn(), isMongoEnabled: false }));
jest.mock('../models/Textbook', () => ({}));
jest.mock('../models/Chunk',    () => ({}));

// Anthropic モック
const mockMessagesCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  jest.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  }))
);

// OpenAI モック
const mockEmbeddingsCreate = jest.fn();
jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    embeddings: { create: mockEmbeddingsCreate },
  }))
);

// Supabase モック（vectorSearch を含む）
const mockVectorSearch = jest.fn();
jest.mock('../supabase', () => ({
  supabase:     { from: jest.fn().mockReturnValue({ delete: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({}) }) },
  vectorSearch: mockVectorSearch,
}));

// OpenAI API KEY をモジュールロード前にセット
process.env.OPENAI_API_KEY    = 'test-openai-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

const request = require('supertest');
const { extractIssues, getEmbedding, splitIntoSemanticChunks } = require('../index');
const app = require('../index');
const { vectorSearch } = require('../supabase');

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================
// extractIssues — Claude haiku で論点を抽出
// ============================================================
describe('extractIssues', () => {
  test('Claude haiku を呼び出してカンマ区切りの論点を返す', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ text: '収益認識, リース会計, 税効果会計' }],
    });

    const result = await extractIssues('答案テキスト', '模範解答テキスト', '財務会計論');

    expect(result).toBe('収益認識, リース会計, 税効果会計');
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('財務会計論'),
          }),
        ]),
      })
    );
  });

  test('答案・模範解答を 400 字に切り詰めてプロンプトに含める', async () => {
    const longText = 'あ'.repeat(600);
    mockMessagesCreate.mockResolvedValueOnce({ content: [{ text: '論点A, 論点B' }] });

    await extractIssues(longText, longText, '管理会計論');

    const calledContent = mockMessagesCreate.mock.calls[0][0].messages[0].content;
    // 600字 × 2 よりも短いはず（400字に切り詰め済み）
    expect(calledContent.length).toBeLessThan(1250);
  });

  test('答案・模範解答・科目の3引数を受け取る', async () => {
    mockMessagesCreate.mockResolvedValueOnce({ content: [{ text: 'キャッシュフロー計算書' }] });

    const result = await extractIssues('CF答案', 'CF模範', '財務会計論');
    expect(typeof result).toBe('string');
  });
});

// ============================================================
// getEmbedding — OpenAI text-embedding-3-small
// ============================================================
describe('getEmbedding', () => {
  test('text-embedding-3-small を呼び出して 1536 次元ベクトルを返す', async () => {
    const fakeEmbedding = Array(1536).fill(0.1);
    mockEmbeddingsCreate.mockResolvedValueOnce({
      data: [{ embedding: fakeEmbedding }],
    });

    const result = await getEmbedding('収益認識, リース会計');

    expect(result).toHaveLength(1536);
    expect(mockEmbeddingsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'text-embedding-3-small' })
    );
  });

  test('テキストを 2000 字に切り詰めて API へ渡す', async () => {
    const longText = 'x'.repeat(3000);
    mockEmbeddingsCreate.mockResolvedValueOnce({
      data: [{ embedding: Array(1536).fill(0.0) }],
    });

    await getEmbedding(longText);

    const calledInput = mockEmbeddingsCreate.mock.calls[0][0].input;
    expect(calledInput.length).toBe(2000);
  });

  test('モデル名 text-embedding-3-small を使用する', async () => {
    mockEmbeddingsCreate.mockResolvedValueOnce({
      data: [{ embedding: Array(1536).fill(0.05) }],
    });

    await getEmbedding('テスト論点');

    expect(mockEmbeddingsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'text-embedding-3-small' })
    );
  });
});

// ============================================================
// splitIntoSemanticChunks — 論点単位チャンク分割 (Issue #12)
// ============================================================
describe('splitIntoSemanticChunks', () => {
  test('空テキストは空配列を返す', () => {
    expect(splitIntoSemanticChunks(1, '', '', '財務会計論')).toEqual([]);
    expect(splitIntoSemanticChunks(1, '', null, '財務会計論')).toEqual([]);
  });

  test('見出し【...】で複数チャンクに分割され topicName が付与される', () => {
    const text = '【収益認識】顧客との契約を識別し収益を認識する。五つのステップが重要。【リース会計】ファイナンスリースとオペレーティングリースを区別する。';
    const chunks = splitIntoSemanticChunks(1, text, '', '財務会計論');
    expect(chunks.length).toBeGreaterThan(1);
    const first = chunks.find(c => c.topicName.includes('収益認識'));
    expect(first).toBeDefined();
    expect(first.importance).toBe(2);
  });

  test('第X章パターンで分割され重要度3が付与される', () => {
    const text = '第1章 収益認識 収益認識の基本概念。第2章 リース会計 ファイナンスリースの会計処理。';
    const chunks = splitIntoSemanticChunks(1, text, '', '財務会計論');
    expect(chunks.length).toBeGreaterThan(1);
    const chapterChunks = chunks.filter(c => c.importance === 3);
    expect(chapterChunks.length).toBeGreaterThan(0);
  });

  test('見出しなしテキストは段落分割または1チャンクで返る', () => {
    const text = '収益認識の基本概念は企業が財またはサービスを顧客に移転した時点で収益を認識することです。';
    const chunks = splitIntoSemanticChunks(1, text, '', '財務会計論');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]).toHaveProperty('topicName');
    expect(chunks[0]).toHaveProperty('importance');
    expect(chunks[0]).toHaveProperty('chunkIndex');
    expect(chunks[0]).toHaveProperty('pageNum', 1);
  });

  test('diagramDescription がある場合は content に含まれる', () => {
    const chunks = splitIntoSemanticChunks(5, 'テキスト内容', '折れ線グラフの説明', '財務会計論');
    const allContent = chunks.map(c => c.content).join('');
    expect(allContent).toContain('折れ線グラフの説明');
  });

  test('chunkIndex が 0 から連番で付与される', () => {
    const text = '【論点A】説明A。【論点B】説明B。【論点C】説明C。';
    const chunks = splitIntoSemanticChunks(3, text, '', '管理会計論');
    chunks.forEach((c, i) => {
      expect(c.chunkIndex).toBe(i);
    });
  });

  test('500文字超のチャンクは文境界で再分割される', () => {
    const longSentence = '収益認識の説明。'.repeat(80);
    const chunks = splitIntoSemanticChunks(1, longSentence, '', '財務会計論');
    chunks.forEach(c => {
      expect(c.content.length).toBeLessThanOrEqual(500);
    });
  });
});

// ============================================================
// vectorSearch — pgvector 類似チャンク上位5件取得
// ============================================================
describe('vectorSearch', () => {
  test('pgvector 検索結果（上位5件）を返す', async () => {
    const fakeHits = [
      { id: 1, subject: '財務会計論', content: 'リース会計の説明', textbook_id: 'book1', page_num: 10, similarity: 0.95 },
      { id: 2, subject: '財務会計論', content: '収益認識の説明', textbook_id: 'book1', page_num: 20, similarity: 0.90 },
      { id: 3, subject: '財務会計論', content: '税効果会計の説明', textbook_id: 'book1', page_num: 30, similarity: 0.85 },
      { id: 4, subject: '財務会計論', content: '退職給付会計の説明', textbook_id: 'book1', page_num: 40, similarity: 0.80 },
      { id: 5, subject: '財務会計論', content: '有価証券の説明', textbook_id: 'book1', page_num: 50, similarity: 0.75 },
    ];
    mockVectorSearch.mockResolvedValueOnce(fakeHits);

    const embedding = Array(1536).fill(0.1);
    const result = await vectorSearch(embedding, '財務会計論', 5);

    expect(result).toHaveLength(5);
    expect(result[0].similarity).toBe(0.95);
    expect(result[4].similarity).toBe(0.75);
  });

  test('検索結果が空の場合は空配列を返す', async () => {
    mockVectorSearch.mockResolvedValueOnce([]);

    const result = await vectorSearch(Array(1536).fill(0), '企業法', 5);

    expect(result).toEqual([]);
  });

  test('subject フィルタなし（null）でも呼び出せる', async () => {
    mockVectorSearch.mockResolvedValueOnce([
      { id: 1, subject: '財務会計論', content: 'テスト', textbook_id: 'b1', page_num: 1, similarity: 0.9 },
    ]);

    const result = await vectorSearch(Array(1536).fill(0.2), null, 5);

    expect(result).toHaveLength(1);
  });
});

// ============================================================
// POST /grade — pgvector セマンティック検索 (Issue #27)
// ============================================================
describe('POST /grade pgvector RAG', () => {
  test('supabase + openai 設定済みのとき pgvector で上位5件を取得する', async () => {
    const fakeEmbedding = Array(1536).fill(0.1);
    const fakeHits = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1, subject: '財務会計論',
      content: `チャンク${i + 1}の内容`,
      textbook_id: '財務会計論_テスト教科書',
      page_num: (i + 1) * 10, similarity: 0.9 - i * 0.05,
    }));

    mockEmbeddingsCreate.mockResolvedValueOnce({ data: [{ embedding: fakeEmbedding }] });
    mockVectorSearch.mockResolvedValueOnce(fakeHits);
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ text: '【得点率】80%\n【論点】収益認識\n【誤答論点】なし\n【解説まとめ】テスト解説' }],
    });

    const res = await request(app)
      .post('/grade')
      .send({ question: '収益認識について説明せよ', answer: '答案テキスト', subject: '財務会計論', bookIds: [] });

    expect(res.status).toBe(200);
    expect(mockVectorSearch).toHaveBeenCalledWith(expect.any(Array), '財務会計論', 5);
    expect(res.body.score).toBe(80);
  });

  test('pgvector が空を返した場合は bookIds キャッシュにフォールバックする', async () => {
    const fakeEmbedding = Array(1536).fill(0.0);
    mockEmbeddingsCreate.mockResolvedValueOnce({ data: [{ embedding: fakeEmbedding }] });
    mockVectorSearch.mockResolvedValueOnce([]);
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ text: '【得点率】60%\n【論点】論点B\n【誤答論点】なし\n【解説まとめ】テスト' }],
    });

    const res = await request(app)
      .post('/grade')
      .send({ question: '問題文', answer: '答案', subject: '財務会計論', bookIds: [] });

    expect(res.status).toBe(200);
    expect(res.body.result).toBeDefined();
  });

  test('pgvector 例外発生時は bookIds キャッシュにフォールバックして採点を完了する', async () => {
    mockEmbeddingsCreate.mockRejectedValueOnce(new Error('embedding API error'));
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ text: '【得点率】55%\n【論点】論点C\n【誤答論点】なし\n【解説まとめ】テスト' }],
    });

    const res = await request(app)
      .post('/grade')
      .send({ question: '問題文', answer: '答案', subject: '財務会計論', bookIds: [] });

    expect(res.status).toBe(200);
    expect(res.body.result).toContain('【得点率】55%');
  });
});
