# 環境構築・デプロイ手順書

> 対象: StudyApp（公認会計士試験 学習支援アプリ）  
> 最終更新: 2026-05-09

---

## 目次

1. [前提条件](#1-前提条件)
2. [環境変数一覧](#2-環境変数一覧)
3. [ローカル開発環境の構築](#3-ローカル開発環境の構築)
4. [localtunnel の使い方](#4-localtunnel-の使い方)
5. [Railway へのデプロイ手順](#5-railway-へのデプロイ手順)

---

## 1. 前提条件

| ツール | バージョン | 備考 |
|--------|-----------|------|
| Node.js | 20.x 以上 | `node -v` で確認 |
| npm | 10.x 以上 | `npm -v` で確認 |
| Git | 任意 | |
| Expo Go | 最新版 | iOS / Android 実機テスト用 |

---

## 2. 環境変数一覧

### 2.1 バックエンド（`server/` ディレクトリ）

`server/.env` を作成して以下の変数を設定する。

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `ANTHROPIC_API_KEY` | ✅ | Anthropic Claude API キー。採点・OCR 処理に使用。 |
| `OPENAI_API_KEY` | ✅ | OpenAI API キー。テキスト埋め込み（embedding）生成に使用。 |
| `SUPABASE_URL` | ✅ | Supabase プロジェクト URL。 |
| `SUPABASE_SECRET_KEY` | ✅ | Supabase サービスロールキー（`service_role`）。 |
| `MONGODB_URI` | 任意 | MongoDB 接続文字列。教材（テキスト・チャンク）管理に使用。未設定の場合は MongoDB 機能が無効になる。 |
| `PORT` | 任意 | サーバーのリスニングポート。デフォルト: `3001` |
| `DATA_DIR` | 任意 | アップロードファイルの保存先。デフォルト: `/app/data` |
| `TEXTBOOK_MAX_COUNT` | 任意 | 登録可能な教材の最大数。デフォルト: `20` |

**`server/.env` の例:**

```env
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SECRET_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/studyapp
PORT=3001
```

### 2.2 フロントエンド（ルートディレクトリ）

Expo は `EXPO_PUBLIC_` プレフィックスの変数をクライアントに公開する。  
`.env.local` をルートに作成して設定する。

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `EXPO_PUBLIC_SUPABASE_URL` | ✅ | Supabase プロジェクト URL。 |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase 匿名キー（`anon`）。 |

**`.env.local` の例:**

```env
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> **注意:** API_BASE_URL（バックエンドの URL）は `utils/apiClient.ts` にハードコードされている。  
> ローカル開発時は localtunnel を使って公開された URL に書き換えるか、`EXPO_PUBLIC_API_BASE_URL` のような変数に移行する。

---

## 3. ローカル開発環境の構築

### 3.1 リポジトリのクローン

```bash
git clone https://github.com/yamadayuta1997/StudyApp.git
cd StudyApp
```

### 3.2 バックエンドのセットアップ

```bash
cd server
npm install
```

`.env` を作成（[2.1 節](#21-バックエンドserver-ディレクトリ)を参照）

```bash
node index.js
# → http://localhost:3001 でサーバーが起動
```

### 3.3 フロントエンドのセットアップ

```bash
# プロジェクトルートに戻る
cd ..
npm install
```

`.env.local` を作成（[2.2 節](#22-フロントエンドルートディレクトリ)を参照）

```bash
npm start
# → Expo Dev Server が起動。QR コードを Expo Go で読み取るか、シミュレータで確認。
```

プラットフォーム別の起動コマンド:

```bash
npm run ios      # iOS シミュレータ
npm run android  # Android エミュレータ
npm run web      # Web ブラウザ
```

---

## 4. localtunnel の使い方

実機（Expo Go）からローカルバックエンドに接続するには、localtunnel でポートを公開する。

### 4.1 インストール

```bash
npm install -g localtunnel
```

### 4.2 トンネルの開始

```bash
# バックエンドのポート（3001）を公開
lt --port 3001
# → https://xxxxxx.loca.lt のような URL が表示される
```

### 4.3 フロントエンドの接続先を更新

`utils/apiClient.ts` の `API_BASE_URL` を localtunnel の URL に変更する:

```typescript
// utils/apiClient.ts
export const API_BASE_URL = "https://xxxxxx.loca.lt";
```

> **注意:** localtunnel の URL はセッションごとに変わる。開発が終わったら本番 URL（Railway）に戻すこと。

---

## 5. Railway へのデプロイ手順

本アプリのバックエンドは Railway にデプロイする。フロントエンド（Expo）は Expo Go または EAS Build でビルド・配布する。

### 5.1 Railway プロジェクトの準備

1. [Railway](https://railway.app/) にログインする
2. 「New Project」→「Deploy from GitHub repo」を選択
3. `yamadayuta1997/StudyApp` を選択する

### 5.2 ビルド設定

本リポジトリには Railway 用の設定ファイルが含まれている。

| ファイル | 説明 |
|----------|------|
| `railway.toml`（ルート） | Dockerfile ビルドを指定 |
| `Dockerfile` | `node:20-slim` ベースで `server/` をビルド |
| `nixpacks.toml` | nixpacks 使用時の代替設定（server ディレクトリで `node index.js` を起動） |

Railway は `Dockerfile` を優先して使用する（`railway.toml` の `builder = "DOCKERFILE"` を参照）。

### 5.3 環境変数の設定

Railway ダッシュボードの「Variables」タブで[2.1 節](#21-バックエンドserver-ディレクトリ)の変数をすべて設定する。

| 変数名 | 設定場所 |
|--------|---------|
| `ANTHROPIC_API_KEY` | Railway Variables |
| `OPENAI_API_KEY` | Railway Variables |
| `SUPABASE_URL` | Railway Variables |
| `SUPABASE_SECRET_KEY` | Railway Variables |
| `MONGODB_URI` | Railway Variables（使用する場合） |

> `PORT` は Railway が自動的に設定するため、手動設定は不要。

### 5.4 デプロイの実行

```bash
git push origin main
```

`main` ブランチへのプッシュで Railway が自動デプロイを開始する。  
デプロイ状況は Railway ダッシュボードの「Deployments」タブで確認できる。

### 5.5 デプロイ後の確認

```bash
curl https://studyapp-production-66d5.up.railway.app/health
# → {"status":"ok"} が返ればデプロイ成功
```

デプロイ済み URL: `https://studyapp-production-66d5.up.railway.app`

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| `ANTHROPIC_API_KEY is not set` | 環境変数未設定 | `server/.env` または Railway Variables を確認 |
| MongoDB 接続エラー | `MONGODB_URI` の未設定または誤り | Atlas の接続文字列を確認。IP アクセス許可も確認 |
| localtunnel が `403` を返す | localtunnel の認証チャレンジ | ブラウザで URL を開き、ローカル IP を入力して突破する |
| Expo がサーバーに繋がらない | `API_BASE_URL` が古い | `utils/apiClient.ts` の URL を現在の localtunnel URL または Railway URL に更新 |
| Railway デプロイが失敗する | `Dockerfile` ビルドエラー | Railway の Deployment ログを確認し、依存関係の問題を修正 |
