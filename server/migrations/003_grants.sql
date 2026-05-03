-- ================================================================
-- 003_grants.sql — テーブル権限の付与
-- Supabase SQL Editor で実行してください
-- ================================================================

-- service_role（バックエンド SUPABASE_SECRET_KEY 経由）に全権限を付与
GRANT ALL ON ALL TABLES   IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- anon / authenticated ロールに最小限の権限を付与
GRANT SELECT, INSERT        ON history TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON topics  TO anon, authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- ================================================================
-- RLS ポリシー
-- history: 全ロールで INSERT 可、SELECT は全件参照可
-- topics:  service_role で全操作可、anon/authenticated でも読み書き可
-- ================================================================

-- history
ALTER TABLE history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "history_service_role_all"    ON history;
DROP POLICY IF EXISTS "history_insert_for_all"      ON history;
DROP POLICY IF EXISTS "history_select_for_all"      ON history;

CREATE POLICY "history_service_role_all"
  ON history FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "history_insert_for_all"
  ON history FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "history_select_for_all"
  ON history FOR SELECT TO anon, authenticated USING (true);

-- topics
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "topics_service_role_all"        ON topics;
DROP POLICY IF EXISTS "topics_anon_authenticated_all"  ON topics;

CREATE POLICY "topics_service_role_all"
  ON topics FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "topics_anon_authenticated_all"
  ON topics FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
