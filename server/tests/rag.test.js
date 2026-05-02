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

const { extractIssues, getEmbedding } = require('../index');
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
