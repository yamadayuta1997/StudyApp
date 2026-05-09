const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const pdfParse = require("pdf-parse");
const { supabase, vectorSearch } = require("./supabase");
const OpenAI = require("openai");
const { connectMongo, isMongoEnabled } = require("./mongodb");
const Textbook = isMongoEnabled ? require("./models/Textbook") : null;
const Chunk    = isMongoEnabled ? require("./models/Chunk")    : null;

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

// ---- OCR プロンプト定数（手書き答案の認識精度向上） ----
const HANDWRITING_OCR_PROMPT = `あなたは手書き文字認識の専門家です。以下の手書き答案画像を最高精度でテキスト化してください。

【手書き特有の読み取り指示】
・崩し字・略字・連続文字もできる限り正確に読み取る
・数字の 0/6/8 や、かな・漢字の混在に注意して識別する
・「、」「。」などの句読点、カッコ類も見落とさない

【記号・数式の処理】
・会計・税務記号（¥, %, ×, ÷, ≦, ≧, ∑, →, ⇒）はそのまま転写
・分数は「分子/分母」形式、累乗は「底^指数」形式で転写
・アンダーライン・二重線は重要箇所として【重要】タグで囲む

【表・図の処理】
・表は｜で列を区切り、行ごとに改行して構造を保持する
・T字勘定（借方・貸方）は左右の構造をそのまま再現する
・図・グラフが含まれる場合は【図説明】セクションとして言語化する

【不確実な箇所の扱い】
・読み取れない文字・単語は【不明】と記載する
・推測で補った箇所は（推測：xxx）と明記する

余分な説明・コメントは一切不要です。転写結果のみを出力してください。`;

const MODEL_ANSWER_OCR_PROMPT = `あなたは手書き文字認識の専門家です。以下の手書き模範解答画像を最高精度でテキスト化してください。

【手書き特有の読み取り指示】
・崩し字・略字・連続文字もできる限り正確に読み取る
・数字の 0/6/8 や、かな・漢字の混在に注意して識別する
・「、」「。」などの句読点、カッコ類も見落とさない

【模範解答特有の処理】
・採点基準となる重要キーワードを正確に転写する
・会計処理の仕訳・勘定科目名は略称ではなく正式名称で転写する
・金額・数値は桁区切りも含めて正確に転写する（例: 1,000,000）
・箇条書き・番号付きリストは番号・記号をそのまま保持する

【記号・数式の処理】
・会計・税務記号（¥, %, ×, ÷, ≦, ≧, ∑, →, ⇒）はそのまま転写
・分数は「分子/分母」形式、累乗は「底^指数」形式で転写

【表・図の処理】
・表は｜で列を区切り、行ごとに改行して構造を保持する
・T字勘定（借方・貸方）は左右の構造をそのまま再現する
・図・グラフが含まれる場合は【図説明】セクションとして言語化する

【不確実な箇所の扱い】
・読み取れない文字・単語は【不明】と記載する
・推測で補った箇所は（推測：xxx）と明記する

余分な説明・コメントは一切不要です。転写結果のみを出力してください。`;

const GENERAL_OCR_PROMPT = `この画像を最高精度でOCRしてください。
・手書き文字・印刷文字・数式・記号・表・図のキャプションをすべて転写
・数式はそのままの形で転写（例: ∑, ≦, →, ÷）
・表は｜で区切って構造を保持
・図・グラフが含まれる場合は【図説明】として内容を言語化
・ページ番号・ヘッダー・フッターも含める
・不鮮明な箇所は【不明】と記載
余分な説明は不要です。転写結果のみ出力してください。`;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

async function extractTopicsFromChunks(chunksText, subject) {
  const res = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `以下の教科書テキストから、この範囲で問われる可能性のある主要論点を5つ以内で抽出してください。論点名のみをカンマ区切りで出力してください。科目: ${subject}\n\n${chunksText.slice(0, 2000)}`,
    }],
  });
  const text = res.content[0].text.trim();
  return text.split(/[,、，]/).map(t => t.trim()).filter(Boolean);
}

async function extractIssues(answerText, modelText, subject) {
  const res = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [{
      role: "user",
      content: `公認会計士試験「${subject}」の採点に必要な論点を3つ以内で抽出してください。論点のみをカンマ区切りで出力してください。\n【答案要旨】${answerText.slice(0, 400)}\n【模範解答要旨】${modelText.slice(0, 400)}`,
    }],
  });
  return res.content[0].text.trim();
}

async function getEmbedding(text) {
  if (!openaiClient) throw new Error("OPENAI_API_KEY未設定");
  const res = await openaiClient.embeddings.create({
    model: "text-embedding-3-small",
    input: text.slice(0, 2000),
  });
  return res.data[0].embedding;
}

const buildPageContent = (page) =>
  page.diagramDescription
    ? `${page.text}\n【図解】${page.diagramDescription}`.trim()
    : page.text;

// ---- 論点単位のセマンティックチャンク分割 (Issue #12) ----
const HEADING_SPLIT_RE = /(?=第[一二三四五六七八九十百\d１２３４５６７８９０]+[章節款目編]|【[^】]{1,50}】|[■◆●▶◎○][^\s]{1,30}|（[一二三四五六七八九十\d１２３４５６７８９０]+）)/;

function extractTopicName(text) {
  const bracket = text.match(/^【([^】]{1,50})】/);
  if (bracket) return bracket[0];
  const chapter = text.match(/^第[一二三四五六七八九十百\d１２３４５６７８９０]+[章節款目編][^\s]*/);
  if (chapter) return chapter[0];
  const bullet = text.match(/^[■◆●▶◎○][^\s]{1,30}/);
  if (bullet) return bullet[0];
  return '';
}

function getHeadingImportance(text) {
  if (/^第[一二三四五六七八九十百\d１２３４５６７８９０]+章/.test(text)) return 3;
  if (/^第[一二三四五六七八九十百\d１２３４５６７８９０]+[節款目編]/.test(text)) return 2;
  if (/^【[^】]{1,50}】/.test(text)) return 2;
  if (/^[■◆●▶◎○]/.test(text)) return 2;
  return 1;
}

function splitBySize(pageNum, text, topicName, startIdx) {
  const MAX = 500;
  const chunks = [];
  let remaining = text.trim();
  let idx = startIdx;
  while (remaining.length > 0) {
    if (remaining.length <= MAX) {
      if (remaining.trim()) chunks.push({ content: remaining.trim(), pageNum, topicName, importance: 1, chunkIndex: idx++ });
      break;
    }
    const boundary = remaining.slice(0, MAX).search(/[。．.！？!?][^。．.！？!?]*$/);
    const splitAt = boundary > MAX / 3 ? boundary + 1 : MAX;
    const seg = remaining.slice(0, splitAt).trim();
    if (seg) chunks.push({ content: seg, pageNum, topicName, importance: 1, chunkIndex: idx++ });
    remaining = remaining.slice(splitAt);
  }
  return chunks;
}

