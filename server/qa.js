const BASE_URL = process.env.QA_BASE_URL || "https://studyapp-production-66d5.up.railway.app";
const WAIT_BEFORE_START = 60000;
const RETRY_WAIT = 30000;
const MAX_RETRY = 3;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
  const results = [];

  // Test 1: health
  try {
    const res = await fetch(`${BASE_URL}/health`);
    const data = await res.json();
    results.push({ name: "health", pass: data.status === "ok", detail: JSON.stringify(data) });
  } catch (e) {
    results.push({ name: "health", pass: false, detail: e.message });
  }

  // Test 2: grade + topics extraction
  try {
    const res = await fetch(`${BASE_URL}/grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "のれんの定義を述べよ。",
        answer: "のれんとは、企業結合において取得した被取得企業の純資産の公正価値を超えて支払った対価の超過額である。",
        subject: "財務会計論",
      }),
    });
    const data = await res.json();
    const pass = typeof data.result === "string" && data.result.length > 0 && Array.isArray(data.topics);
    results.push({
      name: "grade+topics",
      pass,
      detail: `score=${data.score}, topics=${JSON.stringify(data.topics)}, wrongTopics=${JSON.stringify(data.wrongTopics)}`,
    });
  } catch (e) {
    results.push({ name: "grade+topics", pass: false, detail: e.message });
  }

  // Test 3: study-tip
  try {
    const res = await fetch(`${BASE_URL}/study-tip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: "監査論", avgScore: 55 }),
    });
    const data = await res.json();
    const pass = typeof data.tip === "string" && data.tip.length > 0;
    results.push({ name: "study-tip", pass, detail: `tip length=${data.tip?.length}` });
  } catch (e) {
    results.push({ name: "study-tip", pass: false, detail: e.message });
  }

  // Test 4: chat
  try {
    const res = await fetch(`${BASE_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "のれんの償却について教えてください。" }],
        subject: "財務会計論",
        context: "のれんの問題に関する採点結果",
      }),
    });
    const data = await res.json();
    const pass = typeof data.reply === "string" && data.reply.length > 0;
    results.push({ name: "chat", pass, detail: `reply length=${data.reply?.length}` });
  } catch (e) {
    results.push({ name: "chat", pass: false, detail: e.message });
  }

  return results;
}

async function main() {
  console.log(`\n🔍 自動QA開始 - BASE_URL: ${BASE_URL}`);
  console.log(`⏳ Railwayデプロイ完了を待機中... (${WAIT_BEFORE_START / 1000}秒)`);
  await sleep(WAIT_BEFORE_START);

  let attempt = 0;
  while (attempt < MAX_RETRY) {
    attempt++;
    console.log(`\n🧪 テスト実行 (${attempt}/${MAX_RETRY})`);
    const results = await runTests();

    let allPass = true;
    results.forEach(r => {
      const icon = r.pass ? "✅" : "❌";
      console.log(`  ${icon} ${r.name}: ${r.detail}`);
      if (!r.pass) allPass = false;
    });

    if (allPass) {
      console.log("\n🎉 全テスト合格！");
      process.exit(0);
    }

    if (attempt < MAX_RETRY) {
      console.log(`\n⚠️ 失敗あり。${RETRY_WAIT / 1000}秒後にリトライ...`);
      await sleep(RETRY_WAIT);
    }
  }

  console.log("\n💥 最大リトライ回数に達しました。QA失敗。");
  process.exit(1);
}

main();
