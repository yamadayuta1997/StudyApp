-- ============================================================
-- 002_vector_search.sql — pgvector セマンティック検索用 RPC
-- Supabase SQL Editor で実行してください
-- ============================================================

-- topics テーブルに教科書参照カラムを追加
ALTER TABLE topics ADD COLUMN IF NOT EXISTS textbook_id TEXT;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS page_num    INTEGER;

-- テキストブックIDのインデックス
CREATE INDEX IF NOT EXISTS topics_textbook_id_idx ON topics (textbook_id);
CREATE INDEX IF NOT EXISTS topics_subject_idx     ON topics (subject);

-- ============================================================
-- match_topics: pgvector コサイン類似度検索 RPC
-- query_embedding: text-embedding-3-small の出力ベクトル(1536次元)
-- match_subject:   科目でフィルタ（NULL で全科目）
-- match_count:     上位N件を返す
-- ============================================================
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
    1 - (embedding <=> query_embedding) AS similarity
  FROM   topics
  WHERE  embedding IS NOT NULL
    AND  (match_subject IS NULL OR subject = match_subject)
  ORDER  BY embedding <=> query_embedding
  LIMIT  match_count;
$$;