function splitIntoSemanticChunks(pageNum, text, diagramDescription, subject) {
  const fullText = diagramDescription
    ? `${text || ''}\n【図解】${diagramDescription}`.trim()
    : (text || '').trim();
  if (!fullText) return [];

  const segments = fullText.split(HEADING_SPLIT_RE).filter(s => s.trim().length > 0);
  if (segments.length <= 1) {
    return splitBySize(pageNum, fullText, subject, 0);
  }

  const chunks = [];
  let chunkIndex = 0;
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;
    const topicName = extractTopicName(trimmed) || subject;
    const importance = getHeadingImportance(trimmed);
    const subChunks = splitBySize(pageNum, trimmed, topicName, chunkIndex);
    subChunks.forEach(c => { c.importance = importance; });
    chunks.push(...subChunks);
    chunkIndex += subChunks.length;
  }
  return chunks;
}

const registerJobMap = new Map();
const REGISTER_JOB_MAX = 100;
function pruneRegisterJobMap() {
  while (registerJobMap.size > REGISTER_JOB_MAX) {
    registerJobMap.delete(registerJobMap.keys().next().value);
  }
}

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
      let raw;
      try {
        raw = fs.readFileSync(TEXTBOOKS_FILE, "utf8");
      } catch (readErr) {
        console.error("textbook cache read error:", readErr.message);
        textbookCache = new Map();
        console.log(`textbook cache loaded: 0 entries`);
        return;
      }
      let data;
      try {
        data = JSON.parse(raw);
      } catch (parseErr) {
        console.error("textbook cache parse error (corrupted file):", parseErr.message);
        const bakPath = TEXTBOOKS_FILE + ".bak";
        try {
          fs.renameSync(TEXTBOOKS_FILE, bakPath);
          console.warn(`corrupted textbooks.json backed up to ${bakPath}`);
        } catch (bakErr) {
          console.error("textbook cache backup error:", bakErr.message);
        }
        textbookCache = new Map();
        console.log(`textbook cache loaded: 0 entries`);
        return;
      }
      textbookCache = new Map(Array.isArray(data) ? data : []);
    }
    console.log(`textbook cache loaded: ${textbookCache.size} entries`);
  } catch (e) {
    console.error("textbook cache load error:", e.message);
    textbookCache = new Map();
    console.log(`textbook cache loaded: 0 entries`);
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

const TEXTBOOK_MAX_COUNT = parseInt(process.env.TEXTBOOK_MAX_COUNT || "20", 10);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---- pdfjs cache (extract-pdf-image 専用: canvas レンダリングが必要) ----
let _pdfjsLib = null;
async function getPdfjsLib() {
  if (!_pdfjsLib) {
    _pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // Node.js では file:// URL でワーカーを明示指定する必要がある
    const workerFile = path.join(
      path.dirname(require.resolve("pdfjs-dist/package.json")),
      "legacy", "build", "pdf.worker.mjs"
    );
    _pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerFile).href;
  }
  return _pdfjsLib;
}

// ---- Health ----
app.get("/health", async (req, res) => {
  let supabaseStatus = "disabled";
  let topicsCount = null;
  if (supabase) {
    try {
      const { error } = await supabase.from("history").select("id").limit(1);
      supabaseStatus = error ? `error: ${error.message}` : "ok";
    } catch (e) {
      supabaseStatus = `exception: ${e.message}`;
    }
    if (supabaseStatus === "ok") {
      try {
        const { count, error } = await supabase
          .from("topics")
          .select("*", { count: "exact", head: true });
        if (!error) topicsCount = count;
      } catch {}
    }
  }
  let pgvectorStatus;
  if (supabase && openaiClient)  pgvectorStatus = "ready";
  else if (!supabase)            pgvectorStatus = "supabase not configured";
  else                           pgvectorStatus = "openai key missing";
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    supabase: supabaseStatus,
    supabaseConfigured: !!supabase,
    topicsCount,
    mongodb: isMongoEnabled ? "enabled" : "disabled",
    openai: openaiClient ? "configured" : "not configured (OPENAI_API_KEY unset)",
    pgvector: pgvectorStatus,
  });
});

