const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---- Textbook cache with Volume persistence ----
const DATA_DIR = process.env.DATA_DIR || "/app/data";
const TEXTBOOKS_FILE = path.join(DATA_DIR, "textbooks.json");

// Ensure data directory exists at startup
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) {
  console.error("DATA_DIR create error (non-fatal):", e.message);
}

let textbookCache = new Map();

function loadTextbookCache() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(TEXTBOOKS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TEXTBOOKS_FILE, "utf8"));
      textbookCache = new Map(Array.isArray(data) ? data : []);
    }
  } catch (e) {
    console.error("textbook cache load error:", e.message);
    textbookCache = new Map();
  }
}

function saveTextbookCache() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(TEXTBOOKS_FILE, JSON.stringify([...textbookCache]));
  } catch (e) {
    console.error("textbook cache save error:", e.message);
  }
}

loadTextbookCache();

// ---- pdfjs cache ----
let _pdfjsLib = null;
async function getPdfjsLib() {
  if (!_pdfjsLib) {
    _pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    _pdfjsLib.GlobalWorkerOptions.workerSrc = "";
  }
  return _pdfjsLib;
}

// ---- Health ----
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ---- Textbook: Register ----
app.post("/textbook/register", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "PDFファイルが必要です。" });
    const { subject, bookName, description = "" } = req.body;
    if (!subject || !bookName) return res.status(400).json({ error: "subject・bookName は必須です。" });

    const pdfjsLib = await getPdfjsLib();
    let pdfDocument;
    try {
      pdfDocument = await pdfjsLib.getDocument({
        data: new Uint8Array(req.file.buffer),
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
      }).promise;
    } catch (e) {
      return res.status(400).json({ error: `PDF解析失敗: ${e.message}`, code: "PARSE_ERROR" });
    }

    const totalPages = pdfDocument.numPages;
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const text = textContent.items.filter(item => "str" in item).map(item => item.str).join(" ").trim();
      if (text) pages.push({ pageNum: i, text });
    }

    const bookId = `${subject}_${bookName}`;
    textbookCache.set(bookId, { subject, bookName, description, pages, registeredAt: new Date().toISOString() });
    saveTextbookCache();

    res.json({ ok: true, bookId, totalPages, subject, bookName });
  } catch (e) {
    console.error("/textbook/register error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ---- Textbook: List ----
app.get("/textbook/list", (req, res) => {
  const books = [];
  for (const [bookId, book] of textbookCache.entries()) {
    books.push({
      bookId,
      subject: book.subject,
      bookName: book.bookName,
      description: book.description,
      totalPages: book.pages.length,
      registeredAt: book.registeredAt,
    });
  }
  res.json({ books });
});

// ---- Textbook: Delete ----
app.delete("/textbook/:bookId", (req, res) => {
  const bookId = decodeURIComponent(req.params.bookId);
  if (!textbookCache.has(bookId)) return res.status(404).json({ error: "教科書が見つかりません。" });
  textbookCache.delete(bookId);
  saveTextbookCache();
  res.json({ ok: true });
});

// ---- Textbook: Search ----
app.post("/textbook/search", (req, res) => {
  try {
    const { query, subject } = req.body;
    if (!query) return res.status(400).json({ error: "query は必須です。" });

    const results = [];
    for (const [bookId, book] of textbookCache.entries()) {
      if (subject && book.subject !== subject) continue;
      for (const page of book.pages) {
        const idx = page.text.indexOf(query);
        if (idx !== -1) {
          const start = Math.max(0, idx - 100);
          const end = Math.min(page.text.length, idx + query.length + 100);
          results.push({
            bookId,
            bookName: book.bookName,
            subject: book.subject,
            pageNum: page.pageNum,
            excerpt: page.text.slice(start, end),
          });
          if (results.length >= 10) break;
        }
      }
      if (results.length >= 10) break;
    }
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Grade ----
app.post("/grade", async (req, res) => {
  try {
    const { question, answer, subject, bookIds = [], answerImages = [] } = req.body;
    if (!question || !answer || !subject) {
      return res.status(400).json({ error: "question・answer・subject は必須です。" });
    }

    // Build textbook context
    let bookContext = "";
    for (const bookId of bookIds) {
      const book = textbookCache.get(bookId);
      if (book) {
        for (const page of book.pages) {
          bookContext += `【参考教材】\n${book.bookName} p.${page.pageNum}:\n${page.text}\n\n`;
        }
      }
    }

    const userContent = [];
    if (bookContext) {
      userContent.push({ type: "text", text: `${bookContext}\n---\n` });
    }
    for (const imgBase64 of answerImages) {
      userContent.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: imgBase64 } });
    }

    const promptText = `あなたは公認会計士試験の採点官です。科目は「${subject}」です。以下の問題と答案を採点してください。\n\n【問題】\n${question}\n\n【答案】\n${answer}\n\n${answerImages.length > 0 ? "答案に画像・図が含まれています。その内容も採点対象にしてください。図の正確性・凡例・単位なども評価してください。\n\n" : ""}正誤判定と改善点を丁寧に説明してください。採点・フィードバック後、以下を必ず記載:\n【得点率】XX%\n【論点】論点名1, 論点名2（主要論点を3つ以内でカンマ区切り）\n【誤答論点】論点名（間違えた論点。完答なら「なし」）\n${bookIds.length > 0 ? "【参考ページ】教科書名 p.XX（参照教材の中で関連するページがあれば・複数可）\n" : ""}【解説まとめ】この問題で押さえるべきポイントを3行以内で`;

    userContent.push({ type: "text", text: promptText });

    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      messages: [{ role: "user", content: userContent }],
    });
    const resultText = message.content[0].text;

    const scoreMatch = resultText.match(/【得点率】(\d+)%/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : null;
    const topicsMatch = resultText.match(/【論点】(.+)/);
    const wrongMatch = resultText.match(/【誤答論点】(.+)/);
    const refMatchAll = resultText.match(/【参考ページ】(.+)/g);
    const summaryMatch = resultText.match(/【解説まとめ】([\s\S]+?)(?=【|$)/);

    const topics = topicsMatch ? topicsMatch[1].split(",").map(s => s.trim()).filter(Boolean) : [];
    const wrongTopics = wrongMatch && wrongMatch[1].trim() !== "なし"
      ? wrongMatch[1].split(",").map(s => s.trim()).filter(Boolean) : [];
    const refPages = refMatchAll ? refMatchAll.map(m => m.replace("【参考ページ】", "").trim()) : [];
    const summary = summaryMatch ? summaryMatch[1].trim() : "";

    res.json({ result: resultText, score, topics, wrongTopics, refPages, summary });
  } catch (e) {
    console.error("/grade error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ---- Extract PDF ----
app.post("/extract-pdf", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "PDFファイルを受信できませんでした。", code: "NO_FILE" });
    }
    const fromPage = Math.max(1, parseInt(req.body.fromPage) || 1);
    const toPageReq = parseInt(req.body.toPage) || null;
    const pdfjsLib = await getPdfjsLib();
    let pdfDocument;
    try {
      pdfDocument = await pdfjsLib.getDocument({
        data: new Uint8Array(req.file.buffer),
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
      }).promise;
    } catch (pdfErr) {
      return res.status(400).json({
        error: `PDFの解析に失敗しました: ${pdfErr.message}。パスワード保護PDFは読み込めません。`,
        code: "PARSE_ERROR",
      });
    }
    const totalPages = pdfDocument.numPages;
    if (fromPage > totalPages) {
      return res.status(400).json({
        error: `開始ページ(${fromPage})がPDFの総ページ数(${totalPages})を超えています。`,
        code: "PAGE_OUT_OF_RANGE",
      });
    }
    const endPage = toPageReq ? Math.min(toPageReq, totalPages) : totalPages;
    let fullText = "";
    const imagePages = [];

    for (let i = fromPage; i <= endPage; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.filter(item => "str" in item).map(item => item.str).join(" ").trim();

      let pageOutput = pageText;
      let hasImages = false;

      try {
        const ops = await page.getOperatorList();
        const imgOps = [pdfjsLib.OPS?.paintImageXObject, pdfjsLib.OPS?.paintInlineImageXObject].filter(Boolean);
        hasImages = imgOps.length > 0 && ops.fnArray.some(fn => imgOps.includes(fn));
      } catch {}

      if (hasImages) {
        pageOutput += "\n【このページには図・画像が含まれています】";
        imagePages.push(i);
      } else if (pageText.length < 100) {
        imagePages.push(i);
      }

      if (pageOutput.trim()) fullText += `--- ${i}ページ ---\n${pageOutput}\n\n`;
    }

    if (!fullText.trim()) {
      return res.status(400).json({
        error: "PDFからテキストを抽出できませんでした。スキャン画像型PDFの場合は「カメラで撮影」機能をご利用ください。",
        code: "NO_TEXT",
      });
    }
    res.json({ text: fullText, totalPages, fromPage, toPage: endPage, imagePages });
  } catch (e) {
    console.error("/extract-pdf error:", e.message);
    res.status(500).json({ error: `サーバーエラー: ${e.message}`, code: "SERVER_ERROR" });
  }
});

