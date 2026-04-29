const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");
const multer = require("multer");

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 採点 + 得点率を返す
app.post("/grade", async (req, res) => {
  try {
    const { question, answer, subject } = req.body;
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

// PDF抽出（ページ範囲指定対応）
app.post("/extract-pdf", upload.single("pdf"), async (req, res) => {
  try {
    const fromPage = parseInt(req.body.fromPage) || 1;
    const toPageReq = parseInt(req.body.toPage) || null;

    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(req.file.buffer) });
    const pdfDocument = await loadingTask.promise;
    const totalPages = pdfDocument.numPages;
    const endPage = toPageReq ? Math.min(toPageReq, totalPages) : totalPages;

    let fullText = "";
    for (let i = fromPage; i <= endPage; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(" ");
      fullText += `--- ${i}ページ ---\n${pageText}\n`;
    }

    res.json({ text: fullText, totalPages, fromPage, toPage: endPage });
  } catch (e) {
    console.error("/extract-pdf error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// 画像（写真・手書き答案）からテキスト抽出
app.post("/extract-image", upload.single("image"), async (req, res) => {
  try {
    const imageBase64 = req.file.buffer.toString("base64");
    const mediaType = req.file.mimetype;

    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageBase64 },
          },
          {
            type: "text",
            text: "この画像に書かれている答案・文字をすべて正確にテキストとして書き起こしてください。数式・記号・箇条書きも含めてできる限り忠実に転写してください。余分な説明は不要です。",
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

// 苦手科目の学習アドバイス
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
