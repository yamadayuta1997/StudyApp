// server/tests/cautionTopics.test.js
// 論点連続ミストラッキング: /grade の Supabase history 保存 (Issue #28)

const mockInsert = jest.fn();
const mockFrom = jest.fn(() => ({ insert: mockInsert, select: jest.fn(() => ({ limit: jest.fn().mockResolvedValue({ error: null }) })) }));

jest.mock('../supabase', () => ({
  supabase: { from: mockFrom },
  vectorSearch: jest.fn().mockResolvedValue([]),
}));

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
    embeddings: { create: jest.fn().mockResolvedValue({ data: [{ embedding: new Array(1536).fill(0) }] }) },
  }))
);

process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.OPENAI_API_KEY = 'test-key';

const request = require('supertest');
const app = require('../index');

beforeEach(() => {
  jest.clearAllMocks();
  mockInsert.mockResolvedValue({ error: null });
});

describe('POST /grade — Supabase history 保存 (Issue #28)', () => {
  const gradePayload = {
    question: '収益認識基準を説明せよ',
    answer: '収益は履行義務の充足時に認識する',
    subject: '財務会計論',
    deviceId: 'test-device-001',
  };

  const mockGradeResponse = `採点結果：良好です。
【得点率】80%
【論点】収益認識, 履行義務
【誤答論点】なし
【解説まとめ】収益認識基準の基本を正確に理解できています。`;

  test('採点成功時に Supabase history へ論点情報を保存する', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ text: mockGradeResponse }],
    });

    const res = await request(app)
      .post('/grade')
      .send(gradePayload);

    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith('history');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        device_id: 'test-device-001',
        subject: '財務会計論',
        score: 80,
        result_json: expect.objectContaining({
          topics: expect.arrayContaining(['収益認識', '履行義務']),
          wrongTopics: [],
        }),
      })
    );
  });

  test('誤答論点がある場合も result_json に wrongTopics が含まれる', async () => {
    const wrongResponse = `採点結果：不正解です。
【得点率】40%
【論点】収益認識, 履行義務
【誤答論点】履行義務
【解説まとめ】履行義務の定義を再確認してください。`;

    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ text: wrongResponse }],
    });

    const res = await request(app)
      .post('/grade')
      .send(gradePayload);

    expect(res.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        result_json: expect.objectContaining({
          wrongTopics: ['履行義務'],
        }),
      })
    );
  });

  test('deviceId 未送信時は "unknown" で保存される', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ text: mockGradeResponse }],
    });

    const res = await request(app)
      .post('/grade')
      .send({ ...gradePayload, deviceId: undefined });

    expect(res.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ device_id: 'unknown' })
    );
  });

  test('Supabase 保存失敗でも採点結果を返す', async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ text: mockGradeResponse }],
    });
    mockInsert.mockResolvedValueOnce({ error: { message: 'DB error' } });

    const res = await request(app)
      .post('/grade')
      .send(gradePayload);

    expect(res.status).toBe(200);
    expect(res.body.score).toBe(80);
  });

  test('question・answer・subject が必須', async () => {
    const res = await request(app)
      .post('/grade')
      .send({ question: 'Q', subject: '財務会計論' });

    expect(res.status).toBe(400);
  });
});
