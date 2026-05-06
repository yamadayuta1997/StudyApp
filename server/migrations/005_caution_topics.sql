-- ================================================================
-- 005_caution_topics.sql — 論点連続ミストラッキング (Issue #28)
-- Supabase SQL Editor で実行してください
-- ================================================================

-- history テーブルに論点フィールドを明示カラム化（既存は result_json に含まれる）
-- result_json.topics      : 問題の全論点
-- result_json.wrongTopics : 誤答論点
-- これらは /grade・/grade-compare の両エンドポイントから保存済み

-- 要注意論点フラグをデバイス単位で管理するテーブル
-- クライアント側 AsyncStorage (caution_topics_v1) と二重管理し、
-- サーバー側でも参照できるようにする
CREATE TABLE IF NOT EXISTS caution_topics (
  id                 BIGSERIAL   PRIMARY KEY,
  device_id          TEXT        NOT NULL,
  subject            TEXT        NOT NULL,
  topic              TEXT        NOT NULL,
  consecutive_wrong  INTEGER     NOT NULL DEFAULT 0,
  is_caution         BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (device_id, subject, topic)
);

CREATE INDEX IF NOT EXISTS caution_topics_device_idx ON caution_topics (device_id);
CREATE INDEX IF NOT EXISTS caution_topics_caution_idx ON caution_topics (device_id, is_caution);
