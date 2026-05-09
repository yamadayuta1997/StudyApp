import NetInfo from '@react-native-community/netinfo';

export const API_BASE_URL = "https://studyapp-production-66d5.up.railway.app";

export type TextbookMeta = {
  bookId: string;
  subject: string;
  bookName: string;
  totalPages: number;
  description: string;
  registeredAt: string;
};

type ChatMessage = { role: "user" | "assistant"; content: string };

async function apiFetch<T>(
  path: string,
  options?: RequestInit,
  timeoutMs?: number,
): Promise<T> {
  const netState = await NetInfo.fetch();
  if (!netState.isConnected) {
    throw new Error('オフラインです。接続を確認してください');
  }

  let controller: AbortController | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  if (timeoutMs != null) {
    controller = new AbortController();
    timeoutId = setTimeout(() => controller!.abort(), timeoutMs);
  }

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      ...(controller ? { signal: controller.signal } : {}),
    });
    return (await res.json()) as T;
  } finally {
    if (timeoutId != null) clearTimeout(timeoutId);
  }
}

export const apiClient = {
  async listTextbooks(): Promise<TextbookMeta[]> {
    const data = await apiFetch<{ books?: TextbookMeta[] }>("/textbook/list");
    return data.books ?? [];
  },

  async deleteTextbook(bookId: string): Promise<void> {
    await apiFetch(`/textbook/${encodeURIComponent(bookId)}`, { method: "DELETE" });
  },

  async registerTextbook(formData: FormData): Promise<any> {
    const data = await apiFetch<any>("/textbook/register", {
      method: "POST",
      body: formData,
    }, 60000);
    return data;
  },

  async pollRegisterStatus(jobId: string): Promise<any> {
    const data = await apiFetch<any>(`/textbook/register/status/${jobId}`);
    if (!data) throw new Error("ジョブが見つかりません。");
    return data;
  },

  async getChunksByPages(params: { bookId: string; fromPage: string; toPage: string }): Promise<{ text: string }> {
    const data = await apiFetch<any>("/textbook/chunks-by-pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (data.error) throw new Error(data.error);
    return data;
  },

  async searchTextbook(params: { query: string; subject: string }): Promise<any> {
    return apiFetch("/textbook/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  },

  async extractPdf(formData: FormData): Promise<any> {
    const data = await apiFetch<any>("/extract-pdf", {
      method: "POST",
      body: formData,
    }, 30000);
    if (data.error) throw new Error(data.error);
    return data;
  },

  async extractImage(formData: FormData): Promise<{ text: string }> {
    const data = await apiFetch<any>("/extract-image", {
      method: "POST",
      body: formData,
    });
    if (data.error) throw new Error(data.error);
    return data;
  },

  async grade(body: {
    question: string;
    answer: string;
    subject: string;
    userId: string;
    bookIds: string[];
    questionImages?: string[];
    answerImages?: string[];
    sourceBookId?: string;
    sourceFromPage?: string;
    sourceToPage?: string;
  }): Promise<any> {
    return apiFetch("/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async chat(body: {
    messages: ChatMessage[];
    subject: string;
    context: string;
  }): Promise<{ reply: string }> {
    return apiFetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async gradeCompare(body: {
    answerImages: string[];
    modelAnswerImages: string[];
    promptTips: string[];
    userId: string;
    subject: string;
  }): Promise<any> {
    const data = await apiFetch<any>("/grade-compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, 90000);
    if (data.error) throw new Error(data.error);
    return data;
  },

  async getCompareEvalStatus(jobId: string): Promise<any> {
    return apiFetch(`/grade-compare/eval-status/${jobId}`);
  },
};
