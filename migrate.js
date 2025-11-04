const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Set SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function migrate() {
  try {
    // SQL full (copy to Supabase SQL Editor nếu auto fail)
    const sql = `
      -- Table keys (nếu chưa)
      CREATE TABLE IF NOT EXISTS keys (
        id BIGSERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        users JSONB DEFAULT '[]'::JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
      );

      -- Table user_keys
      CREATE TABLE IF NOT EXISTS user_keys (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        key TEXT REFERENCES keys(key) ON DELETE CASCADE,
        used_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_keys_expires ON keys(expires_at);
      CREATE INDEX IF NOT EXISTS idx_user_keys_user ON user_keys(user_id);
      CREATE INDEX IF NOT EXISTS idx_keys_key ON keys(key);

      -- Cron cleanup expired keys (enable pg_cron extension in Supabase nếu cần)
      -- SELECT cron.schedule('cleanup-keys', '0 * * * *', 'DELETE FROM keys WHERE expires_at < NOW(); DELETE FROM user_keys WHERE key NOT IN (SELECT key FROM keys);');
    `;

    console.log('📝 Run this SQL in Supabase > SQL Editor:');
    console.log(sql);

    // Test connect
    const { error } = await supabase.from('keys').insert({ key: 'migrate-test', users: [] }).select().single();
    if (error && !error.message.includes('duplicate')) throw error;
    await supabase.from('keys').delete().eq('key', 'migrate-test');

    console.log('✅ Migrate done! Enable pg_cron for auto-cleanup if needed.');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

migrate();