// ---- Extract PDF Image (single page OCR via vision) ----
app.post("/extract-pdf-image", upload.single("pdf"), async (req, res) => {
  const pageNum = parseInt(req.body?.pageNum) || 1;
  try {
    if (!req.file) return res.status(400).json({ error: "PDFファイルが必要です。" });

    let canvasLib = null;
    try { canvasLib = require("canvas"); } catch {}

    if (!canvasLib) {
      return res.json({
        text: `【ページ${pageNum} - 画像レンダリング非対応】テキスト抽出のみ対応しています。`,
        pageNum,
      });
    }

    const pdfjsLib = await getPdfjsLib();
    const pdfDocument = await pdfjsLib.getDocument({
      data: new Uint8Array(req.file.buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;

    const page = await pdfDocument.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = canvasLib.createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext("2d");
    await page.render({ canvasContext: context, viewport }).promise;

    const imageBase64 = canvas.toBuffer("image/jpeg").toString("base64");
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
          { type: "text", text: "この画像を最高精度でOCRしてください。手書き・印刷・数式・表・図説明をすべて転写。余分な説明は不要です。" },
        ],
      }],
    });
    res.json({ text: message.content[0].text, pageNum });
  } catch (e) {
    console.error("/extract-pdf-image error:", e.message);
    res.json({ text: `【ページ${pageNum} - レンダリング失敗: ${e.message}】`, pageNum });
  }
});