// ---- Textbook: Register ----
app.post("/textbook/register", (req, res, next) => {
  // multer のエラー（LIMIT_FILE_SIZE 等）を JSON で返すためにラップ
  upload.single("pdf")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "PDFファイルが大きすぎます（最大50MB）。", code: "LIMIT_FILE_SIZE" });
      }
      return res.status(400).json({ error: `アップロードエラー: ${err.message}`, code: err.code || "UPLOAD_ERROR" });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "PDFファイルが必要です。" });
    const { subject, bookName, description = "" } = req.body;
    if (!subject || !bookName) return res.status(400).json({ error: "subject・bookName は必須です。" });

    // pdf-parse を使用（Node.js 向け・worker 設定不要）
    const pages = [];
    let pageIdx = 0;
    let parsedDoc;
    try {
      parsedDoc = await pdfParse(req.file.buffer, {
        pagerender: async (pageData) => {
          pageIdx++;
          const num = pageIdx;
          const textContent = await pageData.getTextContent();
          const text = textContent.items
            .filter(item => "str" in item)
            .map(item => item.str)
            .join(" ")
            .trim();
          if (text) pages.push({ pageNum: num, text });
          return text;
        },
      });
    } catch (e) {
      return res.status(400).json({ error: `PDF解析失敗: ${e.message}`, code: "PARSE_ERROR" });
    }
    const totalPages = parsedDoc.numpages;
    console.log(`[textbook/register] parsed ${pages.length}/${totalPages} pages`);

    const bookId = `${subject}_${bookName}`;
    const isOverwrite = req.body.overwrite === "true";

    if (textbookCache.has(bookId) && !isOverwrite) {
      return res.status(409).json({ error: "duplicate", bookId });
    }
    if (!textbookCache.has(bookId) && textbookCache.size >= TEXTBOOK_MAX_COUNT) {
      return res.status(422).json({ error: "limit_exceeded", limit: TEXTBOOK_MAX_COUNT });
    }

    // ---- 図解ページ検出（テキストが少ないページ or pdf-parse が抽出できなかったページ） ----
    const extractedNums = new Set(pages.map(p => p.pageNum));
    const diagramPageNums = [];
    for (let i = 1; i <= totalPages; i++) {
      const page = pages.find(p => p.pageNum === i);
      if (!extractedNums.has(i) || (page && page.text.trim().length < 50)) {
        diagramPageNums.push(i);
      }
    }

    textbookCache.set(bookId, { subject, bookName, description, pages, pdfStorageUrl: null, registeredAt: new Date().toISOString() });
    saveTextbookCache();

    const jobId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    registerJobMap.set(jobId, { status: "processing", phase: "uploading", progress: 0, total: pages.length, bookId });
    pruneRegisterJobMap();
    res.status(202).json({ ok: true, bookId, totalPages, subject, bookName, diagramPageNums, jobId, status: "processing" });

    setImmediate(() => processTextbookBackground(jobId, bookId, bookName, subject, pages, req.file.buffer, diagramPageNums, totalPages));
  } catch (e) {
    console.error("/textbook/register error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ---- Textbook: Register — background job ----
async function processTextbookBackground(jobId, bookId, bookName, subject, pages, pdfBuffer, diagramPageNums, totalPages) {
  const updateJob = (updates) => {
    const cur = registerJobMap.get(jobId) || {};
    registerJobMap.set(jobId, { ...cur, ...updates });
  };

  try {
    // Phase 1: Supabase Storage upload
    let pdfStorageUrl = null;
    if (supabase && pdfBuffer.length <= 50 * 1024 * 1024) {
      try {
        const { error: storageErr } = await supabase.storage
          .from("textbooks")
          .upload(`${bookId}.pdf`, pdfBuffer, { contentType: "application/pdf", upsert: true });
        if (storageErr) {
          console.warn("[textbook/register] storage upload:", storageErr.message);
        } else {
          const { data: urlData } = supabase.storage.from("textbooks").getPublicUrl(`${bookId}.pdf`);
          pdfStorageUrl = urlData?.publicUrl || null;
          const cached = textbookCache.get(bookId);
          if (cached) { cached.pdfStorageUrl = pdfStorageUrl; textbookCache.set(bookId, cached); saveTextbookCache(); }
          console.log(`[textbook/register] PDF stored: ${bookId}.pdf`);
        }
      } catch (e) {
        console.warn("[textbook/register] storage exception:", e.message);
      }
    }

    // Phase 2: Claude Vision diagram analysis
    updateJob({ phase: "analyzing_diagrams" });
    if (diagramPageNums.length > 0 && pdfBuffer.length <= 32 * 1024 * 1024) {
      try {
        const pdfBase64 = pdfBuffer.toString("base64");
        const diagRes = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          messages: [{
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
              { type: "text", text: `このPDFの以下のページに図・グラフ・表などの図解が含まれている可能性があります。実際に図解がある場合のみ、RAGシステム用に各ページの内容を詳しく説明してください。\n対象ページ: ${diagramPageNums.join(", ")}\n\n図解がある場合は以下の形式で回答してください:\n【ページX】\n（図解の種類・軸ラベル・数値・凡例・キャプション・読み取れる内容）\n\n図解がないページはスキップしてください。` },
            ],
          }],
        });
        const responseText = diagRes.content[0].text;
        const cached = textbookCache.get(bookId);
        if (cached) {
          const pagePattern = /【ページ(\d+)】\s*([\s\S]*?)(?=【ページ\d+】|$)/g;
          let m;
          while ((m = pagePattern.exec(responseText)) !== null) {
            const num = parseInt(m[1]);
            const desc = m[2].trim();
            if (!desc) continue;
            const existing = cached.pages.find(p => p.pageNum === num);
            if (existing) { existing.diagramDescription = desc; existing.isImage = true; }
            else cached.pages.push({ pageNum: num, text: "", diagramDescription: desc, isImage: true });
          }
          cached.pages.sort((a, b) => a.pageNum - b.pageNum);
          pages = cached.pages;
          textbookCache.set(bookId, cached);
          saveTextbookCache();
        }
        console.log(`[textbook/register] diagram analysis done: ${diagramPageNums.length} pages checked`);
      } catch (e) {
        console.warn("[textbook/register] diagram analysis failed (non-fatal):", e.message);
      }
    }

    // Semantic chunk computation (論点単位分割)
    const allSemanticChunks = [];
    for (const p of pages) {
      const chunks = splitIntoSemanticChunks(p.pageNum, p.text || "", p.diagramDescription, subject);
      for (const sc of chunks) {
        allSemanticChunks.push({ ...sc, isImage: !!(p.isImage), diagramDescription: p.diagramDescription || "" });
      }
    }
    console.log(`[semantic] ${allSemanticChunks.length} chunks from ${pages.length} pages for ${bookId}`);

    // Phase 3: MongoDB save
    updateJob({ phase: "saving_mongodb" });
    if (isMongoEnabled && Textbook && Chunk) {
      try {
        await Textbook.findOneAndUpdate(
          { textbookId: bookId },
          { textbookId: bookId, title: bookName, subject, pages, totalPages, diagramPageNums, pdfStorageUrl, createdAt: new Date() },
          { upsert: true, new: true }
        );
        const chunkDocs = allSemanticChunks.map(sc => ({
          textbookId: bookId, subject,
          content: sc.content,
          pageNum: sc.pageNum,
          topicName: sc.topicName,
          importance: sc.importance,
          chunkIndex: sc.chunkIndex,
          embedding: [],
          isImage: sc.isImage,
          diagramDescription: sc.diagramDescription,
        }));
        await Chunk.deleteMany({ textbookId: bookId });
        if (chunkDocs.length > 0) await Chunk.insertMany(chunkDocs);
        console.log(`[mongodb] textbook saved: ${bookId}, chunks: ${chunkDocs.length}`);
      } catch (mongoErr) {
        console.error("[mongodb] textbook save error:", mongoErr.message);
      }
    }

    // Phase 4: 並列埋め込み生成 → Supabase バッチ挿入 + MongoDB Chunk embedding 更新
    if (supabase && openaiClient) {
      updateJob({ phase: "embedding", progress: 0, total: allSemanticChunks.length });
      await supabase.from("topics").delete().eq("textbook_id", bookId);
      const CONCURRENCY = 5;
      const rows = [];
      const mongoEmbeddings = [];
      for (let i = 0; i < allSemanticChunks.length; i += CONCURRENCY) {
        const batch = allSemanticChunks.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(
          batch.map(async (sc) => {
            if (!sc.content) return null;
            try {
              const embedText = sc.topicName && sc.topicName !== subject
                ? `${sc.topicName}: ${sc.content}` : sc.content;
              const embedding = await getEmbedding(embedText.slice(0, 1000));
              return { sc, embedding };
            } catch (e) {
              console.warn(`[topics] embed p.${sc.pageNum} chunk ${sc.chunkIndex}:`, e.message);
              return null;
            }
          })
        );
        for (const r of batchResults.filter(Boolean)) {
          rows.push({
            subject,
            content: r.sc.content.slice(0, 2000),
            embedding: r.embedding,
            textbook_id: bookId,
            page_num: r.sc.pageNum,
            topic_name: r.sc.topicName || null,
            importance: r.sc.importance || 1,
          });
          mongoEmbeddings.push({ chunkIndex: r.sc.chunkIndex, pageNum: r.sc.pageNum, embedding: r.embedding });
        }
        updateJob({ progress: Math.min(i + CONCURRENCY, allSemanticChunks.length) });
      }
      const INSERT_BATCH = 100;
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        const insertBatch = rows.slice(i, i + INSERT_BATCH);
        const { error: insErr } = await supabase.from("topics").insert(insertBatch);
        if (insErr) {
          if (insErr.message && insErr.message.includes('column')) {
            const legacyBatch = insertBatch.map(({ topic_name, importance, ...rest }) => rest);
            const { error: legErr } = await supabase.from("topics").insert(legacyBatch);
            if (legErr) console.warn(`[topics] batch insert (fallback):`, legErr.message);
          } else {
            console.warn(`[topics] batch insert:`, insErr.message);
          }
        }
      }
      console.log(`[topics] embedded ${rows.length}/${allSemanticChunks.length} chunks for ${bookId}`);

      // MongoDB Chunk に embedding を紐付け保存（topics.id との相関は textbookId + pageNum + chunkIndex で維持）
      if (isMongoEnabled && Chunk && mongoEmbeddings.length > 0) {
        try {
          const bulkOps = mongoEmbeddings.map(({ chunkIndex, pageNum, embedding }) => ({
            updateOne: {
              filter: { textbookId: bookId, pageNum, chunkIndex },
              update: { $set: { embedding } },
            },
          }));
          await Chunk.bulkWrite(bulkOps);
          console.log(`[mongodb] updated ${bulkOps.length} chunk embeddings for ${bookId}`);
        } catch (mongoErr) {
          console.warn("[mongodb] chunk embedding update (non-fatal):", mongoErr.message);
        }
      }
    }

    updateJob({ status: "done", phase: "done", progress: allSemanticChunks.length });
    setTimeout(() => registerJobMap.delete(jobId), 60 * 60 * 1000);
  } catch (e) {
    console.error("[textbook/register] background error:", e.message);
    updateJob({ status: "error", error: e.message });
    setTimeout(() => registerJobMap.delete(jobId), 60 * 60 * 1000);
  }
}

