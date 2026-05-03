const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.warn('[supabase] SUPABASE_URL / SUPABASE_SECRET_KEY が未設定です。Supabase 機能は無効になります。');
}

const supabase = SUPABASE_URL && SUPABASE_SECRET_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: { persistSession: false },
    })
  : null;

async function vectorSearch(embedding, subject, limit = 5) {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('match_topics', {
    query_embedding: embedding,
    match_subject:   subject || null,
    match_count:     limit,
  });
  if (error) throw new Error(error.message);
  return data || [];
}

module.exports = { supabase, vectorSearch };
