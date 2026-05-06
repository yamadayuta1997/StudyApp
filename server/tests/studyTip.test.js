// server/tests/studyTip.test.js
// ミス履歴ベースのパーソナライズ学習アドバイス (Issue #23)

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

beforeEach(() => {
  jest.clearAllMocks();
  mockMessagesCreate.mockResolvedValue({ content: [{ text: 'アドバイステスト' }] });
});

describe('POST /study-tip', () => {
  test('wrongTopicsRanked がある場合にパーソナライズされたプロンプトを生成する', async () => {
    const wrongTopicsRanked = [
      { topic: '収益認識', count: 5 },
      { topic: 'リース会計', count: 3 },
    ];

    const res = await request(app)
      .post('/study-tip')
      .send({ subject: '財務会計論', avgScore: 60, wrongTopicsRanked, improvedTopics: [] });

    expect(res.status).toBe(200);
    expect(res.body.tip).toBe('アドバイステスト');

    const calledContent = mockMessagesCreate.mock.calls[0][0].messages[0].content;
    expect(calledContent).toContain('収益認識');
    expect(calledContent).toContain('5回ミス');
    expect(calledContent).toContain('リース会計');
    expect(calledContent).toContain('よくミスする論点');
  });

  test('improvedTopics がある場合に改善論点セクションをプロンプトに含める', async () => {
    const res = await request(app)
      .post('/study-tip')
      .send({
        subject: '財務会計論',
        avgScore: 70,
        wrongTopicsRanked: [{ topic: '税効果会計', count: 2 }],
        improvedTopics: ['固定資産', '棚卸資産'],
      });

    expect(res.status).toBe(200);
    const calledContent = mockMessagesCreate.mock.calls[0][0].messages[0].content;
    expect(calledContent).toContain('改善が見られた論点');
    expect(calledContent).toContain('固定資産');
    expect(calledContent).toContain('棚卸資産');
    expect(calledContent).toContain('改善できている論点');
  });

  test('wrongTopicsRanked が空の場合は一般アドバイスのプロンプトを生成する', async () => {
    const res = await request(app)
      .post('/study-tip')
      .send({ subject: '監査論', avgScore: null, wrongTopicsRanked: [], improvedTopics: [] });

    expect(res.status).toBe(200);
    const calledContent = mockMessagesCreate.mock.calls[0][0].messages[0].content;
    expect(calledContent).toContain('この科目で特に重要なポイント');
    expect(calledContent).not.toContain('よくミスする論点');
  });

  test('wrongTopicsRanked を省略した場合も一般アドバイスになる', async () => {
    const res = await request(app)
      .post('/study-tip')
      .send({ subject: '企業法', avgScore: 55 });

    expect(res.status).toBe(200);
    const calledContent = mockMessagesCreate.mock.calls[0][0].messages[0].content;
    expect(calledContent).toContain('この科目で特に重要なポイント');
  });

  test('avgScore がある場合にスコアコンテキストをプロンプトに含める', async () => {
    const res = await request(app)
      .post('/study-tip')
      .send({
        subject: '財務会計論',
        avgScore: 72,
        wrongTopicsRanked: [{ topic: '連結会計', count: 4 }],
        improvedTopics: [],
      });

    expect(res.status).toBe(200);
    const calledContent = mockMessagesCreate.mock.calls[0][0].messages[0].content;
    expect(calledContent).toContain('72%');
  });

  test('claude-sonnet-4-6 を使用する', async () => {
    const res = await request(app)
      .post('/study-tip')
      .send({ subject: '財務会計論', wrongTopicsRanked: [{ topic: '収益認識', count: 1 }] });

    expect(res.status).toBe(200);
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6' })
    );
  });
});
