// server/tests/rateLimit.test.js
// レート制限実装のテスト (Issue #62)

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

const gradeBody = {
  question: 'テスト問題',
  answer: 'テスト解答',
  subject: '財務会計',
};

describe('レート制限', () => {
  describe('POST /grade (1分10回まで)', () => {
    it('制限内のリクエストは429を返さない', async () => {
      mockMessagesCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify({ score: 80, feedback: 'ok', improvements: [] }) }],
        usage: { input_tokens: 10, output_tokens: 10 },
      });

      const res = await request(app).post('/grade').send(gradeBody);
      expect(res.status).not.toBe(429);
    });

    it('11回目のリクエストで429を返す', async () => {
      const limitedApp = (() => {
        jest.resetModules();
        jest.mock('../mongodb', () => ({ connectMongo: jest.fn(), isMongoEnabled: false }));
        jest.mock('../models/Textbook', () => ({}));
        jest.mock('../models/Chunk', () => ({}));
        jest.mock('@anthropic-ai/sdk', () =>
          jest.fn().mockImplementation(() => ({
            messages: { create: jest.fn().mockResolvedValue({
              content: [{ type: 'text', text: JSON.stringify({ score: 80, feedback: 'ok', improvements: [] }) }],
              usage: { input_tokens: 10, output_tokens: 10 },
            }) },
          }))
        );
        jest.mock('openai', () =>
          jest.fn().mockImplementation(() => ({
            embeddings: { create: jest.fn() },
          }))
        );
        jest.mock('../supabase', () => ({ supabase: null, vectorSearch: jest.fn() }));
        return require('../index');
      })();

      for (let i = 0; i < 10; i++) {
        await request(limitedApp).post('/grade').send(gradeBody);
      }
      const res = await request(limitedApp).post('/grade').send(gradeBody);
      expect(res.status).toBe(429);
      expect(res.body.error).toMatch(/リクエストが多すぎます/);
    });
  });

  describe('POST /grade-compare (1分10回まで)', () => {
    it('11回目のリクエストで429を返す', async () => {
      const limitedApp = (() => {
        jest.resetModules();
        jest.mock('../mongodb', () => ({ connectMongo: jest.fn(), isMongoEnabled: false }));
        jest.mock('../models/Textbook', () => ({}));
        jest.mock('../models/Chunk', () => ({}));
        jest.mock('@anthropic-ai/sdk', () =>
          jest.fn().mockImplementation(() => ({
            messages: { create: jest.fn().mockResolvedValue({
              content: [{ type: 'text', text: JSON.stringify({ score: 80, feedback: 'ok', improvements: [] }) }],
              usage: { input_tokens: 10, output_tokens: 10 },
            }) },
          }))
        );
        jest.mock('openai', () =>
          jest.fn().mockImplementation(() => ({
            embeddings: { create: jest.fn() },
          }))
        );
        jest.mock('../supabase', () => ({ supabase: null, vectorSearch: jest.fn() }));
        return require('../index');
      })();

      const compareBody = { answerImage: 'base64data', subject: '財務会計' };
      for (let i = 0; i < 10; i++) {
        await request(limitedApp).post('/grade-compare').send(compareBody);
      }
      const res = await request(limitedApp).post('/grade-compare').send(compareBody);
      expect(res.status).toBe(429);
      expect(res.body.error).toMatch(/リクエストが多すぎます/);
    });
  });

  describe('POST /textbook/register (1時間5回まで)', () => {
    it('6回目のリクエストで429を返す', async () => {
      const limitedApp = (() => {
        jest.resetModules();
        jest.mock('../mongodb', () => ({ connectMongo: jest.fn(), isMongoEnabled: false }));
        jest.mock('../models/Textbook', () => ({}));
        jest.mock('../models/Chunk', () => ({}));
        jest.mock('@anthropic-ai/sdk', () =>
          jest.fn().mockImplementation(() => ({
            messages: { create: jest.fn() },
          }))
        );
        jest.mock('openai', () =>
          jest.fn().mockImplementation(() => ({
            embeddings: { create: jest.fn() },
          }))
        );
        jest.mock('../supabase', () => ({ supabase: null, vectorSearch: jest.fn() }));
        return require('../index');
      })();

      for (let i = 0; i < 5; i++) {
        await request(limitedApp).post('/textbook/register').send({});
      }
      const res = await request(limitedApp).post('/textbook/register').send({});
      expect(res.status).toBe(429);
      expect(res.body.error).toMatch(/リクエストが多すぎます/);
    });
  });
});
