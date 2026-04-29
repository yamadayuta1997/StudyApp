const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");
const multer = require("multer");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.post("/grade", async (req, res) => {
  const { question, answer, subject } = req.body;

  const message = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `あなたは公認会計士試験の採点官です。科目は「${subject}」です。以下の問題と答案を採点してください。\n\n【問題】\n${question}\n\n【答案】\n${answer}\n\n正誤判定と改善点を教えてください。`,
      },
    ],
  });

  res.json({ result: message.content[0].text });
});

app.post("/extract-pdf", upload.single("pdf"), async (req, res) => {
  try {
    console.log("PDF受信:", req.file ? req.file.originalname : "ファイルなし");

    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(req.file.buffer),
    });
    const pdfDocument = await loadingTask.promise;

    let fullText = "";
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(" ");
      fullText += pageText + "\n";
    }

    console.log("PDF解析成功:", fullText.slice(0, 100));
    res.json({ text: fullText });
  } catch (e) {
    console.error("PDFエラー:", e.message);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`サーバー起動中: http://localhost:${PORT}`);
});
