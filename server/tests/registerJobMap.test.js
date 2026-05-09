// server/tests/registerJobMap.test.js
jest.mock('../mongodb', () => ({ connectMongo: jest.fn(), isMongoEnabled: false }));

const { registerJobMap, pruneRegisterJobMap, REGISTER_JOB_MAX } = require('../index');
const request = require('supertest');
const app = require('../index');

beforeEach(() => {
  registerJobMap.clear();
});

describe('pruneRegisterJobMap', () => {
  test('上限以下のときはジョブを削除しない', () => {
    for (let i = 0; i < REGISTER_JOB_MAX; i++) {
      registerJobMap.set(`job_${i}`, { status: 'done' });
    }
    pruneRegisterJobMap();
    expect(registerJobMap.size).toBe(REGISTER_JOB_MAX);
  });

  test('上限+1件のとき最古の1件を削除する', () => {
    for (let i = 0; i < REGISTER_JOB_MAX + 1; i++) {
      registerJobMap.set(`job_${i}`, { status: 'done' });
    }
    pruneRegisterJobMap();
    expect(registerJobMap.size).toBe(REGISTER_JOB_MAX);
    expect(registerJobMap.has('job_0')).toBe(false);
    expect(registerJobMap.has(`job_${REGISTER_JOB_MAX}`)).toBe(true);
  });

  test('上限を大幅に超えた場合も上限件数まで削除する', () => {
    for (let i = 0; i < REGISTER_JOB_MAX + 50; i++) {
      registerJobMap.set(`job_${i}`, { status: 'done' });
    }
    pruneRegisterJobMap();
    expect(registerJobMap.size).toBe(REGISTER_JOB_MAX);
    for (let i = 0; i < 50; i++) {
      expect(registerJobMap.has(`job_${i}`)).toBe(false);
    }
    expect(registerJobMap.has(`job_${REGISTER_JOB_MAX + 49}`)).toBe(true);
  });
});

describe('GET /textbook/register/status/:jobId', () => {
  test('存在するジョブは 200 を返す', async () => {
    registerJobMap.set('existing_job', { status: 'done', phase: 'done' });
    const res = await request(app).get('/textbook/register/status/existing_job');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
  });

  test('存在しないジョブは 404 を返す', async () => {
    const res = await request(app).get('/textbook/register/status/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  test('pruneRegisterJobMap 後に削除されたジョブは 404 を返す', async () => {
    for (let i = 0; i < REGISTER_JOB_MAX + 1; i++) {
      registerJobMap.set(`job_${i}`, { status: 'done' });
    }
    pruneRegisterJobMap();

    const res = await request(app).get('/textbook/register/status/job_0');
    expect(res.status).toBe(404);
  });
});
