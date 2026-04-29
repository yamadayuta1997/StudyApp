const BASE = "https://studyapp-production-66d5.up.railway.app";
const MAX_RETRY = 3;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runTests() {
  const results = [];
  // 1. ヘルスチェック
  try {
    const r = await fetch(`${BASE}/health`);
    const d = await r.json();
    results.push({ test: "health", ok: d.status === "ok", detail: d });
  } catch(e) { results.push({ test: "health", ok: false, detail: e.message }); }
  // 2. 教科書リスト取得
  try {
    const r = await fetch(`${BASE}/textbook/list`);
    const d = await r.json();
    results.push({ test: "textbook/list", ok: Array.isArray(d.books), detail: `${d.books?.length}件` });
  } catch(e) { results.push({ test: "textbook/list", ok: false, detail: e.message }); }
  // 3. 採点API（論点・解説まとめ確認）
  try {
    const r = await fetch(`${BASE}/grade`, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ subject: "財務会計論", question: "減価償却の目的を説明しなさい。", answer: "固定資産の取得原価を耐用年数にわたって費用配分すること。", bookIds: [] })
    });
    const d = await r.json();
    const ok = !!d.result && d.score !== undefined && Array.isArray(d.topics) && d.summary !== undefined;
    results.push({ test: "grade+summary", ok, detail: { score: d.score, summary: d.summary?.slice(0,30), refPages: d.refPages }});
  } catch(e) { results.push({ test: "grade+summary", ok: false, detail: e.message }); }
  // 4. study-tip
  try {
    const r = await fetch(`${BASE}/study-tip`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ subject: "監査論", avgScore: 55 }) });
    const d = await r.json();
    results.push({ test: "study-tip", ok: !!d.tip, detail: d.tip?.slice(0,30) });
  } catch(e) { results.push({ test: "study-tip", ok: false, detail: e.message }); }
  // 5. chat API
  try {
    const r = await fetch(`${BASE}/chat`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ subject: "財務会計論", context: "減価償却で80%", messages: [{ role: "user", content: "定率法と定額法の違いは？" }] }) });
    const d = await r.json();
    results.push({ test: "chat", ok: !!d.reply, detail: d.reply?.slice(0,30) });
  } catch(e) { results.push({ test: "chat", ok: false, detail: e.message }); }
  // 6. textbook/search
  try {
    const r = await fetch(`${BASE}/textbook/search`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ query: "減価償却" }) });
    const d = await r.json();
    results.push({ test: "textbook/search", ok: Array.isArray(d.results), detail: `${d.results?.length}件ヒット` });
  } catch(e) { results.push({ test: "textbook/search", ok: false, detail: e.message }); }
  return results;
}

async function main() {
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    console.log(`\n===== QA実行 (${attempt}/${MAX_RETRY}) =====`);
    console.log("Railwayデプロイ完了を60秒待機...");
    await sleep(60000);
    const results = await runTests();
    let allOk = true;
    results.forEach(r => {
      const icon = r.ok ? "✅" : "❌";
      console.log(`${icon} ${r.test}: ${JSON.stringify(r.detail)}`);
      if (!r.ok) allOk = false;
    });
    if (allOk) { console.log("\n🎉 全テスト合格！"); process.exit(0); }
    else if (attempt < MAX_RETRY) { console.log(`\n⚠️ 失敗あり。30秒後にリトライ...`); await sleep(30000); }
  }
  console.log("\n❌ QA最終失敗。ログを確認してください。");
  process.exit(1);
}
main();
