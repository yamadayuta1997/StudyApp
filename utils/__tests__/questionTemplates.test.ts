jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadTemplates, saveTemplate, deleteTemplate, MAX_TEMPLATES, TEMPLATE_STORAGE_KEY } from '../questionTemplates';

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('loadTemplates', () => {
  test('保存済みテンプレートを返す', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify(['テンプレート1', 'テンプレート2']));
    const result = await loadTemplates();
    expect(result).toEqual(['テンプレート1', 'テンプレート2']);
  });

  test('ストレージが空の場合は空配列を返す', async () => {
    mockGetItem.mockResolvedValue(null);
    const result = await loadTemplates();
    expect(result).toEqual([]);
  });

  test('ストレージエラー時は空配列を返す', async () => {
    mockGetItem.mockRejectedValue(new Error('storage error'));
    const result = await loadTemplates();
    expect(result).toEqual([]);
  });
});

describe('saveTemplate', () => {
  test('新しいテンプレートを先頭に追加して保存する', async () => {
    mockSetItem.mockResolvedValue(undefined);
    const { templates, error } = await saveTemplate(['既存テンプレート'], '新しい問題文');
    expect(error).toBeUndefined();
    expect(templates[0]).toBe('新しい問題文');
    expect(templates[1]).toBe('既存テンプレート');
    expect(mockSetItem).toHaveBeenCalledWith(TEMPLATE_STORAGE_KEY, JSON.stringify(['新しい問題文', '既存テンプレート']));
  });

  test('空文字はエラーを返す', async () => {
    const { templates, error } = await saveTemplate([], '   ');
    expect(error).toBe('テンプレートが空です。');
    expect(templates).toEqual([]);
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  test('重複テンプレートはエラーを返す', async () => {
    const { templates, error } = await saveTemplate(['同じ問題文'], '同じ問題文');
    expect(error).toBe('すでに同じテンプレートが保存されています。');
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  test(`最大${MAX_TEMPLATES}件を超える場合はエラーを返す`, async () => {
    const full = Array.from({ length: MAX_TEMPLATES }, (_, i) => `テンプレート${i + 1}`);
    const { templates, error } = await saveTemplate(full, '新テンプレート');
    expect(error).toContain(`${MAX_TEMPLATES}件`);
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  test('前後の空白をトリムして保存する', async () => {
    mockSetItem.mockResolvedValue(undefined);
    const { templates } = await saveTemplate([], '  問題文  ');
    expect(templates[0]).toBe('問題文');
  });
});

describe('deleteTemplate', () => {
  test('指定インデックスのテンプレートを削除する', async () => {
    mockSetItem.mockResolvedValue(undefined);
    const result = await deleteTemplate(['A', 'B', 'C'], 1);
    expect(result).toEqual(['A', 'C']);
    expect(mockSetItem).toHaveBeenCalledWith(TEMPLATE_STORAGE_KEY, JSON.stringify(['A', 'C']));
  });

  test('先頭を削除できる', async () => {
    mockSetItem.mockResolvedValue(undefined);
    const result = await deleteTemplate(['A', 'B', 'C'], 0);
    expect(result).toEqual(['B', 'C']);
  });

  test('末尾を削除できる', async () => {
    mockSetItem.mockResolvedValue(undefined);
    const result = await deleteTemplate(['A', 'B', 'C'], 2);
    expect(result).toEqual(['A', 'B']);
  });

  test('1件のみの場合に削除すると空配列になる', async () => {
    mockSetItem.mockResolvedValue(undefined);
    const result = await deleteTemplate(['A'], 0);
    expect(result).toEqual([]);
  });
});
