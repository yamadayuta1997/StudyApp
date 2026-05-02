// server/tests/backup.test.js
// バックアップ・リストアエンドポイントのテスト

// モデルモック（mongoose の実接続なし）
jest.mock('../mongodb', () => ({ connectMongo: jest.fn(), isMongoEnabled: true }));

const mockTextbooks = [
  {
    textbookId: '財務会計論_2024年テキスト',
    title: '2024年テキスト',
    subject: '財務会計論',
    pages: [{ pageNum: 1, text: 'サンプルテキスト', isImage: false }],
    totalPages: 1,
    diagramPageNums: [],
    createdAt: new Date('2024-01-01').toISOString(),
  },
];
const mockChunks = [
  {
    textbookId: '財務会計論_2024年テキスト',
    subject: '財務会計論',
    content: 'サンプルテキスト',
    pageNum: 1,
    embedding: [],
    isImage: false,
  },
];

const mockTextbookModel = {
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
};
const mockChunkModel = {
  find: jest.fn(),
  deleteMany: jest.fn(),
  insertMany: jest.fn(),
};

jest.mock('../models/Textbook', () => mockTextbookModel);
jest.mock('../models/Chunk',    () => mockChunkModel);

const request = require('supertest');
const app     = require('../index');

beforeEach(() => {
  jest.clearAllMocks();
});

// ---- Export ----
describe('GET /backup/export', () => {
  test('Textbook と Chunk を含む JSON を返す', async () => {
    mockTextbookModel.find.mockReturnValue({ lean: () => Promise.resolve(mockTextbooks) });
    mockChunkModel.find.mockReturnValue({ lean: () => Promise.resolve(mockChunks) });

    const res = await request(app).get('/backup/export');

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(res.body.textbooks).toHaveLength(1);
    expect(res.body.chunks).toHaveLength(1);
    expect(res.body.exportedAt).toBeDefined();
    expect(res.headers['content-disposition']).toMatch(/attachment/);
  });

  test('MongoDB エラー時は 500 を返す', async () => {
    mockTextbookModel.find.mockReturnValue({ lean: () => Promise.reject(new Error('DB down')) });
    mockChunkModel.find.mockReturnValue({ lean: () => Promise.resolve([]) });

    const res = await request(app).get('/backup/export');
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});

// ---- Import ----
describe('POST /backup/import', () => {
  test('正常なデータを upsert・insertMany する', async () => {
    mockTextbookModel.findOneAndUpdate.mockResolvedValue({});
    mockChunkModel.deleteMany.mockResolvedValue({});
    mockChunkModel.insertMany.mockResolvedValue([]);

    const payload = { textbooks: mockTextbooks, chunks: mockChunks };
    const res = await request(app).post('/backup/import').send(payload);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.restored.textbooks).toBe(1);
    expect(res.body.restored.chunks).toBe(1);
    expect(mockTextbookModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mockChunkModel.deleteMany).toHaveBeenCalledWith({ textbookId: '財務会計論_2024年テキスト' });
    expect(mockChunkModel.insertMany).toHaveBeenCalledTimes(1);
  });

  test('textbooks が配列でない場合は 400 を返す', async () => {
    const res = await request(app)
      .post('/backup/import')
      .send({ textbooks: 'invalid', chunks: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/配列/);
  });

  test('chunks が配列でない場合は 400 を返す', async () => {
    const res = await request(app)
      .post('/backup/import')
      .send({ textbooks: [], chunks: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/配列/);
  });

  test('空のペイロードでも正常に処理する', async () => {
    mockTextbookModel.findOneAndUpdate.mockResolvedValue({});
    mockChunkModel.deleteMany.mockResolvedValue({});
    mockChunkModel.insertMany.mockResolvedValue([]);

    const res = await request(app).post('/backup/import').send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.restored.textbooks).toBe(0);
    expect(res.body.restored.chunks).toBe(0);
    expect(mockChunkModel.insertMany).not.toHaveBeenCalled();
  });
});
