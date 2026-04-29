const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");
const multer = require("multer");

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

let _pdfjsLib = null;
async function getPdfjsLib() {
  if (!_pdfjsLib) {
    _pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    _pdfjsLib.GlobalWorkerOptions.workerSrc = "";
  }
  return _pdfjsLib;
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 採点 + 得点率・論点・誤答論点を返す
app.post("/grade", async (req, res) => {
  try {
    const { question, answer, subject } = req.body;
    if (!question || !answer || !subject) {
      return res.status(400).json({ error: "question・answer・subject は必須です。" });
    }
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: `あなたは公認会計士試験の採点官です。科目は「${subject}」です。以下の問題と答案を採点してください。\n\n【問題】\n${question}\n\n【答案】\n${answer}\n\n正誤判定と改善点を丁寧に説明してください。最後に必ず以下の形式で記載してください：\n【得点率】XX%\n【論点】論点名1, 論点名2（この問題で問われた主要な論点を3つ以内でカンマ区切り）\n【誤答論点】論点名（間違えた・不十分だった論点。完答の場合は「なし」）`,
      }],
    });
    const resultText = message.content[0].text;
    const scoreMatch = resultText.match(/【得点率】(\d+)%/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : null;
    const topicsMatch = resultText.match(/【論点】(.+)/);
    const wrongMatch = resultText.match(/【誤答論点】(.+)/);
    const topics = topicsMatch ? topicsMatch[1].split(",").map(s => s.trim()).filter(Boolean) : [];
    const wrongTopics = wrongMatch && wrongMatch[1].trim() !== "なし"
      ? wrongMatch[1].split(",").map(s => s.trim()).filter(Boolean)
      : [];
    res.json({ result: resultText, score, topics, wrongTopics });
  } catch (e) {
    console.error("/grade error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// PDF抽出（ページ範囲指定対応）
app.post("/extract-pdf", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "PDFファイルを受信できませんでした。ファイルが正しく送信されているか確認してください。",
        code: "NO_FILE",
      });
    }
    const fromPage = Math.max(1, parseInt(req.body.fromPage) || 1);
    const toPageReq = parseInt(req.body.toPage) || null;
    const pdfjsLib = await getPdfjsLib();
    let pdfDocument;
    try {
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(req.file.buffer),
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
      });
      pdfDocument = await loadingTask.promise;
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
    for (let i = fromPage; i <= endPage; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.filter(item => "str" in item).map(item => item.str).join(" ").trim();
      if (pageText) fullText += `--- ${i}ページ ---\n${pageText}\n\n`;
    }
    if (!fullText.trim()) {
      return res.status(400).json({
        error: "PDFからテキストを抽出できませんでした。スキャン画像型PDFの場合は「カメラで撮影」機能をご利用ください。",
        code: "NO_TEXT",
      });
    }
    res.json({ text: fullText, totalPages, fromPage, toPage: endPage });
  } catch (e) {
    console.error("/extract-pdf error:", e.message);
    res.status(500).json({ error: `サーバーエラー: ${e.message}`, code: "SERVER_ERROR" });
  }
});

// 画像（写真・手書き答案）からテキスト抽出
app.post("/extract-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "画像ファイルを受信できませんでした。", code: "NO_FILE" });
    }
    const imageBase64 = req.file.buffer.toString("base64");
    const mediaType = req.file.mimetype || "image/jpeg";
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: "この画像に書かれている答案・文字をすべて正確にテキストとして書き起こしてください。数式・記号・箇条書きも含めてできる限り忠実に転写してください。余分な説明は不要です。" },
        ],
      }],
    });
    res.json({ text: message.content[0].text });
  } catch (e) {
    console.error("/extract-image error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// 苦手科目の学習アドバイス
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

// 採点後の質問チャット
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`サーバー起動中: http://0.0.0.0:${PORT}`);
});
