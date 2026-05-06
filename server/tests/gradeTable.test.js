// server/tests/gradeTable.test.js
// 図表・仕訳表の採点基準プロンプト追加 (Issue #26)

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
});

// ============================================================
// POST /grade — 図表・仕訳表採点基準
// ============================================================
describe('POST /grade — 図表・仕訳表採点基準', () => {
  const gradeResponse = {
    content: [{
      text: '【得点率】70%\n【論点】仕訳, 勘定科目\n【誤答論点】金額誤り\n【解説まとめ】勘定科目は正しいが金額に誤りがある。',
    }],
  };

  test('プロンプトに仕訳表部分点基準（勘定科目正しく金額誤り→70%）が含まれる', async () => {
    mockMessagesCreate.mockResolvedValueOnce(gradeResponse);

    await request(app).post('/grade').send({
      question: '以下の取引を仕訳しなさい。',
      answer: '（借方）現金 100,000 （貸方）売上 90,000',
      subject: '財務会計論',
    });

    const calledContent = mockMessagesCreate.mock.calls[0][0].messages[0].content;
    const promptText = Array.isArray(calledContent)
      ? calledContent.map(c => c.text || '').join('')
      : calledContent;
    expect(promptText).toContain('勘定科目が正しく金額のみ異なる場合は70%相当');
  });

  test('プロンプトにT字勘定・B/S・P/L部分点基準が含まれる', async () => {
    mockMessagesCreate.mockResolvedValueOnce(gradeResponse);

    await request(app).post('/grade').send({
      question: 'T字勘定を作成しなさい。',
      answer: '借方 100 | 貸方 90',
      subject: '財務会計論',
    });

    const calledContent = mockMessagesCreate.mock.calls[0][0].messages[0].content;
    const promptText = Array.isArray(calledContent)
      ? calledContent.map(c => c.text || '').join('')
      : calledContent;
    expect(promptText).toContain('T字勘定・B/S・P/L');
    expect(promptText).toContain('60〜70%相当');
  });

  test('プロンプトに手書き図表読み取り指示が含まれる', async () => {
    mockMessagesCreate.mockResolvedValueOnce(gradeResponse);

    await request(app).post('/grade').send({
      question: 'グラフを作成しなさい。',
      answer: '折れ線グラフ',
      subject: '財務会計論',
    });

    const calledContent = mockMessagesCreate.mock.calls[0][0].messages[0].content;
    const promptText = Array.isArray(calledContent)
      ? calledContent.map(c => c.text || '').join('')
      : calledContent;
    expect(promptText).toContain('不鮮明な箇所は受験生に有利に解釈する');
  });
});

// ============================================================
// POST /grade-compare — 図表・仕訳表採点基準 + 図表形式ミスtype
// ============================================================
describe('POST /grade-compare — 図表・仕訳表採点基準', () => {
  const ocrResponse = {
    content: [{ text: '（借方）現金 100,000 （貸方）売上 90,000' }],
  };

  const gradeToolResponse = {
    stop_reason: 'tool_use',
    content: [{
      type: 'tool_use',
      name: 'grade_answer',
      input: {
        score: 70,
        passed: false,
        fatalErrors: 0,
        missingProcess: false,
        answerSteps: {
          issueRecognition: '仕訳問題',
          premise: '現金受領',
          logic: '借方現金・貸方売上',
          conclusion: '70点',
        },
        modelSteps: {
          issueRecognition: '仕訳問題',
          premise: '現金受領',
          logic: '借方現金100,000・貸方売上100,000',
          conclusion: '満点',
        },
        feedbacks: [{
          priority: 1,
          type: '図表形式ミス',
          point: '仕訳表の貸方金額が90,000と誤っています。正しくは100,000です。勘定科目は正しいため部分点（70点）を付与しました。',
          color: 'yellow',
        }],
      },
    }],
  };

  const evalToolResponse = {
    content: [{
      type: 'tool_use',
      name: 'evaluate_grade',
      input: { score: 80, improvements: [] },
    }],
  };

  // modelAnswerText提供時はmodelOCRはPromise.resolve(null)でmockを消費しない
  // よって mockMessagesCreate の順序: 1=answerOcr, 2=grade_answer, 3=evaluate_grade

  test('図表形式ミス typeがfeedbacksに含まれていても正常にレスポンスを返す', async () => {
    mockMessagesCreate
      .mockResolvedValueOnce(ocrResponse)
      .mockResolvedValueOnce(gradeToolResponse)
      .mockResolvedValueOnce(evalToolResponse);

    const res = await request(app).post('/grade-compare').send({
      answerImages: ['aGVsbG8='],
      modelAnswerText: '（借方）現金 100,000 （貸方）売上 100,000',
      subject: '財務会計論',
    });

    expect(res.status).toBe(200);
    expect(res.body.feedbacks[0].type).toBe('図表形式ミス');
    expect(res.body.score).toBe(70);
  });

  test('grade-compareプロンプトに仕訳表採点基準（借方・貸方科目正しく金額誤り→70点）が含まれる', async () => {
    mockMessagesCreate
      .mockResolvedValueOnce(ocrResponse)
      .mockResolvedValueOnce(gradeToolResponse)
      .mockResolvedValueOnce(evalToolResponse);

    await request(app).post('/grade-compare').send({
      answerImages: ['aGVsbG8='],
      modelAnswerText: '（借方）現金 100,000 （貸方）売上 100,000',
      subject: '財務会計論',
    });

    const gradeCall = mockMessagesCreate.mock.calls.find(
      call => call[0]?.tools?.[0]?.name === 'grade_answer'
    );
    expect(gradeCall).toBeDefined();
    const promptContent = gradeCall[0].messages[0].content;
    expect(promptContent).toContain('借方・貸方の勘定科目が正しく金額のみ異なる場合');
    expect(promptContent).toContain('70点相当の部分点');
  });

  test('grade-compareプロンプトに図表形式ミスtype指示が含まれる', async () => {
    mockMessagesCreate
      .mockResolvedValueOnce(ocrResponse)
      .mockResolvedValueOnce(gradeToolResponse)
      .mockResolvedValueOnce(evalToolResponse);

    await request(app).post('/grade-compare').send({
      answerImages: ['aGVsbG8='],
      modelAnswerText: '（借方）現金 100,000 （貸方）売上 100,000',
      subject: '財務会計論',
    });

    const gradeCall = mockMessagesCreate.mock.calls.find(
      call => call[0]?.tools?.[0]?.name === 'grade_answer'
    );
    expect(gradeCall).toBeDefined();
    const promptContent = gradeCall[0].messages[0].content;
    expect(promptContent).toContain('図表形式ミス');
  });

  test('grade-compareのGRADE_TOOLが図表形式ミスtypeを受け付ける', async () => {
    mockMessagesCreate
      .mockResolvedValueOnce(ocrResponse)
      .mockResolvedValueOnce(gradeToolResponse)
      .mockResolvedValueOnce(evalToolResponse);

    await request(app).post('/grade-compare').send({
      answerImages: ['aGVsbG8='],
      modelAnswerText: '模範解答',
      subject: '財務会計論',
    });

    const gradeCall = mockMessagesCreate.mock.calls.find(
      call => call[0]?.tools?.[0]?.name === 'grade_answer'
    );
    expect(gradeCall).toBeDefined();
    const typeEnum = gradeCall[0].tools[0].input_schema.properties.feedbacks.items.properties.type.enum;
    expect(typeEnum).toContain('図表形式ミス');
  });
});
