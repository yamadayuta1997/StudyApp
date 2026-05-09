# 機能詳細書（ユーザーフロー）

> 生成日: 2026-05-09  
> 対象バージョン: 1.0.0  
> ブランチ: main

---

## 目次

1. [教科書登録フロー](#1-教科書登録フロー)
2. [採点フロー](#2-採点フロー)
3. [比較添削フロー](#3-比較添削フロー)
4. [苦手分析の集計ロジック](#4-苦手分析の集計ロジック)

---

## 1. 教科書登録フロー

### 概要

教科書PDFをアップロードし、テキスト抽出・図解解析・埋め込み生成を行ってRAGシステムに登録する。

### ユーザーフロー

```
[教材タブ] → [「＋ 教科書を登録」タップ]
    ↓
[登録モーダル表示]
    ↓ 科目・教科書名・説明を入力
[「PDFを選択して登録」タップ]
    ↓ DocumentPickerでPDFを選択（最大50MB）
    ↓ サイズ超過 → エラー表示（終了）
[登録内容確認画面]
    ↓ 500ページ超 → 警告表示
[「登録を確定する」タップ]
    ↓
[サーバーへPOST /textbook/register]
    ↓ 重複 (409) → 「上書きしますか？」ダイアログ
    │   → キャンセル → 確認画面に戻る
    │   → 上書き → overwrite=trueで再リクエスト
    ↓ 上限超過 (422) → エラー表示（終了）
    ↓ 202 Accepted（jobId発行）
[3秒ごとにGET /textbook/register/status/:jobId でポーリング]
    ↓
[進捗バー更新]
    ↓ status=error → エラー表示（終了）
    ↓ status=done
[登録完了画面（✅）]→ 教科書一覧にリロード
```

### バックグラウンド処理シーケンス（サーバー側）

```
[Phase 1] PDF解析（pdf-parse）
    → pages[] にページ番号・テキストを格納
    → テキストが少ないページ（<50字）を diagramPageNums に記録

[Phase 2] Supabase Storage アップロード（非同期・失敗は非致命的）
    → textbooks バケットに bookId.pdf として保存
    → 成功時: pdfStorageUrl をキャッシュに書き込み

[Phase 3] 図解ページの Claude Vision 解析（32MB以下のPDFのみ）
    → claude-sonnet-4-6 に PDF全体を base64 で渡す
    → 【ページX】形式で各図解ページの内容を取得
    → pages[] の diagramDescription フィールドに追記
    → 失敗は非致命的（警告ログのみ）

[Phase 4] セマンティックチャンク分割
    → 見出しパターン（第X章・【論点名】・■等）で段落分割
    → 500字超の段落は句読点で追加分割
    → topicName・importance・chunkIndex を付与

[Phase 5] MongoDB 保存（有効時のみ）
    → Textbook ドキュメントを upsert
    → Chunk ドキュメントを全削除→一括挿入

[Phase 6] 埋め込み生成 → Supabase topics 挿入（OpenAI有効時のみ）
    → text-embedding-3-small で並列5件ずつ生成
    → topics テーブルに100件ずつバッチ挿入
    → MongoDB Chunk に embedding を bulkWrite で書き戻し

[完了] status=done, jobId を1時間後に自動削除
```

### エラー・タイムアウト条件

| 条件 | ステータス | 挙動 |
|------|-----------|------|
| ファイルサイズ > 50MB | 413 (multer LIMIT_FILE_SIZE) | クライアントにエラー表示 |
| PDFパース失敗 | 400 PARSE_ERROR | クライアントにエラー表示 |
| 重複bookId（上書き未指定）| 409 duplicate | 上書き確認ダイアログ |
| 登録件数上限（デフォルト20件）| 422 limit_exceeded | エラー表示・削除を促す |
| Supabase Storage 失敗 | 非致命的 | 警告ログのみ・処理継続 |
| 図解解析失敗 | 非致命的 | 警告ログのみ・処理継続 |
| バックグラウンド全体失敗 | status=error | ポーリングでエラー検知・表示 |
| アップロードタイムアウト（60秒）| AbortError | 「タイムアウト」エラー表示 |
| ポーリング中の通信エラー | — | 「状態確認に失敗」エラー表示 |

---

## 2. 採点フロー

### 概要

問題文と答案（テキスト／画像）をAIに渡して採点・フィードバックを受け取り、履歴として保存する。

### ユーザーフロー

```
[採点タブ]
    ↓ 科目を選択
    ↓ 問題文を入力（テキスト or PDF or カメラ）
    ↓ 答案を入力（テキスト or 画像撮影 or ライブラリ）
    ↓ 教科書選択（任意）・ページ範囲指定（任意）
    ↓ 問題テンプレート保存（任意）
[「採点する」タップ]
    ↓
[POST /grade]
    ↓ 採点中インジケーター表示
    ↓ エラー（通信失敗等）→ エラー表示
[結果表示]
    ↓ 得点率・論点・誤答論点・参考ページ・解説まとめ
    ↓ 論点評価（✅正しく言及 / ❌抜けている / ⚠️不要）
    ↓ 「AIに質問」チャット（POST /chat）
    ↓ 「共有」「クリップボードコピー」
    ↓ 「再採点」タップ → 差分比較
[AsyncStorage + Supabase に履歴保存]
    ↓
[苦手論点テーブル(cautionTopics)を更新]
```

### サーバー側処理シーケンス

```
[POST /grade 受信]
    ↓
[1] RAG コンテキスト構築
    → pgvector（Supabase + OpenAI 有効時）:
        問題文+答案を text-embedding-3-small で埋め込み
        → vectorSearch で上位5件取得
    → フォールバック: bookIds[] の textbookCache から全ページ取得

[2] 論点抽出（sourceBookId 指定時のみ）
    → 指定ページ範囲のチャンクテキストを取得
        (MongoDB優先 → textbooks.json フォールバック)
    → claude-haiku-4-5-20251001 に論点を3件以内で抽出させる

[3] プロンプト構築
    → 教科書コンテキスト + 問題文 + 答案 + 画像（base64）
    → 図表採点基準（仕訳・T字勘定・B/S等の部分点ルール）
    → 論点リスト（抽出成功時）

[4] claude-sonnet-4-5 で採点
    → max_tokens: 2000
    → 【得点率】【論点】【誤答論点】【参考ページ】【解説まとめ】【論点評価】を解析

[5] Supabase history テーブルに保存（失敗しても採点結果は返す）
    → device_id / score / subject / result_json

[6] JSON レスポンスを返す
    → result: フルテキスト
    → score, topics, wrongTopics, refPages, summary, topicList, topicEvaluation
```

### エラー・タイムアウト条件

| 条件 | 挙動 |
|------|------|
| question / answer / subject 未入力 | 400エラー |
| pgvector 検索失敗 | bookIds フォールバックへ切り替え |
| 論点抽出失敗 | topicList=[] として採点を継続 |
| claude API エラー | 500エラー・クライアントにエラー表示 |
| Supabase 保存失敗 | 非致命的・採点結果は正常返却 |
| レート制限（10回/分） | 429・1分後に再試行を促す |

---

## 3. 比較添削フロー

### 概要

手書き答案と模範解答の画像を比較し、思考プロセスの差分を解析する。評価品質が低い場合はバックグラウンドで再採点を行う。

### ユーザーフロー

```
[比較添削タブ]
    ↓ 科目を選択
    ↓ 採点基準を選択（バランス型 / 論点重視 / 計算重視）
    ↓
[答案画像を選択]（カメラ or ライブラリ、最大10枚）
    ↓ 並び替え（ドラッグ&ドロップ）可能
    ↓
[模範解答を入力]（画像 or テキスト直接入力）
    ↓
[利用回数チェック]（デイリー上限: DAILY_LIMIT）
    ↓ 上限到達 → 「上限に達しました」表示（終了）
    ↓
[「比較採点する」タップ]
    ↓ 「読み取り中」→「採点中」のステップ表示
    ↓
[POST /grade-compare]
    ↓ エラー → エラー表示
[結果表示]
    ↓ スコア / 合否（80点以上で合格）
    ↓ 致命的ミス件数 / 途中式欠落フラグ
    ↓ 思考ステップ比較（論点認識・前提・ロジック・結論）
    ↓ フィードバック一覧（優先度順）
    ↓ 教科書参照テキスト（RAG結果、非同期で取得）
    ↓
[フィードバックタップ] → 詳細モーダル表示
    ↓
[「共有」「コピー」]
[AsyncStorage + Supabase に履歴保存]
    ↓
[苦手論点テーブル(cautionTopics)を更新]
```

### サーバー側処理シーケンス

```
[POST /grade-compare 受信]
    ↓
[1] OCR 並列実行（claude-sonnet-4-6）
    → 答案画像: HANDWRITING_OCR_PROMPT で書き起こし
    → 模範解答画像（テキスト未指定時）: MODEL_ANSWER_OCR_PROMPT で書き起こし
    → 複数ページ: 1リクエストにまとめて送信（「【1ページ目】...」形式）
    → 模範解答テキストが取得できない場合 → 400エラー

[2] 採点（ホットパス） — claude-sonnet-4-6 + tool_use
    → grade_answer ツールで JSON 構造を強制取得
    → フィールド: score / passed / fatalErrors / missingProcess
              / answerSteps / modelSteps / feedbacks（1〜5件）
    → stop_reason=max_tokens → 500エラー
    → tool_use ブロック未取得 → 500エラー
    → score 欠落 → 500エラー
    → feedbacks 空 → デフォルトフィードバックを補填

[3] 採点結果を即時レスポンスとして返却（jobId付き）

[4] バックグラウンド処理（非同期）
    │
    ├─ [4a] 品質評価（claude-haiku-4-5-20251001 + evaluate_grade ツール）
    │    → evalScore 0〜100を取得
    │    → evalScore < 60 → 採点をリトライ（claude-sonnet-4-6）
    │        → リトライ成功時は finalResult を更新
    │
    ├─ [4b] Supabase history 保存
    │    → device_id / score / subject / result_json（evalScore含む）
    │    → 失敗は非致命的
    │
    └─ [4c] 教科書RAG（テキスト参照の取得）
         → pgvector（Supabase + OpenAI 有効時）:
              extractIssues → claude-haiku で論点を抽出
              → text-embedding-3-small で埋め込み
              → vectorSearch で上位5件取得
         → MongoDB フォールバック:
              feedbacks・answerSteps からキーワード抽出
              → Chunk コレクションで正規表現検索（上位5件）
         → JSON キャッシュフォールバック:
              textbookCache から同科目ページをキーワード検索
         → claude-haiku-4-5-20251001 で100字以内の引用文を生成
         → textbookRef として evalJobStore に保存

[5] クライアントが GET /grade-compare/eval-status/:jobId でポーリング
    → status=done 時に evalScore / improvements / textbookRef を取得
    → ジョブは10分後に自動削除
```

### エラー・タイムアウト条件

| 条件 | 挙動 |
|------|------|
| 答案画像未指定 | 400エラー |
| 模範解答未指定（画像もテキストもなし）| 400エラー |
| OCR 失敗 | 500エラー |
| 採点レスポンス truncated (max_tokens) | 500エラー・再試行を促す |
| tool_use ブロック未取得 | 500エラー |
| デイリー利用上限到達 | クライアント側で制御・上限メッセージ表示 |
| レート制限（10回/分） | 429・1分後に再試行を促す |
| 品質評価失敗（バックグラウンド）| evalScore=70, improvements=[] を使用・継続 |
| RAG 失敗（バックグラウンド）| textbookRef 未設定のまま継続 |
| 採点基準カスタマイズ（issue_focus / calculation_focus）| プロンプトに基準コンテキストを追記 |
| 過去の改善指示（promptTips）| 最新3件をプロンプトに追加 |

---

## 4. 苦手分析の集計ロジック

### 概要

採点結果・比較添削結果から誤答パターンを集計し、科目別・論点別の苦手度を算出する。

### データソースと集計方法

```
[入力データ]
    ├─ regularItems（採点履歴）: { wrongTopics: string[] }
    │   採点結果の【誤答論点】から抽出されたトピック名
    │
    └─ compareItems（比較添削履歴）: { result.feedbacks: { type: string }[] }
        比較添削の feedbacks.type（論点誤認 / 思考プロセスミス / 計算ミス等）

[集計処理 — computeWeakness()]
    ↓
    compareItems の各 feedbacks.type をカウント
    + regularItems の各 wrongTopics をカウント
    ↓
    カウント降順にソート → 上位 limit 件（デフォルト3件）を返す
    → WeakPoint[] = { type: string; count: number }[]
```

### 科目別統計（AnalyticsScreen）

```
[AsyncStorage から履歴をロード]
    ↓
[科目ごとに採点履歴をグループ化]
    → count: 採点回数
    → avgScore: 得点率の平均（null は除外）
    → lastScore: 最新得点率
    → trend: 直近3回の得点率を比較
        → 最新 > 3件前の最初 → "up"
        → 最新 < 3件前の最初 → "down"
        → それ以外 → "stable"

[上位5件の誤答論点を集計]
    → 全採点履歴の wrongTopics をフラット化してカウント
    → 降順ソートで top5 を表示

[POST /study-tip でパーソナライズアドバイス取得]
    → 科目 / avgScore / wrongTopicsRanked / improvedTopics を送信
    → claude-sonnet-4-6 が論点別アドバイスを生成
```

### 苦手論点テーブル（cautionTopics）の更新

```
[採点完了後 / 比較添削完了後]
    ↓
[updateCautionTopics() を呼び出し]
    → AsyncStorage の "caution_topics" キーを読み込み
    → 誤答論点を追加・カウントを更新
    → "caution_topics" キーに書き戻し

[AnalyticsScreen で getCautionTopics() を呼び出し]
    → 最近ミスした論点を表示
    → 最近ミスのない論点 → improvedTopics に分類
```

### Supabase history テーブルの活用

```
[採点・比較添削完了時にサーバーから history に保存]
    device_id（userId または deviceId）
    score（得点率 0〜100）
    subject（科目名）
    result_json（採点フルデータ）

[週次学習レポート POST /study-report]
    → クライアントから過去7日分の採点・比較添削データを送信
    → claude-sonnet-4-6 が今週の成果・改善論点・来週提案を生成
    → achievements / improvements / suggestions に分割して返却
```

---

## 付記: フロー間の連携

```
教科書登録
    └─→ RAG コンテキスト（採点・比較添削の両フローで参照）
            → pgvector（Supabase topics テーブル）
            → MongoDB Chunk コレクション
            → textbookCache（JSON フォールバック）

採点フロー
    └─→ AsyncStorage（履歴保存）
    └─→ Supabase history（クラウドバックアップ）
    └─→ cautionTopics（苦手論点テーブル更新）
    └─→ AnalyticsScreen（科目別統計・スタディーTIP）

比較添削フロー
    └─→ AsyncStorage（比較履歴保存）
    └─→ Supabase history（クラウドバックアップ）
    └─→ cautionTopics（フィードバックタイプで更新）
    └─→ AnalyticsScreen（弱点分析・週次レポート）
```
