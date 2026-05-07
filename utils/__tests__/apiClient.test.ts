import { API_BASE_URL, apiClient } from "../apiClient";

// fetch をモック
const mockFetch = jest.fn();
global.fetch = mockFetch;

// タイムアウト用 AbortController をモック
const mockAbort = jest.fn();
jest.spyOn(global, "AbortController").mockImplementation(() => ({
  abort: mockAbort,
  signal: {} as AbortSignal,
}));

// NetInfo をモック（デフォルトはオンライン）
const mockNetInfoFetch = jest.fn().mockResolvedValue({ isConnected: true });
jest.mock("@react-native-community/netinfo", () => ({
  fetch: () => mockNetInfoFetch(),
  addEventListener: jest.fn(() => jest.fn()),
}));

beforeEach(() => {
  mockFetch.mockReset();
  mockAbort.mockReset();
  mockNetInfoFetch.mockResolvedValue({ isConnected: true });
});

// --- helpers ---

function okJson(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  } as Response);
}

// ===== API_BASE_URL =====

describe("API_BASE_URL", () => {
  test("Railway の URL が設定されている", () => {
    expect(API_BASE_URL).toBe("https://studyapp-production-66d5.up.railway.app");
  });
});

// ===== オフライン時のスキップ =====

describe("オフライン時のリクエストスキップ", () => {
  test("isConnected が false のとき fetch を呼ばずにエラーを throw する", async () => {
    mockNetInfoFetch.mockResolvedValue({ isConnected: false });
    await expect(apiClient.listTextbooks()).rejects.toThrow("オフラインです。接続を確認してください");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ===== listTextbooks =====

describe("apiClient.listTextbooks", () => {
  test("books 配列を返す", async () => {
    const books = [
      { bookId: "b1", subject: "財務会計論", bookName: "テキスト", totalPages: 100, description: "", registeredAt: "2026-01-01" },
    ];
    mockFetch.mockReturnValue(okJson({ books }));

    const result = await apiClient.listTextbooks();
    expect(result).toEqual(books);
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/textbook/list`,
      expect.objectContaining({}),
    );
  });

  test("books が undefined のとき空配列を返す", async () => {
    mockFetch.mockReturnValue(okJson({}));
    const result = await apiClient.listTextbooks();
    expect(result).toEqual([]);
  });
});

// ===== deleteTextbook =====

describe("apiClient.deleteTextbook", () => {
  test("DELETE リクエストを正しい URL に送る", async () => {
    mockFetch.mockReturnValue(okJson({}));
    await apiClient.deleteTextbook("財務会計論_テキスト");
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/textbook/%E8%B2%A1%E5%8B%99%E4%BC%9A%E8%A8%88%E8%AB%96_%E3%83%86%E3%82%AD%E3%82%B9%E3%83%88`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

// ===== getChunksByPages =====

describe("apiClient.getChunksByPages", () => {
  test("text を返す", async () => {
    mockFetch.mockReturnValue(okJson({ text: "サンプルテキスト" }));
    const result = await apiClient.getChunksByPages({ bookId: "b1", fromPage: "1", toPage: "5" });
    expect(result.text).toBe("サンプルテキスト");
  });

  test("data.error があるとき throw する", async () => {
    mockFetch.mockReturnValue(okJson({ error: "NOT_FOUND" }));
    await expect(apiClient.getChunksByPages({ bookId: "b1", fromPage: "1", toPage: "5" })).rejects.toThrow("NOT_FOUND");
  });

  test("POST + JSON ヘッダーで送信される", async () => {
    mockFetch.mockReturnValue(okJson({ text: "" }));
    await apiClient.getChunksByPages({ bookId: "b1", fromPage: "2", toPage: "4" });
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/textbook/chunks-by-pages`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
});

// ===== searchTextbook =====

describe("apiClient.searchTextbook", () => {
  test("POST + JSON ヘッダーで送信される", async () => {
    mockFetch.mockReturnValue(okJson({ results: [] }));
    await apiClient.searchTextbook({ query: "減価償却", subject: "財務会計論" });
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/textbook/search`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
});

// ===== extractPdf =====

describe("apiClient.extractPdf", () => {
  test("data.error があるとき throw する", async () => {
    mockFetch.mockReturnValue(okJson({ error: "NO_TEXT" }));
    await expect(apiClient.extractPdf(new FormData())).rejects.toThrow("NO_TEXT");
  });

  test("正常レスポンスをそのまま返す", async () => {
    mockFetch.mockReturnValue(okJson({ text: "PDF本文", totalPages: 10, fromPage: 1, toPage: 10 }));
    const result = await apiClient.extractPdf(new FormData());
    expect(result.text).toBe("PDF本文");
    expect(result.totalPages).toBe(10);
  });
});

// ===== extractImage =====

describe("apiClient.extractImage", () => {
  test("data.error があるとき throw する", async () => {
    mockFetch.mockReturnValue(okJson({ error: "OCR_FAILED" }));
    await expect(apiClient.extractImage(new FormData())).rejects.toThrow("OCR_FAILED");
  });

  test("text を返す", async () => {
    mockFetch.mockReturnValue(okJson({ text: "手書きテキスト" }));
    const result = await apiClient.extractImage(new FormData());
    expect(result.text).toBe("手書きテキスト");
  });
});

// ===== grade =====

describe("apiClient.grade", () => {
  test("POST + JSON ヘッダーで送信される", async () => {
    mockFetch.mockReturnValue(okJson({ result: "良い答案です", score: 80 }));
    await apiClient.grade({
      question: "問題", answer: "答案", subject: "財務会計論",
      userId: "u1", bookIds: [], questionImages: [], answerImages: [],
    });
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/grade`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
});

// ===== chat =====

describe("apiClient.chat", () => {
  test("reply を返す", async () => {
    mockFetch.mockReturnValue(okJson({ reply: "AIの返答" }));
    const result = await apiClient.chat({
      messages: [{ role: "user", content: "質問" }],
      subject: "財務会計論",
      context: "採点結果",
    });
    expect(result.reply).toBe("AIの返答");
  });
});

// ===== gradeCompare =====

describe("apiClient.gradeCompare", () => {
  test("data.error があるとき throw する", async () => {
    mockFetch.mockReturnValue(okJson({ error: "INVALID_IMAGE" }));
    await expect(
      apiClient.gradeCompare({ answerImages: [], modelAnswerImages: [], promptTips: [], userId: "u1", subject: "監査論" })
    ).rejects.toThrow("INVALID_IMAGE");
  });

  test("score と feedbacks を返す", async () => {
    const body = { score: 75, passed: true, fatalErrors: 0, missingProcess: false, feedbacks: [], answerSteps: {}, modelSteps: {} };
    mockFetch.mockReturnValue(okJson(body));
    const result = await apiClient.gradeCompare({ answerImages: ["b64"], modelAnswerImages: ["b64"], promptTips: [], userId: "u1", subject: "監査論" });
    expect(result.score).toBe(75);
  });
});

// ===== getCompareEvalStatus =====

describe("apiClient.getCompareEvalStatus", () => {
  test("正しい URL に GET リクエストを送る", async () => {
    mockFetch.mockReturnValue(okJson({ status: "done", evalScore: 85 }));
    const result = await apiClient.getCompareEvalStatus("job123");
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/grade-compare/eval-status/job123`,
      expect.objectContaining({}),
    );
    expect(result.evalScore).toBe(85);
  });
});

// ===== registerTextbook =====

describe("apiClient.registerTextbook", () => {
  test("data.error があるとき throw する", async () => {
    mockFetch.mockReturnValue(okJson({ error: "PDF_TOO_LARGE" }));
    await expect(apiClient.registerTextbook(new FormData())).rejects.toThrow("PDF_TOO_LARGE");
  });

  test("jobId を返す", async () => {
    mockFetch.mockReturnValue(okJson({ jobId: "job456" }));
    const result = await apiClient.registerTextbook(new FormData());
    expect(result.jobId).toBe("job456");
  });
});

// ===== pollRegisterStatus =====

describe("apiClient.pollRegisterStatus", () => {
  test("ステータスオブジェクトを返す", async () => {
    mockFetch.mockReturnValue(okJson({ status: "done" }));
    const result = await apiClient.pollRegisterStatus("job789");
    expect(result.status).toBe("done");
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/textbook/register/status/job789`,
      expect.objectContaining({}),
    );
  });

  test("null レスポンスのとき throw する", async () => {
    mockFetch.mockReturnValue(okJson(null));
    await expect(apiClient.pollRegisterStatus("job000")).rejects.toThrow("ジョブが見つかりません。");
  });
});