// ---- Textbook: Register Status ----
app.get("/textbook/register/status/:jobId", (req, res) => {
  const job = registerJobMap.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "ジョブが見つかりません。" });
  res.json(job);
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
app.post("/textbook/search", async (req, res) => {
  try {
    const { query, subject } = req.body;
    if (!query) return res.status(400).json({ error: "query は必須です。" });

    // MongoDB 優先、未接続時は textbooks.json にフォールバック
    if (isMongoEnabled && Chunk) {
      try {
        const filter = { content: { $regex: query, $options: "i" } };
        if (subject) filter.subject = subject;
        const chunks = await Chunk.find(filter).limit(10).lean();
        const results = chunks.map(c => ({
          bookId:   c.textbookId,
          bookName: c.textbookId.replace(/^[^_]+_/, ""),
          subject:  c.subject,
          pageNum:  c.pageNum,
          excerpt:  (() => {
            const idx = c.content.toLowerCase().indexOf(query.toLowerCase());
            const start = Math.max(0, idx - 100);
            const end   = Math.min(c.content.length, idx + query.length + 100);
            return c.content.slice(start, end);
          })(),
        }));
        console.log(`[mongodb] search "${query}" → ${results.length} hits`);
        return res.json({ results, source: "mongodb" });
      } catch (mongoErr) {
        console.error("[mongodb] search error, falling back to JSON:", mongoErr.message);
      }
    }

    // JSON キャッシュ フォールバック
    const results = [];
    for (const [bookId, book] of textbookCache.entries()) {
      if (subject && book.subject !== subject) continue;
      for (const page of book.pages) {
        const searchText = `${page.text} ${page.diagramDescription || ""}`;
        const idx = searchText.toLowerCase().indexOf(query.toLowerCase());
        if (idx !== -1) {
          const start = Math.max(0, idx - 100);
          const end   = Math.min(searchText.length, idx + query.length + 100);
          results.push({
            bookId,
            bookName: book.bookName,
            subject:  book.subject,
            pageNum:  page.pageNum,
            excerpt:  searchText.slice(start, end) + (page.isImage ? " 【図解ページ】" : ""),
          });
          if (results.length >= 10) break;
        }
      }
      if (results.length >= 10) break;
    }
    res.json({ results, source: "json" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Textbook: Chunks by Page Range ----
app.post("/textbook/chunks-by-pages", async (req, res) => {
  try {
    const { bookId, fromPage, toPage } = req.body;
    if (!bookId) return res.status(400).json({ error: "bookId は必須です。" });

    const from = Math.max(1, parseInt(fromPage) || 1);
    const to = parseInt(toPage) || 9999;

    if (isMongoEnabled && Chunk) {
      try {
        const chunks = await Chunk.find({
          textbookId: bookId,
          pageNum: { $gte: from, $lte: to },
        }).sort({ pageNum: 1, chunkIndex: 1 }).lean();
        if (chunks.length > 0) {
          const text = chunks.map(c => c.content).join("\n");
          return res.json({ text, chunkCount: chunks.length, source: "mongodb" });
        }
      } catch (mongoErr) {
        console.error("[textbook/chunks-by-pages] MongoDB error:", mongoErr.message);
      }
    }

    const book = textbookCache.get(bookId);
    if (!book) return res.status(404).json({ error: "教科書が見つかりません。" });

    const pages = book.pages.filter(p => p.pageNum >= from && p.pageNum <= to);
    if (pages.length === 0) return res.status(404).json({ error: "指定ページ範囲に内容がありません。" });

    const text = pages.map(p => buildPageContent(p)).join("\n");
    return res.json({ text, chunkCount: pages.length, source: "json" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Grade ----
app.post("/grade", async (req, res) => {
  try {
    const { question, answer, subject, bookIds = [], questionImages = [], answerImages = [],
            sourceBookId, sourceFromPage, sourceToPage, deviceId, userId } = req.body;
    if (!question || !answer || !subject) {
      return res.status(400).json({ error: "question・answer・subject は必須です。" });
    }

    // Build textbook context — pgvector semantic search first, bookIds cache fallback
    let bookContext = "";
    if (supabase && openaiClient) {
      try {
        const queryText = `${question} ${answer}`.slice(0, 1000);
        const embedding = await getEmbedding(queryText);
        const hits = await vectorSearch(embedding, subject, 5);
        if (hits.length > 0) {
          bookContext = hits
            .map(h => `【参考教材】\n${h.textbook_id || "教科書"} p.${h.page_num || "?"}: ${h.content}`)
            .join("\n\n");
          console.log(`[grade] pgvector RAG hits=${hits.length} subject=${subject}`);
        }
      } catch (pgErr) {
        console.warn("[grade] pgvector search failed, falling back:", pgErr.message);
      }
    }
    if (!bookContext) {
      for (const bookId of bookIds) {
        const book = textbookCache.get(bookId);
        if (book) {
          for (const page of book.pages) {
            bookContext += `【参考教材】\n${book.bookName} p.${page.pageNum}:\n${buildPageContent(page)}\n\n`;
          }
        }
      }
    }

    // Topic extraction from source textbook page range
    let topicList = [];
    if (sourceBookId) {
      try {
        const from = Math.max(1, parseInt(sourceFromPage) || 1);
        const to = parseInt(sourceToPage) || 9999;
        let chunksText = "";
        if (isMongoEnabled && Chunk) {
          try {
            const chunks = await Chunk.find({
              textbookId: sourceBookId,
              pageNum: { $gte: from, $lte: to },
            }).sort({ pageNum: 1, chunkIndex: 1 }).lean();
            chunksText = chunks.map(c => c.content).join("\n");
          } catch (mongoErr) {
            console.error("[grade] MongoDB chunks error:", mongoErr.message);
          }
        }
        if (!chunksText) {
          const srcBook = textbookCache.get(sourceBookId);
          if (srcBook) {
            const pages = srcBook.pages.filter(p => p.pageNum >= from && p.pageNum <= to);
            chunksText = pages.map(p => buildPageContent(p)).join("\n");
          }
        }
        if (chunksText) {
          topicList = await extractTopicsFromChunks(chunksText, subject);
        }
      } catch (topicErr) {
        console.error("[grade] topic extraction error:", topicErr.message);
      }
    }

    const userContent = [];
    if (bookContext) {
      userContent.push({ type: "text", text: `${bookContext}\n---\n` });
    }
    if (questionImages.length > 0) {
      userContent.push({ type: "text", text: "【問題文の画像】\n" });
      for (const imgBase64 of questionImages) {
        userContent.push({ type: "image", source: { type: "base64", media_type: detectMediaType(imgBase64), data: imgBase64 } });
      }
    }
    if (answerImages.length > 0) {
      userContent.push({ type: "text", text: "【答案の画像】\n" });
      for (const imgBase64 of answerImages) {
        userContent.push({ type: "image", source: { type: "base64", media_type: detectMediaType(imgBase64), data: imgBase64 } });
      }
    }

    const hasImages = questionImages.length > 0 || answerImages.length > 0;
    const imageNote = [
      questionImages.length > 0 ? "問題文に画像が含まれています。画像内の図・表・グラフも問題の一部として採点に考慮してください。" : "",
      answerImages.length > 0 ? "答案に画像・図が含まれています。その内容も採点対象にしてください。図の正確性・凡例・単位なども評価してください。" : "",
    ].filter(Boolean).join("\n");

    const topicEvalSection = topicList.length > 0
      ? `\n\n【論点リスト】この問題で問われている論点：\n${topicList.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\n採点後、以下の形式で論点評価を追記してください：\n【論点評価】\n✅ 正しく言及: （論点名をカンマ区切り。なければ「なし」）\n❌ 抜けている: （論点名をカンマ区切り。なければ「なし」）\n⚠️ 不要・的外れ: （論点名をカンマ区切り。なければ「なし」）`
      : "";

    const tableGradingCriteria = `\n\n【図表・仕訳表の採点基準】\n・仕訳表: 勘定科目が正しく金額のみ異なる場合は70%相当の部分点\n・仕訳表: 勘定科目に誤りがあるが金額が正しい場合は40%相当の部分点\n・T字勘定・B/S・P/L: 構造・科目配置が正しく数値のみ異なる場合は60〜70%相当\n・図・グラフ: 軸ラベル・種類が正しく数値のみ異なる場合は50〜70%相当\n・図表の形式が根本的に誤っている場合は0〜20%\n・手書き図表は読み取れる部分を最大限評価し、不鮮明な箇所は受験生に有利に解釈する`;
    const promptText = `あなたは公認会計士試験の採点官です。科目は「${subject}」です。以下の問題と答案を採点してください。\n\n【問題】\n${question}\n\n【答案】\n${answer}\n\n${hasImages ? imageNote + "\n\n" : ""}${tableGradingCriteria}\n\n正誤判定と改善点を丁寧に説明してください。採点・フィードバック後、以下を必ず記載:\n【得点率】XX%\n【論点】論点名1, 論点名2（主要論点を3つ以内でカンマ区切り）\n【誤答論点】論点名（間違えた論点。完答なら「なし」）\n${bookIds.length > 0 ? "【参考ページ】教科書名 p.XX（参照教材の中で関連するページがあれば・複数可）\n" : ""}【解説まとめ】この問題で押さえるべきポイントを3行以内で${topicEvalSection}`;

    userContent.push({ type: "text", text: promptText });

    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
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

    const topicEvalMatch = resultText.match(/【論点評価】([\s\S]+?)(?=【|$)/);
    let topicEvaluation = null;
    if (topicEvalMatch) {
      const evalText = topicEvalMatch[1];
      const presentMatch = evalText.match(/✅ 正しく言及:\s*(.+)/);
      const missingMatch = evalText.match(/❌ 抜けている:\s*(.+)/);
      const irrelevantMatch = evalText.match(/⚠️ 不要・的外れ:\s*(.+)/);
      topicEvaluation = {
        present: presentMatch && presentMatch[1].trim() !== "なし"
          ? presentMatch[1].split(/[,、，]/).map(s => s.trim()).filter(Boolean) : [],
        missing: missingMatch && missingMatch[1].trim() !== "なし"
          ? missingMatch[1].split(/[,、，]/).map(s => s.trim()).filter(Boolean) : [],
        irrelevant: irrelevantMatch && irrelevantMatch[1].trim() !== "なし"
          ? irrelevantMatch[1].split(/[,、，]/).map(s => s.trim()).filter(Boolean) : [],
      };
    }

    // Supabase history 保存（失敗しても採点結果は返す）
    if (supabase) {
      try {
        const { error: sbErr } = await supabase.from("history").insert({
          device_id:   userId || deviceId || "unknown",
          score:       score    ?? null,
          subject:     subject  || null,
          result_json: { result: resultText, score, topics, wrongTopics, refPages, summary },
        });
        if (sbErr) console.error("[grade][supabase] insert error:", sbErr.message);
        else       console.log("[grade][supabase] history saved. score:", score);
      } catch (sbEx) {
        console.error("[grade][supabase] unexpected error:", sbEx.message);
      }
    }

    res.json({ result: resultText, score, topics, wrongTopics, refPages, summary, topicList, topicEvaluation });
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
          { type: "image", source: { type: "base64", media_type: detectMediaType(imageBase64), data: imageBase64 } },
          { type: "text", text: GENERAL_OCR_PROMPT },
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
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: detectMediaType(imageBase64), data: imageBase64 } },
          { type: "text", text: HANDWRITING_OCR_PROMPT },
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
    const { subject, avgScore, wrongTopicsRanked = [], improvedTopics = [] } = req.body;
    const scoreContext = avgScore !== null && avgScore !== undefined
      ? `これまでの平均得点率は${avgScore}%です。` : "";

    let promptContent;
    if (wrongTopicsRanked.length > 0) {
      const topicsText = wrongTopicsRanked
        .map((t, i) => `${i + 1}. ${t.topic}（${t.count}回ミス）`)
        .join("\n");
      const improvedSection = improvedTopics.length > 0
        ? `\n\n【改善が見られた論点（最近のミスなし）】\n${improvedTopics.join("、")}`
        : "";
      promptContent = `公認会計士試験の「${subject}」の学習者に、ミス履歴に基づいたパーソナライズされたアドバイスをください。${scoreContext}

【よくミスする論点（頻度順）】
${topicsText}${improvedSection}

以下の形式で回答してください：
1. 特に重点的に復習すべき論点と理由（ミスの多い論点を優先して2〜3点）
2. 各論点の効果的な学習アプローチ（2〜3点）
3. ミスのパターンから見える課題と対策（1〜2点）${improvedTopics.length > 0 ? "\n4. 改善できている論点への一言コメント（1点）" : ""}`;
    } else {
      promptContent = `公認会計士試験の「${subject}」について学習アドバイスをください。${scoreContext}\n\n以下の形式で回答してください：\n1. この科目で特に重要なポイント（2〜3点）\n2. 効果的な学習方法（2〜3点）\n3. よくある失点パターンと対策（1〜2点）`;
    }

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: promptContent }],
    });
    res.json({ tip: message.content[0].text });
  } catch (e) {
    console.error("/study-tip error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ---- Weekly Study Report ----
app.post("/study-report", async (req, res) => {
  try {
    const {
      scoringItems = [],
      compareItems = [],
      avgScore,
      subjectBreakdown = {},
      topWrongTopics = [],
    } = req.body;

    const totalScoringCount = scoringItems.length;
    const totalCompareCount = compareItems.length;

    const subjectSummary = Object.entries(subjectBreakdown)
      .map(([subj, data]) =>
        `・${subj}: ${data.count}回採点、平均得点率${data.avgScore !== null ? data.avgScore + "%" : "不明"}`
      )
      .join("\n") || "データなし";

    const wrongTopicsSummary = topWrongTopics.length > 0
      ? topWrongTopics.map((t, i) => `${i + 1}. ${t.topic}（${t.count}回ミス）`).join("\n")
      : "データなし";

    const prompt = `あなたは公認会計士試験の学習コーチです。以下の先週の学習データを分析して、学習レポートを作成してください。

【先週の学習データ（過去7日間）】
- 答案採点: ${totalScoringCount}回
- 比較添削: ${totalCompareCount}回
- 採点の平均得点率: ${avgScore !== null && avgScore !== undefined ? avgScore + "%" : "データなし"}

【科目別実績】
${subjectSummary}

【よくミスした論点（頻度順）】
${wrongTopicsSummary}

以下の3つのセクションで回答してください。各セクションは具体的・実践的に記述してください。

## 今週の成果
（先週の学習量・得点率・科目カバレッジなど、良かった点を2〜3点）

## 改善すべき論点
（ミスが多かった論点や得点率が低い科目への具体的な改善アドバイスを2〜3点）

## 来週の学習提案
（来週優先して取り組むべきことを具体的に2〜3点）`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].text;
    const achievementsMatch = text.match(/##\s*今週の成果\s*([\s\S]*?)(?=##|$)/);
    const improvementsMatch = text.match(/##\s*改善すべき論点\s*([\s\S]*?)(?=##|$)/);
    const suggestionsMatch = text.match(/##\s*来週の学習提案\s*([\s\S]*?)(?=##|$)/);

    res.json({
      achievements: achievementsMatch ? achievementsMatch[1].trim() : "",
      improvements: improvementsMatch ? improvementsMatch[1].trim() : "",
      suggestions: suggestionsMatch ? suggestionsMatch[1].trim() : "",
    });
  } catch (e) {
    console.error("/study-report error:", e.message);
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
// ---- 評価ツール定義 ----
const EVAL_TOOL = {
  name: "evaluate_grade",
  description: "採点結果の品質を0-100で評価し、改善案を返す",
  input_schema: {
    type: "object",
    properties: {
      score: { type: "integer", minimum: 0, maximum: 100, description: "品質スコア。feedbackが具体的・正確なら高得点" },
      improvements: {
        type: "array", maxItems: 3,
        items: { type: "string", description: "次回生成に向けた具体的な改善指示" },
        description: "スコアが低い場合の改善案（最大3件）",
      },
    },
    required: ["score", "improvements"],
  },
};

async function evaluateGrade(result, answerText, modelText) {
  try {
    const evalRes = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      tools: [EVAL_TOOL],
      tool_choice: { type: "tool", name: "evaluate_grade" },
      messages: [{
        role: "user",
        content: `以下の採点結果を品質評価してください。

【採点対象】
受験生の答案: ${answerText.slice(0, 300)}
模範解答: ${modelText.slice(0, 300)}

【採点結果】
スコア: ${result.score}点
feedbacks: ${JSON.stringify(result.feedbacks)}
answerSteps: ${JSON.stringify(result.answerSteps)}

評価基準：
1. feedbacksのpointが「○○の論点を△△と誤認している」のように具体的か（曖昧表現は減点）
2. scoreが答案内容と模範解答の差異から妥当に導かれているか
3. answerStepsが答案から正しく抽出されているか
4. 改善可能な点があれば具体的な指示として返すこと`,
      }],
    });
    const toolBlock = evalRes.content.find((b) => b.type === "tool_use" && b.name === "evaluate_grade");
    if (!toolBlock) return { score: 70, improvements: [] };
    const evalData = toolBlock.input;
    console.log("[grade-compare][eval] score:", evalData.score, "improvements:", evalData.improvements?.length);
    return { score: evalData.score ?? 70, improvements: evalData.improvements ?? [] };
  } catch (e) {
    console.error("[grade-compare][eval] error:", e.message);
    return { score: 70, improvements: [] };
  }
}

// ---- バックグラウンド評価ジョブストア ----
const evalJobStore = new Map();
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, job] of evalJobStore) {
    if (job.createdAt < cutoff) evalJobStore.delete(id);
  }
}, 60 * 1000);

app.get("/grade-compare/eval-status/:jobId", (req, res) => {
  const job = evalJobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "job not found" });
  res.json(job);
});

app.post("/grade-compare", async (req, res) => {
  try {
    const { answerImage, modelAnswerImage, modelAnswerText, subject, promptTips, deviceId, userId, gradingCriteria } = req.body;

    // 複数ページ対応: 配列優先、単一画像は後方互換
    const answerImages = Array.isArray(req.body.answerImages) && req.body.answerImages.length > 0
      ? req.body.answerImages
      : answerImage ? [answerImage] : [];
    const modelAnswerImages = Array.isArray(req.body.modelAnswerImages) && req.body.modelAnswerImages.length > 0
      ? req.body.modelAnswerImages
      : modelAnswerImage ? [modelAnswerImage] : [];

    if (answerImages.length === 0) {
      return res.status(400).json({ error: "答案画像が必要です" });
    }

    // OCR を並列実行（複数ページを1リクエストでまとめて送信）
    const buildOcrContent = (images, prompt) => [
      ...images.map((b64) => ({
        type: "image",
        source: { type: "base64", media_type: detectMediaType(b64), data: b64 },
      })),
      { type: "text", text: images.length > 1
        ? `${prompt}\n\n※画像は${images.length}ページあります。ページ順に「【1ページ目】\n...\n【2ページ目】\n...」と区切って書き起こしてください。`
        : prompt },
    ];

    const needsModelOcr = !modelAnswerText && modelAnswerImages.length > 0;
    const [answerOcrRes, modelOcrRes] = await Promise.all([
      client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        messages: [{ role: "user", content: buildOcrContent(answerImages, HANDWRITING_OCR_PROMPT) }],
      }),
      needsModelOcr
        ? client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            messages: [{ role: "user", content: buildOcrContent(modelAnswerImages, MODEL_ANSWER_OCR_PROMPT) }],
          })
        : Promise.resolve(null),
    ]);
    const answerText = answerOcrRes.content[0].text;
    const modelText = modelAnswerText || modelOcrRes?.content[0].text || "";

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
                type: { type: "string", enum: ["論点誤認", "思考プロセスミス", "計算ミス", "前提不足", "図表形式ミス"] },
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

    const tipsContext = Array.isArray(promptTips) && promptTips.length > 0
      ? `\n\n【過去の改善指示（必ず反映すること）】\n${promptTips.slice(-3).map((t, i) => `${i + 1}. ${t}`).join("\n")}`
      : "";

    const criteriaContextMap = {
      issue_focus: `\n\n【採点基準：論点重視モード】\n- 論点認識（issueRecognition）のズレを最重要視し、scoreに最も大きく影響させる\n- 正しい論点を把握できていれば、軽微な計算ミスがあっても高めに評価する\n- feedbacksはtype:"論点誤認"・"前提不足"を優先して指摘し、計算ミスは軽微な場合は省略可`,
      calculation_focus: `\n\n【採点基準：計算重視モード】\n- 計算・ロジック（logic）の正確性を最重要視し、scoreに最も大きく影響させる\n- 計算ミスや途中式の誤りは厳しく減点する\n- feedbacksはtype:"計算ミス"・"思考プロセスミス"を優先して指摘する`,
    };
    const criteriaContext = criteriaContextMap[gradingCriteria] ?? "";

    // 採点プロンプト（ホットパス・バックグラウンドリトライ共用）
    const gradingUserContent = `あなたはCPA（公認会計士）試験の答案添削AIです。
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
- 正解でも減点リスクがある表現は指摘すること
- 仕訳の記載がなくても、考え方・計算過程が正しければ満点とする

【図表・仕訳表の採点基準】
- 仕訳表: 借方・貸方の勘定科目が正しく金額のみ異なる場合 → 70点相当の部分点
- 仕訳表: 勘定科目に誤りがあるが金額が正しい場合 → 40点相当の部分点
- T字勘定・B/S・P/L: 表の構造・科目配置が正しく数値のみ異なる場合 → 60〜70点相当
- 図・グラフ: 軸ラベル・種類が正しく数値のみ異なる場合 → 50〜70点相当
- 図表の形式が根本的に誤っている（借方・貸方が逆、構造崩壊など）場合 → 0〜20点
- 手書き図表は読み取れる部分を最大限評価し、不鮮明な箇所は受験生に有利に解釈する
- 図表形式の誤りは type: "図表形式ミス" で指摘する${criteriaContext}${tipsContext}`;

    // ---- ホットパス: 採点1回のみ実行して即時レスポンス ----
    let analysisRes;
    try {
      analysisRes = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        tools: [GRADE_TOOL],
        tool_choice: { type: "tool", name: "grade_answer" },
        messages: [{ role: "user", content: gradingUserContent }],
      });
    } catch (genErr) {
      console.error("[grade-compare] generation error:", genErr.message);
      return res.status(500).json({ error: genErr.message });
    }

    if (analysisRes.stop_reason === "max_tokens") {
      console.error("[grade-compare] TRUNCATED (stop_reason=max_tokens)");
      return res.status(500).json({ error: "採点レスポンスが長すぎて取得できませんでした。再度お試しください。" });
    }

    const toolBlock = analysisRes.content.find((b) => b.type === "tool_use" && b.name === "grade_answer");
    if (!toolBlock) {
      console.error("[grade-compare] tool_use block not found");
      return res.status(500).json({ error: "解析結果の取得に失敗しました" });
    }

    let result = toolBlock.input;
    if (typeof result.score !== "number") {
      console.error("[grade-compare] score missing:", JSON.stringify(result).slice(0, 200));
      return res.status(500).json({ error: "採点結果の取得に失敗しました。再度お試しください。" });
    }

    if (!Array.isArray(result.feedbacks) || result.feedbacks.length === 0) {
      result.feedbacks = [{ priority: 1, type: "前提不足", point: "解析結果から具体的なフィードバックを抽出できませんでした。再度試行してください。", color: "yellow" }];
    }
    result.feedbacks = result.feedbacks.slice(0, 5);
    console.log("[grade-compare] score:", result.score, "feedbacks:", result.feedbacks.length);

    // ジョブIDを発行して採点結果を即時返却
    const jobId = `j${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    evalJobStore.set(jobId, { status: "pending", createdAt: Date.now() });
    res.json({ ...result, jobId });

    // ---- バックグラウンド: 品質評価 → 必要時リトライ → Supabase保存 → RAG ----
    (async () => {
      let finalResult = result;
      let evalScore = 70, evalImprovements = [];
      let textbookRef;

      // 品質評価
      try {
        const evalResult = await evaluateGrade(result, answerText, modelText);
        evalScore = evalResult.score;
        evalImprovements = evalResult.improvements;
        console.log("[grade-compare][bg] evalScore:", evalScore);

        if (evalScore < 60) {
          console.log("[grade-compare][bg] evalScore < 60, retrying grade");
          try {
            const retryRes = await client.messages.create({
              model: "claude-sonnet-4-6",
              max_tokens: 4096,
              tools: [GRADE_TOOL],
              tool_choice: { type: "tool", name: "grade_answer" },
              messages: [{ role: "user", content: gradingUserContent }],
            });
            if (retryRes.stop_reason !== "max_tokens") {
              const retryBlock = retryRes.content.find((b) => b.type === "tool_use" && b.name === "grade_answer");
              if (retryBlock && typeof retryBlock.input.score === "number") {
                finalResult = retryBlock.input;
                if (!Array.isArray(finalResult.feedbacks) || finalResult.feedbacks.length === 0) {
                  finalResult.feedbacks = result.feedbacks;
                }
                finalResult.feedbacks = finalResult.feedbacks.slice(0, 5);
                console.log("[grade-compare][bg] retry score:", finalResult.score);
              }
            }
          } catch (retryErr) {
            console.error("[grade-compare][bg] retry error:", retryErr.message);
          }
        }
      } catch (evalErr) {
        console.error("[grade-compare][bg] eval error:", evalErr.message);
      }

      // Supabase history 保存
      if (supabase) {
        try {
          const { error } = await supabase.from("history").insert({
            device_id:   userId || deviceId || "unknown",
            score:       finalResult.score ?? null,
            subject:     subject   || null,
            result_json: { ...finalResult, evalScore },
          });
          if (error) console.error("[grade-compare][supabase] insert error:", error.message);
          else       console.log("[grade-compare][supabase] history saved. score:", finalResult.score);
        } catch (sbErr) {
          console.error("[grade-compare][supabase] unexpected error:", sbErr.message);
        }
      }

      // 教科書RAG — pgvector → MongoDB regex → textbooks.json フォールバック
      if (finalResult.feedbacks && finalResult.feedbacks.length > 0) {
        try {
          let ragContext = null;

          if (supabase && openaiClient) {
            try {
              const issuesText = await extractIssues(answerText, modelText, subject);
              console.log(`[rag] extracted issues: ${issuesText}`);
              const embedding = await getEmbedding(issuesText);
              const hits = await vectorSearch(embedding, subject, 5);
              if (hits.length > 0) {
                ragContext = hits
                  .map((h, i) => `[${i + 1}] ${h.textbook_id || "教科書"} p.${h.page_num || "?"}: ${h.content.slice(0, 500)}`)
                  .join("\n");
                console.log("[rag] pgvector context ready");
              }
            } catch (pgErr) {
              console.warn("[rag] pgvector search failed:", pgErr.message);
            }
          }

          if (!ragContext) {
            const stepTexts = [
              finalResult.feedbacks?.[0]?.point,
              finalResult.answerSteps?.issueRecognition,
              finalResult.answerSteps?.premise,
              finalResult.answerSteps?.logic,
              finalResult.answerSteps?.conclusion,
              finalResult.modelSteps?.issueRecognition,
              finalResult.modelSteps?.premise,
              finalResult.modelSteps?.logic,
              finalResult.modelSteps?.conclusion,
            ].filter(Boolean).join(" ");
            const keywords = [...new Set(
              (stepTexts.match(/[一-龯ぁ-んァ-ヶーA-Za-z0-9]{2,20}/g) || [])
                .map(k => k.trim())
                .filter(k => !["不明", "なし", "自分", "模範", "答案", "解答"].includes(k))
            )].slice(0, 8);

            if (isMongoEnabled && Chunk) {
              try {
                if (keywords.length > 0) {
                  const filter = { content: { $regex: keywords.map(escapeRegExp).join("|"), $options: "i" } };
                  if (subject) filter.subject = subject;
                  const chunks = await Chunk.find(filter).limit(5).lean();
                  console.log(`[rag] MongoDB hits=${chunks.length} subject=${subject || "all"} keywords=${keywords.join(",")}`);
                  if (chunks.length > 0) {
                    ragContext = chunks
                      .map((c, i) => `[${i + 1}] ${c.textbookId || "教科書"} p.${c.pageNum}: ${c.content.slice(0, 500)}`)
                      .join("\n");
                  }
                }
              } catch (mongoErr) {
                console.error("[rag] MongoDB search error, falling back to JSON:", mongoErr.message);
              }
            }

            if (!ragContext) {
              const fallbackEntries = [...textbookCache.entries()]
                .filter(([, book]) => !subject || book.subject === subject);
              let fallbackPages = [];
              for (const [bookId, book] of fallbackEntries) {
                for (const page of book.pages || []) {
                  const combined = buildPageContent(page);
                  if (keywords.length === 0 || keywords.some(k => combined.includes(k))) {
                    fallbackPages.push({ bookId, bookName: book.bookName, pageNum: page.pageNum, text: combined });
                  }
                  if (fallbackPages.length >= 5) break;
                }
                if (fallbackPages.length >= 5) break;
              }
              if (fallbackPages.length === 0) {
                for (const [bookId, book] of fallbackEntries) {
                  for (const page of book.pages || []) {
                    fallbackPages.push({ bookId, bookName: book.bookName, pageNum: page.pageNum, text: buildPageContent(page) });
                    if (fallbackPages.length >= 5) break;
                  }
                  if (fallbackPages.length >= 5) break;
                }
              }
              if (fallbackPages.length > 0) {
                ragContext = fallbackPages
                  .map((p, i) => `[${i + 1}] ${p.bookName || p.bookId} p.${p.pageNum}: ${p.text.slice(0, 500)}`)
                  .join("\n");
                console.log(`[rag] JSON fallback hits=${fallbackPages.length} subject=${subject || "all"}`);
              }
            }
          }

          if (ragContext) {
            const ragRes = await client.messages.create({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 400,
              messages: [{
                role: "user",
                content: `以下の教科書記述を参考に添削してください。指摘内容に関連する記述を100字以内で引用してください。なければ空文字で返してください。
指摘: ${finalResult.feedbacks[0].point}
教科書記述:
${ragContext}`,
              }],
            });
            textbookRef = ragRes.content[0].text.trim() || undefined;
          }
        } catch (_) {}
      }

      evalJobStore.set(jobId, {
        status: "done",
        createdAt: Date.now(),
        evalScore,
        improvements: evalImprovements,
        textbookRef: textbookRef ?? undefined,
      });
      console.log("[grade-compare][bg] job done:", jobId, "evalScore:", evalScore);
    })().catch(bgErr => {
      console.error("[grade-compare][bg] fatal:", bgErr.message);
      evalJobStore.set(jobId, { status: "done", createdAt: Date.now(), evalScore: 70, improvements: [] });
    });

  } catch (err) {
    console.error("/grade-compare error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Global error handler (must be last middleware) ----
// Express のデフォルト HTML エラーページではなく常に JSON を返す
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[global-error]", err.message, err.stack?.split("\n")[1] || "");
  const status = err.status || err.statusCode || 500;
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "PDFファイルが大きすぎます（最大50MB）。", code: "LIMIT_FILE_SIZE" });
  }
  res.status(status).json({ error: err.message || "Internal server error" });
});

// ---- Helpers ----
// base64 先頭シグネチャから MIME タイプを判定する
function detectMediaType(base64) {
  if (!base64 || typeof base64 !== 'string') return 'image/jpeg';
  if (base64.startsWith('/9j/'))   return 'image/jpeg';
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('UklGR')) return 'image/webp';
  if (base64.startsWith('R0lGO')) return 'image/gif';
  return 'image/jpeg';
}

// ---- Backup: Export ----
app.get("/backup/export", async (req, res) => {
  try {
    if (!isMongoEnabled || !Textbook || !Chunk) {
      return res.status(503).json({ error: "MongoDB が無効です。バックアップには MongoDB が必要です。" });
    }
    const [textbooks, chunks] = await Promise.all([
      Textbook.find({}).lean(),
      Chunk.find({}).lean(),
    ]);
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      textbooks,
      chunks,
    };
    res.setHeader("Content-Disposition", `attachment; filename="studyapp-backup-${Date.now()}.json"`);
    res.setHeader("Content-Type", "application/json");
    res.json(backup);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Backup: Import / Restore ----
app.post("/backup/import", async (req, res) => {
  try {
    if (!isMongoEnabled || !Textbook || !Chunk) {
      return res.status(503).json({ error: "MongoDB が無効です。インポートには MongoDB が必要です。" });
    }
    const { textbooks = [], chunks = [] } = req.body;
    if (!Array.isArray(textbooks) || !Array.isArray(chunks)) {
      return res.status(400).json({ error: "textbooks と chunks は配列である必要があります。" });
    }

    let textbookCount = 0;
    for (const tb of textbooks) {
      const { _id, __v, ...data } = tb;
      await Textbook.findOneAndUpdate(
        { textbookId: data.textbookId },
        { $set: data },
        { upsert: true, new: true }
      );
      textbookCount++;
    }

    const textbookIds = [...new Set(chunks.map(c => c.textbookId).filter(Boolean))];
    for (const textbookId of textbookIds) {
      await Chunk.deleteMany({ textbookId });
    }
    let chunkCount = 0;
    if (chunks.length > 0) {
      const cleanChunks = chunks.map(({ _id, __v, ...c }) => c);
      await Chunk.insertMany(cleanChunks);
      chunkCount = chunks.length;
    }

    res.json({ ok: true, restored: { textbooks: textbookCount, chunks: chunkCount } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`サーバー起動中: http://0.0.0.0:${PORT} (PORT env=${process.env.PORT})`);
    console.log(`[registerJobMap] 起動時サイズ: ${registerJobMap.size}`);
    if (isMongoEnabled) {
      await connectMongo();
    }
  });
}
module.exports = app;
module.exports.extractIssues = extractIssues;
module.exports.getEmbedding  = getEmbedding;
module.exports.splitIntoSemanticChunks = splitIntoSemanticChunks;
module.exports.extractTopicsFromChunks = extractTopicsFromChunks;
module.exports.registerJobMap = registerJobMap;
module.exports.pruneRegisterJobMap = pruneRegisterJobMap;
module.exports.REGISTER_JOB_MAX = REGISTER_JOB_MAX;
