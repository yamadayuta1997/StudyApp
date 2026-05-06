// server/tests/topicGrade.test.js
// 論点ベース採点: extractTopicsFromChunks + /textbook/chunks-by-pages (Issue #19)

jest.mock('../mongodb', () => ({ connectMongo: jest.fn(), isMongoEnabled: false }));
jest.mock('../models/Textbook', () => ({}));
jest.mock('../models/Chunk', () => ({}));

const mockMessagesCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  jest.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  }))
);

jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    embeddings: { create: jest.fn() },
  }))
);

jest.mock('../supabase', () => ({
  supabase: null,
  vectorSearch: jest.fn(),
}));

process.env.ANTHROPIC_API_KEY = 'test-key';

const request = require('supertest');
const app = require('../index');
const { extractTopicsFromChunks } = require('../index');

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================
// extractTopicsFromChunks
// ============================================================
describe('extractTopicsFromChunks', () => {
  test('教科書チャンクから論点リストを配列で返す', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ text: '収益認識, リース会計, 税効果会計' }],
    });

    const result = await extractTopicsFromChunks('教科書テキスト', '財務会計論');

    expect(result).toEqual(['収益認識', 'リース会計', '税効果会計']);
  });

  test('claude-haiku を使用する', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ text: '論点A' }],
    });

    await extractTopicsFromChunks('テキスト', '財務会計論');

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001' })
    );
  });

  test('科目名がプロンプトに含まれる', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ text: '論点1' }],
    });

    await extractTopicsFromChunks('テキスト', '監査論');

    const calledContent = mockMessagesCreate.mock.calls[0][0].messages[0].content;
    expect(calledContent).toContain('監査論');
  });

  test('読点・カンマ・全角カンマで分割した配列を返す', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ text: '論点A、論点B，論点C' }],
    });

    const result = await extractTopicsFromChunks('テキスト', '財務会計論');

    expect(result).toHaveLength(3);
    expect(result).toContain('論点A');
    expect(result).toContain('論点B');
    expect(result).toContain('論点C');
  });

  test('チャンクテキストを 2000 字に切り詰めてAPIへ渡す', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ text: '論点1' }],
    });

    const longText = 'あ'.repeat(3000);
    await extractTopicsFromChunks(longText, '財務会計論');

    const calledContent = mockMessagesCreate.mock.calls[0][0].messages[0].content;
    // プロンプト本文 + 2000字の切り詰めテキストのため 3000字を超えない
    expect(calledContent.length).toBeLessThan(2500);
  });

  test('空文字を返した場合は空配列になる', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ text: '' }],
    });

    const result = await extractTopicsFromChunks('テキスト', '企業法');

    expect(result).toEqual([]);
  });
});

// ============================================================
// POST /textbook/chunks-by-pages (MongoDB 無効 → JSON フォールバック)
// ============================================================
describe('POST /textbook/chunks-by-pages', () => {
  test('bookId なしは 400 を返す', async () => {
    const res = await request(app)
      .post('/textbook/chunks-by-pages')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/bookId/);
  });

  test('登録されていない bookId は 404 を返す', async () => {
    const res = await request(app)
      .post('/textbook/chunks-by-pages')
      .send({ bookId: 'nonexistent_book', fromPage: '1', toPage: '5' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});
