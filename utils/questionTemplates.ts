import AsyncStorage from "@react-native-async-storage/async-storage";

export const TEMPLATE_STORAGE_KEY = "questionTemplates";
export const MAX_TEMPLATES = 10;

export async function loadTemplates(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(TEMPLATE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveTemplate(templates: string[], newTemplate: string): Promise<{ templates: string[]; error?: string }> {
  const trimmed = newTemplate.trim();
  if (!trimmed) return { templates, error: "テンプレートが空です。" };
  if (templates.includes(trimmed)) return { templates, error: "すでに同じテンプレートが保存されています。" };
  if (templates.length >= MAX_TEMPLATES) return { templates, error: `テンプレートは最大${MAX_TEMPLATES}件まで保存できます。` };
  const next = [trimmed, ...templates];
  await AsyncStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next));
  return { templates: next };
}

export async function deleteTemplate(templates: string[], index: number): Promise<string[]> {
  const next = templates.filter((_, i) => i !== index);
  await AsyncStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next));
  return next;
}
