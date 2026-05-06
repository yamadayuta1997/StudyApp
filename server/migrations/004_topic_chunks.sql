-- ================================================================
-- 004_topic_chunks.sql — 論点単位チャンク分割 (Issue #12)
-- Supabase SQL Editor で実行してください
-- ================================================================

-- topics テーブルに論点タグカラムを追加
ALTER TABLE topics ADD COLUMN IF NOT EXISTS topic_name TEXT;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS importance  INTEGER DEFAULT 1;

-- 論点名インデックス
CREATE INDEX IF NOT EXISTS topics_topic_name_idx ON topics (topic_name);

-- 戻り値型が変わるため既存関数を先に削除
DROP FUNCTION IF EXISTS match_topics(vector,text,integer);

-- match_topics: topic_name / importance を返すよう更新
CREATE OR REPLACE FUNCTION match_topics(
  query_embedding vector(1536),
  match_subject   text    DEFAULT NULL,
  match_count     int     DEFAULT 5
)
RETURNS TABLE (
  id          bigint,
  subject     text,
  content     text,
  textbook_id text,
  page_num    integer,
  topic_name  text,
  importance  integer,
  similarity  float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    subject,
    content,
    textbook_id,
    page_num,
    topic_name,
    importance,
    1 - (embedding <=> query_embedding) AS similarity
  FROM   topics
  WHERE  embedding IS NOT NULL
    AND  (match_subject IS NULL OR subject = match_subject)
  ORDER  BY embedding <=> query_embedding
  LIMIT  match_count;
$$;
