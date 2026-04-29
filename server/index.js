const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");
const multer = require("multer");

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// pdfjs をキャッシュして workerSrc を無効化（サーバーサイド用）
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
        content: `あなたは公認会計士試験の採点官です。科目は「${subject}」です。以下の問題と答案を採点してください。\n\n【問題】\n${question}\n\n【答案】\n${answer}\n\n正誤判定と改善点を丁寧に説明してください。最後に必ず「【得点率】XX%」という形式で数値を記載してください。`,
      }],
    });
    const resultText = message.content[0].text;
    const scoreMatch = resultText.match(/【得点率】(\d+)%/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : null;
    res.json({ result: resultText, score });
  } catch (e) {
    console.error("/grade error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/extract-pdf", upload.single("pdf"), async (req, res) => {
  try {
    // ファイル未受信チェック（Web側のFormData不備を検出）
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
      console.error("pdfjs getDocument error:", pdfErr.message);
      return res.status(400).json({
        error: `PDFの解析に失敗しました: ${pdfErr.message}。破損したファイルや、パスワード保護されたPDFは読み込めません。`,
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
      const pageText = textContent.items
        .filter((item) => "str" in item)
        .map((item) => item.str)
        .join(" ")
        .trim();
      if (pageText) {
        fullText += `--- ${i}ページ ---\n${pageText}\n\n`;
      }
    }

    if (!fullText.trim()) {
      return res.status(400).json({
        error: "PDFからテキストを抽出できませんでした。スキャン画像型PDFの可能性があります。その場合は「カメラで撮影」または「画像から読み込む」機能をご利用ください。",
        code: "NO_TEXT",
      });
    }

    res.json({ text: fullText, totalPages, fromPage, toPage: endPage });
  } catch (e) {
    console.error("/extract-pdf error:", e.message, e.stack);
    res.status(500).json({ error: `サーバーエラー: ${e.message}`, code: "SERVER_ERROR" });
  }
});

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

app.post("/study-tip", async (req, res) => {
  try {
    const { subject, avgScore } = req.body;
    const scoreContext = avgScore !== null && avgScore !== undefined
      ? `これまでの平均得点率は${avgScore}%です。`
      : "";
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`サーバー起動中: http://localhost:${PORT}`);
});
