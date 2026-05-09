// server/tests/textbookCache.test.js
// loadTextbookCache のデータ整合性チェックテスト

const fs = require('fs');
const path = require('path');
const os = require('os');

jest.mock('../mongodb', () => ({ connectMongo: jest.fn(), isMongoEnabled: false }));
jest.mock('../models/Textbook', () => ({}));
jest.mock('../models/Chunk', () => ({}));

describe('loadTextbookCache', () => {
  let tmpDir;
  let origEnv;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studyapp-test-'));
    origEnv = process.env.DATA_DIR;
    process.env.DATA_DIR = tmpDir;
    jest.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (origEnv === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = origEnv;
    }
    jest.resetModules();
  });

  test('正常なJSONを読み込んでキャッシュを構築する', async () => {
    const textbooksFile = path.join(tmpDir, 'textbooks.json');
    const entries = [['book1', { subject: '財務会計論', bookName: 'テスト' }]];
    fs.writeFileSync(textbooksFile, JSON.stringify(entries));

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    require('../index');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1 entries'));
    consoleSpy.mockRestore();
  });

  test('ファイルが存在しない場合は空Mapで起動する', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    require('../index');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('0 entries'));
    consoleSpy.mockRestore();
  });

  test('破損JSONの場合は.bakにリネームして空Mapで継続する', () => {
    const textbooksFile = path.join(tmpDir, 'textbooks.json');
    fs.writeFileSync(textbooksFile, 'NOT_VALID_JSON{{{');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    require('../index');

    const bakFile = textbooksFile + '.bak';
    expect(fs.existsSync(bakFile)).toBe(true);
    expect(fs.existsSync(textbooksFile)).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('.bak'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('0 entries'));

    warnSpy.mockRestore();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  test('破損JSON時にサーバーがクラッシュしない', () => {
    const textbooksFile = path.join(tmpDir, 'textbooks.json');
    fs.writeFileSync(textbooksFile, '{invalid');

    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});

    expect(() => require('../index')).not.toThrow();

    jest.restoreAllMocks();
  });
});