// ---- Extract Image (OCR) ----
app.post("/extract-image", upload.single("image"), async (req, res) => {
  console.log("[extract-image] content-type:", req.headers["content-type"]);
  console.log("[extract-image] req.file:", req.file ? { fieldname: req.file.fieldname, originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size } : "MISSING");
  try {
    if (!req.file) {
      console.log("[extract-image] body keys:", Object.keys(req.body));
      return res.status(400).json({ error: "画像ファイルを受信できませんでした。", code: "NO_FILE" });
    }
    const imageBase64 = req.file.buffer.toString("base64");
    const mediaType = req.file.mimetype || "image/jpeg";
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          {
            type: "text",
            text: "この画像を最高精度でOCRしてください。\n・手書き文字・印刷文字・数式・記号・表・図のキャプションをすべて転写\n・数式はそのままの形で転写（例: ∑, ≦, →, ÷）\n・表は｜で区切って構造を保持\n・図・グラフが含まれる場合は【図説明】として内容を言語化\n・ページ番号・ヘッダー・フッターも含める\n・不鮮明な箇所は【不明】と記載\n余分な説明は不要です。転写結果のみ出力してください。",
          },
        ],
      }],
    });
    res.json({ text: message.content[0].text });
  } catch (e) {
    console.error("/extract-image error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ---- Study Tip ----
app.post("/study-tip", async (req, res) => {
  try {
    const { subject, avgScore } = req.body;
    const scoreContext = avgScore !== null && avgScore !== undefined
      ? `これまでの平均得点率は${avgScore}%です。` : "";
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `公認会計士試験の「${subject}」について学習アドバイスをください。${scoreContext}\n\n以下の形式で回答してください：\n1. この科目で特に重要なポイント（2〜3点）\n2. 効果的な学習方法（2〜3点）\n3. よくある失点パターンと対策（1〜2点）`,
      }],
    });
    res.json({ tip: message.content[0].text });
  } catch (e) {
    console.error("/study-tip error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ---- Chat ----
app.post("/chat", async (req, res) => {
  try {
    const { messages, subject, context } = req.body;
    if (!messages || !subject) {
      return res.status(400).json({ error: "messages・subject は必須です。" });
    }
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: `あなたは公認会計士試験の${subject}の講師です。以下の採点結果を踏まえて質問に答えてください：\n${context || ""}`,
      messages: messages,
    });
    res.json({ reply: message.content[0].text });
  } catch (e) {
    console.error("/chat error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ===== 比較添削エンドポイント =====
app.post("/grade-compare", async (req, res) => {
  try {
    const { answerImage, modelAnswerImage, modelAnswerText, subject } = req.body;

    if (!answerImage) {
      return res.status(400).json({ error: "答案画像が必要です" });
    }

    // 答案OCR
    const answerOcrRes = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: answerImage } },
          { type: "text", text: "手書き答案のテキストをそのまま抽出してください。読めない部分は[不明]と記載。" }
        ]
      }]
    });
    const answerText = answerOcrRes.content[0].text;

    // 模範解答テキスト取得
    let modelText = modelAnswerText || "";
    if (!modelText && modelAnswerImage) {
      const modelOcrRes = await client.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: modelAnswerImage } },
            { type: "text", text: "模範解答のテキストをそのまま抽出してください。" }
          ]
        }]
      });
      modelText = modelOcrRes.content[0].text;
    }

    if (!modelText) {
      return res.status(400).json({ error: "模範解答（画像またはテキスト）が必要です" });
    }

    // 思考ステップ分解 + 差分分析 — tool_use で JSON を強制
    const GRADE_TOOL = {
      name: "grade_answer",
      description: "CPA試験答案の採点・思考ズレ分析結果を返す",
      input_schema: {
        type: "object",
        properties: {
          score: { type: "integer", minimum: 0, maximum: 100, description: "得点（0〜100）" },
          passed: { type: "boolean", description: "80点以上でtrue" },
          fatalErrors: { type: "integer", minimum: 0, description: "致命的ミスの件数" },
          missingProcess: { type: "boolean", description: "途中式が欠落している場合true" },
          answerSteps: {
            type: "object",
            properties: {
              issueRecognition: { type: "string", description: "受験生の論点認識" },
              premise: { type: "string", description: "受験生の前提整理" },
              logic: { type: "string", description: "受験生の計算/ロジック" },
              conclusion: { type: "string", description: "受験生の結論" },
            },
            required: ["issueRecognition", "premise", "logic", "conclusion"],
          },
          modelSteps: {
            type: "object",
            properties: {
              issueRecognition: { type: "string" },
              premise: { type: "string" },
              logic: { type: "string" },
              conclusion: { type: "string" },
            },
            required: ["issueRecognition", "premise", "logic", "conclusion"],
          },
          feedbacks: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            items: {
              type: "object",
              properties: {
                priority: { type: "integer", minimum: 1, maximum: 5 },
                type: { type: "string", enum: ["論点誤認", "思考プロセスミス", "計算ミス", "前提不足"] },
                point: { type: "string", minLength: 20, description: "具体的な指摘。「〜の論点を△△と誤認している」など曖昧表現禁止" },
                color: { type: "string", enum: ["red", "yellow", "green"] },
              },
              required: ["priority", "type", "point", "color"],
            },
          },
        },
        required: ["score", "passed", "fatalErrors", "missingProcess", "answerSteps", "modelSteps", "feedbacks"],
      },
    };

    const analysisRes = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2000,
      tools: [GRADE_TOOL],
      tool_choice: { type: "tool", name: "grade_answer" },
      messages: [{
        role: "user",
        content: `あなたはCPA（公認会計士）試験の答案添削AIです。
科目: ${subject || "不明"}

【受験生の答案】
${answerText}

【模範解答】
${modelText}

以下の点を必ず守って採点してください：
- feedbacksは最低1件・最大5件（priorityの昇順）
- point は「この問題は○○の論点ですが、△△として処理しています」のように具体的に記述
- 「少し違う」「概ね正しい」などの曖昧表現は禁止
- 論点認識のズレがある場合は必ず type: "論点誤認" で指摘する
- 正解でも減点リスクがある表現は指摘すること`,
      }],
    });

    let result;
    try {
      const toolBlock = analysisRes.content.find((b) => b.type === "tool_use" && b.name === "grade_answer");
      if (!toolBlock) throw new Error("tool_use block not found in response");
      result = toolBlock.input;
      // feedbacks を 1〜5 件にクランプ（安全策）
      if (!Array.isArray(result.feedbacks) || result.feedbacks.length === 0) {
        result.feedbacks = [{ priority: 1, type: "前提不足", point: "解析結果から具体的なフィードバックを抽出できませんでした。再度試行してください。", color: "yellow" }];
      }
      result.feedbacks = result.feedbacks.slice(0, 5);
      console.log("[grade-compare] score:", result.score, "passed:", result.passed, "feedbacks:", result.feedbacks.length);
    } catch (parseErr) {
      console.error("[grade-compare] tool_use extraction failed:", parseErr.message, analysisRes.content);
      return res.status(500).json({ error: "解析結果の取得に失敗しました: " + parseErr.message });
    }

    // 教科書RAG（既存textbookCacheを利用）
    if (result.feedbacks && result.feedbacks.length > 0) {
      const topIssue = result.feedbacks[0].point;
      try {
        if (fs.existsSync(TEXTBOOKS_FILE)) {
          const textbooks = JSON.parse(fs.readFileSync(TEXTBOOKS_FILE, "utf8"));
          if (textbooks.length > 0) {
            const ragRes = await client.messages.create({
              model: "claude-opus-4-5",
              max_tokens: 300,
              messages: [{
                role: "user",
                content: `以下の指摘に関連する教科書の記述を30字以内で引用してください。なければ空文字で返してください。
指摘: ${topIssue}
教科書テキスト（先頭3000字）: ${textbooks[0][1]?.text?.slice(0, 3000) || ""}`
              }]
            });
            result.textbookRef = ragRes.content[0].text.trim();
          }
        }
      } catch (_) {
        // RAG失敗はスルー
      }
    }

    res.json(result);
  } catch (err) {
    console.error("/grade-compare error:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`サーバー起動中: http://0.0.0.0:${PORT} (PORT env=${process.env.PORT})`);
});
