# StudyApp 現状仕様書

> 生成日: 2026-05-09  
> 対象バージョン: 1.0.0  
> ブランチ: main

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [画面一覧](#2-画面一覧)
3. [APIエンドポイント一覧](#3-apiエンドポイント一覧)
4. [主要型定義](#4-主要型定義)
5. [データ永続化](#5-データ永続化)
6. [利用Claudeモデル](#6-利用claudeモデル)

---

## 1. プロジェクト概要

| 項目 | 内容 |
|------|------|
| アプリ名 | StudyApp |
| 用途 | 公認会計士試験 学習支援アプリ |
| フレームワーク | React Native (Expo) + TypeScript |
| バックエンド | Node.js / Express |
| DB | Supabase (PostgreSQL + pgvector) / MongoDB |
| API URL | `https://studyapp-production-66d5.up.railway.app` |
| 対応科目 | 財務会計論・管理会計論・監査論・企業法・租税法・経営学 |

---

## 2. 画面一覧

### 2.1 タブナビゲーション構成 (`app/(tabs)/_layout.tsx`)

| タブ番号 | ラベル | ルート | コンポーネントファイル |
|----------|--------|--------|----------------------|
| 1 | ホーム | `/(tabs)/index` | `index.tsx` |
| 2 | 採点 | `/(tabs)/answer` | `answer.tsx` |
| 3 | 分析 | `/(tabs)/analytics` | `analytics.tsx` |
| 4 | 履歴 | `/(tabs)/explore` | `explore.tsx` |
| 5 | 教材 | `/(tabs)/textbook` | `textbook.tsx` |
| 6 | カレンダー | `/(tabs)/calendar` | `calendar.tsx` |
| 7 | 比較添削 | `/(tabs)/compare` | `compare.tsx` |
| 8 | 比較履歴 | `/(tabs)/history` | `history.tsx` |
| 9 | 設定 | `/(tabs)/settings` | `settings.tsx` |

---

### 2.2 ホーム画面 (`index.tsx`)

**ルート:** `/(tabs)/index`

#### 主要状態

| 状態変数 | 型 | 説明 |
|----------|----|------|
| `stats` | `DashboardStats` | 累計・今日・ストリーク・平均点・弱点科目 |
| `dailyTip` | `string` | AIからの今日のアドバイス |
| `cautionTopics` | `CautionTopic[]` | 3連続不正解の注意トピック |
| `overdueTopics` | `CautionTopic[]` | 復習期限切れトピック |
| `userName` | `string` | AsyncStorage から取得するユーザー名 |
| `weeklyReport` | `WeeklyReport \| null` | 毎週月曜に表示する週次レポート |

#### 主要UI・機能

- ダッシュボードカード（累計・今日の回数・ストリーク・平均点）
- ユーザープロフィールカード（名前編集・ログアウト）
- 注意トピックアラート（赤フラグ）
- 復習リマインダー
- 週次レポートバナー（月曜のみ）
- 今日のAIアドバイス
- 6機能ショートカットボタン
- モーダル: ユーザー名編集

---

### 2.3 採点画面 (`answer.tsx`)

**ルート:** `/(tabs)/answer`

#### 主要状態

| 状態変数 | 型 | 説明 |
|----------|----|------|
| `subject` | `string` | 選択科目 |
| `question` / `answer` | `string` | 問題文・解答文 |
| `result` / `summary` | `string` | AI採点結果・要約 |
| `questionImages` / `answerImages` | `{uri,base64}[]` | 画像添付（最大各10枚） |
| `pdfInfo` | `object` | PDF抽出メタデータ（ページ数・範囲・図表ページ） |
| `selectedBookIds` | `Set<string>` | 参照教材選択 |
| `chatMessages` | `ChatMessage[]` | フォローアップQ&A |
| `topicEvaluation` | `object` | トピック評価（present/missing/irrelevant） |
| `previousResult` | `string` | 再採点時の前回結果 |

#### 主要UI・機能

- 科目セレクター（6科目）
- RangeSlider（PDFページ範囲選択）
- 問題・解答テキスト入力
- カメラ / ギャラリー / PDF からの画像添付・OCR
- 教材参照チェックボックス
- `/grade` API 呼び出し・結果Markdown表示
- トピック評価セクション
- 参照ページモーダル
- 再採点・差分表示
- 質問テンプレート保存（AsyncStorage）
- フォローアップチャット（`/chat` API）

---

### 2.4 分析画面 (`analytics.tsx`)

**ルート:** `/(tabs)/analytics`

#### 主要状態

| 状態変数 | 型 | 説明 |
|----------|----|------|
| `stats` | `SubjectStats[]` | 科目別: 回数・平均点・最終点・トレンド |
| `top5WrongTopics` | `{topic,count}[]` | 誤答トピックTOP5 |
| `cautionTopics` | `CautionTopic[]` | 注意トピック |
| `studyTip` | `string` | 科目別AIアドバイス |

#### 主要UI・機能

- サマリーカード（累計回数・弱点科目・未挑戦科目）
- 注意トピックセクション（3連続以上不正解）
- 誤答トピックTOP5ランキング
- 科目別スコアバーグラフ（弱い順ソート）
- トレンドインジケーター（↑↓→）
- 「アドバイスをもらう」ボタン（`/study-tip` API）
- CSVエクスポート機能

---

### 2.5 履歴画面 (`explore.tsx`)

**ルート:** `/(tabs)/explore`

#### 主要状態

| 状態変数 | 型 | 説明 |
|----------|----|------|
| `history` | `HistoryItem[]` | AsyncStorage から取得 |
| `filterSubject` | `string \| null` | 科目フィルター |
| `passFailFilter` | `"all" \| "pass" \| "fail"` | 合否フィルター |
| `sortOrder` | `"newest" \| "oldest"` | 並び順 |

#### 主要UI・機能

- 科目フィルターチップ（横スクロール）
- 合否フィルター・並び順トグル
- カードリスト（スコアバッジ・日付・プレビュー）
- 詳細モーダル（全文Q&A・採点結果）
- 削除機能

---

### 2.6 教材管理画面 (`textbook.tsx`)

**ルート:** `/(tabs)/textbook`

#### 主要状態

| 状態変数 | 型 | 説明 |
|----------|----|------|
| `books` | `TextbookMeta[]` | 登録済み教材一覧 |
| `filterSubject` | `string \| null` | 科目フィルター |
| `regLoading` / `regProgress` | `boolean` / `number` | 登録中フラグ・進捗率 |
| `regStatusText` | `string` | フェーズラベル |

#### 主要UI・機能

- PDFアップロード（最大50MB）
- 科目・書名・説明入力
- 登録確認ダイアログ（ファイル情報表示）
- 登録進捗トラッキング（`/textbook/register/status/:jobId` ポーリング）
- 登録済み教材一覧（科目フィルター）
- 削除（確認ダイアログ付き）
- 重複検出・上書き選択
- 上限チェック（最大20冊）

---

### 2.7 比較添削画面 (`compare.tsx`)

**ルート:** `/(tabs)/compare`

#### 主要状態

| 状態変数 | 型 | 説明 |
|----------|----|------|
| `answerUris` / `answerB64s` | `string[]` | 自分の解答画像（最大10枚） |
| `modelUris` / `modelB64s` | `string[]` | 模範解答画像（最大10枚） |
| `result` | `GradeResult \| null` | 採点結果 |
| `gradingCriteria` | `GradingCriteria` | 採点基準（balanced/issue_focus/calculation_focus） |
| `promptTips` | `string[]` | 蓄積AIヒント |
| `usageCount` / `limitReached` | `number` / `boolean` | 日次利用制限 |

#### 主要UI・機能

- マルチ画像アップロード（解答・模範解答各最大10枚）
- カメラ / ギャラリー選択
- ドラッグ&ドロップ画像並び替え
- 並列OCR（解答・模範解答）
- ツールベース採点（詳細フィードバック付き）
- 100点満点スコアリング
- 採点基準セレクター
- フィードバックカード（優先度順・色分け）
- 品質評価・リトライロジック
- RAG（教材コンテキスト付与）
- Supabase 履歴保存
- 結果シェア機能
- 日次利用制限表示

---

### 2.8 学習カレンダー画面 (`calendar.tsx`)

**ルート:** `/(tabs)/calendar`

#### 主要状態

| 状態変数 | 型 | 説明 |
|----------|----|------|
| `tasks` | `StudyTask[]` | 学習タスク一覧 |
| `workbooks` | `Workbook[]` | 問題集一覧 |
| `examDate` | `string` | 試験日（YYYY-MM-DD） |
| `streak` | `StreakInfo` | 連続学習情報 |

#### 主要UI・機能

- 月次カレンダーグリッド（42マス表示）
- 試験日入力
- 問題集管理（追加・編集・削除）
- 問題集からの自動タスク生成
- 選択日付のタスク表示
- タスク完了トグル
- 手動タスク追加
- ストリークカウンター（現在・最長）
- 試験まで残り日数表示

---

### 2.9 比較添削履歴画面 (`history.tsx`)

**ルート:** `/(tabs)/history`

#### 主要状態

| 状態変数 | 型 | 説明 |
|----------|----|------|
| `history` | `CompareHistoryItem[]` | AsyncStorage から取得（最大20件） |
| `selected` | `CompareHistoryItem \| null` | 詳細表示選択アイテム |
| `activeSubject` | `string` | フィルタータブ |

#### 主要UI・機能

- スコアトレンドグラフ（直近10件）
- 平均スコアバナー
- 科目フィルタータブ
- スコア・合否バッジ
- 致命的エラーインジケーター
- フィードバックプレビュー
- 詳細モーダル（全結果表示）
- 削除機能

---

### 2.10 設定画面 (`settings.tsx`)

**ルート:** `/(tabs)/settings`

#### 主要状態

| 状態変数 | 型 | 説明 |
|----------|----|------|
| `themeMode` | `"system" \| "light" \| "dark"` | テーマ設定 |
| `version` | `string` | アプリバージョン |
| `updateStatus` | `"checking" \| "available" \| "up-to-date"` | 更新チェック状態 |

#### 主要UI・機能

- テーマモードセレクター（システム / ライト / ダーク）
- 現在のテーマ表示
- バージョン情報
- 更新チェック機能

---

## 3. APIエンドポイント一覧

**ベースURL:** `https://studyapp-production-66d5.up.railway.app`

---

### 3.1 ヘルスチェック

#### `GET /health`

```
レスポンス:
{
  status: "ok",
  timestamp: string,
  supabase: string,
  supabaseConfigured: boolean,
  topicsCount: number | null,
  mongodb: "enabled" | "disabled",
  openai: string,
  pgvector: string
}
```

---

### 3.2 教材管理

#### `POST /textbook/register` （レート制限: 5回/時間）

**Content-Type:** `multipart/form-data`

| パラメータ | 型 | 必須 | 説明 |
|------------|-----|------|------|
| `pdf` | File | ✓ | PDFファイル（最大50MB） |
| `subject` | string | ✓ | 科目名 |
| `bookName` | string | ✓ | 書籍名 |
| `description` | string | - | 説明 |
| `overwrite` | `"true"` | - | 重複時に上書き |

```
レスポンス:
{
  ok: boolean,
  bookId: string,
  totalPages: number,
  subject: string,
  bookName: string,
  diagramPageNums: number[],
  jobId: string,
  status: "processing"
}
```

**バックグラウンド処理フェーズ:**

| フェーズ | 内容 |
|----------|------|
| 1 | Supabase Storage への PDF 保存 |
| 2 | Claude Vision による図表ページ解析（PDF ≤ 32MB の場合） |
| 3 | 論点単位セマンティックチャンク生成 |
| 4 | MongoDB への保存（Textbook・Chunk ドキュメント） |
| 5 | OpenAI Embedding 生成（並列度5） |
| 6 | Supabase `topics` テーブルへのバッチ挿入 |

---

#### `GET /textbook/register/status/:jobId`

```
レスポンス: ジョブステータスオブジェクト（progress, phase, error）
```

---

#### `GET /textbook/list`

```
レスポンス:
{
  books: [
    {
      bookId: string,
      subject: string,
      bookName: string,
      description: string,
      totalPages: number,
      registeredAt: string
    }
  ]
}
```

---

#### `DELETE /textbook/:bookId`

```
レスポンス: { ok: true }
```

---

#### `POST /textbook/search`

```
リクエスト:
{
  query: string,
  subject?: string
}

レスポンス:
{
  results: [
    {
      bookId: string,
      bookName: string,
      subject: string,
      pageNum: number,
      excerpt: string
    }
  ],
  source: "mongodb" | "json"
}
```

---

#### `POST /textbook/chunks-by-pages`

```
リクエスト:
{
  bookId: string,
  fromPage?: string,
  toPage?: string
}

レスポンス:
{
  text: string,
  chunkCount: number,
  source: "mongodb" | "json"
}
```

---

### 3.3 答案採点

#### `POST /grade` （レート制限: 10回/分）

```
リクエスト:
{
  question: string,
  answer: string,
  subject: string,
  userId: string,
  bookIds: string[],
  questionImages?: string[],   // base64
  answerImages?: string[],     // base64
  sourceBookId?: string,
  sourceFromPage?: string,
  sourceToPage?: string,
  deviceId?: string
}

レスポンス:
{
  result: string,              // Markdown形式の採点フィードバック
  score: number | null,
  topics: string[],
  wrongTopics: string[],
  refPages: string[],
  summary: string,
  topicList: string[],
  topicEvaluation?: {
    present: string[],
    missing: string[],
    irrelevant: string[]
  }
}
```

**利用モデル:** `claude-sonnet-4-5`  
**機能:** Vision対応・pgvector RAG・Supabase履歴保存

---

### 3.4 比較添削

#### `POST /grade-compare` （レート制限: 10回/分）

```
リクエスト:
{
  answerImages: string[],         // base64
  modelAnswerImages: string[],    // base64
  modelAnswerText?: string,
  subject: string,
  promptTips?: string[],
  userId: string,
  deviceId?: string,
  gradingCriteria?: "issue_focus" | "calculation_focus" | "balanced"
}

即時レスポンス:
{
  score: number,
  passed: boolean,
  fatalErrors: number,
  missingProcess: boolean,
  answerSteps: Steps,
  modelSteps: Steps,
  feedbacks: Feedback[],
  jobId: string
}
```

**バックグラウンド処理:** 品質評価（Haiku）・リトライ・Supabase保存・RAGコンテキスト取得

---

#### `GET /grade-compare/eval-status/:jobId`

```
レスポンス:
{
  status: "pending" | "done",
  evalScore?: number,
  improvements?: string[],
  textbookRef?: string
}
```

---

### 3.5 PDF・画像テキスト抽出

#### `POST /extract-pdf`

```
リクエスト: multipart/form-data
  pdf: File
  fromPage?: number
  toPage?: number

レスポンス:
{
  text: string,
  totalPages: number,
  fromPage: number,
  toPage: number,
  imagePages: number[]
}
```

---

#### `POST /extract-pdf-image`

```
リクエスト: multipart/form-data
  pdf: File
  pageNum?: number

レスポンス:
{
  text: string,
  pageNum: number
}
```

**処理:** canvas + pdfjs でレンダリング → Claude Vision OCR

---

#### `POST /extract-image`

```
リクエスト: multipart/form-data
  image: File

レスポンス:
{
  text: string
}
```

**処理:** 手書き文字認識最適化プロンプト（HANDWRITING_OCR_PROMPT）

---

### 3.6 学習アドバイス

#### `POST /study-tip`

```
リクエスト:
{
  subject: string,
  avgScore?: number,
  wrongTopicsRanked?: [{ topic: string, count: number }],
  improvedTopics?: string[]
}

レスポンス:
{
  tip: string
}
```

**利用モデル:** `claude-sonnet-4-6`

---

### 3.7 週次レポート

#### `POST /study-report`

```
リクエスト:
{
  scoringItems?: [],
  compareItems?: [],
  avgScore?: number,
  subjectBreakdown?: { [subject: string]: { count: number, avgScore: number } },
  topWrongTopics?: [{ topic: string, count: number }]
}

レスポンス:
{
  achievements: string,
  improvements: string,
  suggestions: string
}
```

**利用モデル:** `claude-sonnet-4-6`  
**用途:** 毎週月曜日の週次レポート生成

---

### 3.8 チャット（フォローアップQ&A）

#### `POST /chat`

```
リクエスト:
{
  messages: ChatMessage[],
  subject: string,
  context?: string
}

レスポンス:
{
  reply: string
}
```

**利用モデル:** `claude-sonnet-4-5`

---

### 3.9 バックアップ

#### `GET /backup/export`

```
レスポンス: textbooks + chunks を含む JSON ファイル
```

**要件:** MongoDB 有効時のみ利用可能

---

#### `POST /backup/import`

```
リクエスト:
{
  textbooks: [],
  chunks: []
}

レスポンス:
{
  ok: true,
  restored: { textbooks: number, chunks: number }
}
```

---

## 4. 主要型定義

### `TextbookMeta`

```typescript
type TextbookMeta = {
  bookId: string;
  subject: string;
  bookName: string;
  totalPages: number;
  description: string;
  registeredAt: string;
};
```

---

### `HistoryItem`

```typescript
type HistoryItem = {
  id: string;
  subject: string;
  question: string;
  answer: string;
  result: string;
  score: number | null;
  date: string;
  topics?: string[];
  wrongTopics?: string[];
};
```

---

### `GradeResult`

```typescript
type GradeResult = {
  score: number;           // 0–100
  passed: boolean;
  fatalErrors: number;
  missingProcess: boolean;
  feedbacks: Feedback[];
  answerSteps: Steps;
  modelSteps: Steps;
  textbookRef?: string;
};
```

---

### `Feedback`

```typescript
type Feedback = {
  priority: number;        // 1–5
  type: string;            // '論点誤認' | '思考プロセスミス' | '計算ミス' | '前提不足' | '図表形式ミス'
  point: string;
  color: string;           // 'red' | 'yellow' | 'green'
};
```

---

### `Steps`

```typescript
type Steps = {
  issueRecognition: string;
  premise: string;
  logic: string;
  conclusion: string;
};
```

---

### `CompareHistoryItem`

```typescript
type CompareHistoryItem = {
  id: string;
  date: string;
  subject?: string;
  result: GradeResult;
  answerUri?: string;
};
```

---

### `StudyTask`

```typescript
type StudyTask = {
  id: string;
  date: string;
  subject: string;
  workbookId: string;
  workbookName: string;
  round: number;
  title: string;
  startPage: number;
  endPage: number;
  done: boolean;
};
```

---

### `Workbook`

```typescript
type Workbook = {
  id: string;
  name: string;
  subject: string;
  pages: number;
  rounds: number;
  order: number;
};
```

---

### `DashboardStats`

```typescript
type DashboardStats = {
  totalCount: number;
  todayCount: number;
  streak: number;
  avgScore: number | null;
  weakestSubject: string | null;
  recentSubjects: string[];
};
```

---

### `CautionTopic`

```typescript
type CautionTopic = {
  topic: string;
  subject: string;
  streak?: number;
  daysSinceReview?: number | null;
};
```

---

### `WeeklyReport`

```typescript
type WeeklyReport = {
  achievements: string;
  improvements: string;
  suggestions: string;
};
```

---

### `ChatMessage`

```typescript
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};
```

---

### `StreakInfo`

```typescript
type StreakInfo = {
  currentStreak: number;
  longestStreak: number;
  studiedDates: Set<string>;
};
```

---

## 5. データ永続化

### AsyncStorage キー一覧

| キー | 型 | 説明 |
|------|----|------|
| `history` | `HistoryItem[]` | 答案採点履歴 |
| `userName` | `string` | ユーザー表示名 |
| `examDate_v2` | `string` | 試験日（YYYY-MM-DD） |
| `workbooks_v2` | `Workbook[]` | 問題集一覧 |
| `studyTasks_v2` | `StudyTask[]` | 自動生成学習タスク |
| `compare_history` | `CompareHistoryItem[]` | 比較添削履歴（最大20件） |
| `compare_prompt_tips` | `string[]` | 蓄積AIヒント（最大10件） |
| `compare_grading_criteria` | `GradingCriteria` | 選択中の採点基準 |

### Supabase テーブル

| テーブル名 | 主な列 | 説明 |
|------------|--------|------|
| `history` | `device_id, score, subject, result_json` | 採点履歴（共有） |
| `topics` | `subject, content, embedding, textbook_id, page_num, topic_name, importance` | セマンティックチャンク + ベクトル |

### MongoDB コレクション（有効時）

| コレクション名 | 主な列 | 説明 |
|----------------|--------|------|
| `textbooks` | `textbookId, title, subject, pages, diagramPageNums` | 登録教材 |
| `chunks` | `textbookId, subject, content, pageNum, topicName, importance, chunkIndex, embedding, isImage` | セマンティックチャンク |

---

## 6. 利用Claudeモデル

| モデル | 用途 |
|--------|------|
| `claude-sonnet-4-6` | 教材図表解析・週次レポート・学習アドバイス |
| `claude-sonnet-4-5` | 答案採点・画像OCR・チャット |
| `claude-haiku-4-5-20251001` | トピック抽出・論点抽出・比較添削品質評価 |
