-- ============================================================
-- 001_init.sql  —  StudyApp 初期スキーマ
-- Supabase SQL Editor で実行してください
-- ============================================================

-- pgvector 拡張
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- users テーブル
-- device_id: iOS vendorId / Android applicationId
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id         BIGSERIAL PRIMARY KEY,
  device_id  TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_device_id_idx ON users (device_id);

-- ============================================================
-- history テーブル
-- 採点結果を1件ずつ保存する
-- ============================================================
CREATE TABLE IF NOT EXISTS history (
  id          BIGSERIAL PRIMARY KEY,
  device_id   TEXT        NOT NULL,
  score       INTEGER,                    -- 0〜100
  subject     TEXT,                       -- 科目名
  result_json JSONB,                      -- GradeResult 全体
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS history_device_id_idx ON history (device_id);
CREATE INDEX IF NOT EXISTS history_created_at_idx ON history (created_at DESC);

-- ============================================================
-- topics テーブル
-- 教科書チャンク + pgvector 埋め込み
-- embedding: text-embedding-3-small の次元数 1536
-- ============================================================
CREATE TABLE IF NOT EXISTS topics (
  id         BIGSERIAL PRIMARY KEY,
  subject    TEXT        NOT NULL,
  content    TEXT        NOT NULL,
  embedding  vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- コサイン距離インデックス（近傍検索を高速化）
CREATE INDEX IF NOT EXISTS topics_embedding_idx
  ON topics
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
