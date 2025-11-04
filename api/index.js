import express from 'express';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { VercelRequest, VercelResponse } from '@vercel/node';

const app = express();

// Supabase config
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wxlxlhbfuezfvtbshwsw.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static('public')); // Serve frontend từ public/

// Rate limiter
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests, chill đi cu!' }
});
app.use('/api/', limiter);

console.log('🚀 Server ready! Supabase connected:', !!SUPABASE_SERVICE_ROLE_KEY);

// Helpers
function randomString(length) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

// Routes

// GET /api/keys
app.get('/api/keys', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('keys')
      .select('key, users, created_at, expires_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ keys: data || [] });
  } catch (err) {
    console.error('Fetch keys error:', err);
    res.status(500).json({ error: 'Failed to fetch keys' });
  }
});

// POST /api/getkey
app.post('/api/getkey', async (req, res) => {
  let key;
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    const randomPart = randomString(20);
    key = `key-${randomPart}`;
    try {
      const { data: existing } = await supabase.from('keys').select('id').eq('key', key).maybeSingle();
      if (!existing) {
        const expiresAt = new Date(Date.now() + 24*60*60*1000).toISOString();
        const { error: insertError } = await supabase.from('keys').insert({ key, users: [], expires_at: expiresAt });
        if (insertError) throw insertError;
        console.log(`✅ Key created: ${key}`);
        return res.status(201).json({ key, expires_at: expiresAt });
      }
    } catch (err) {}
    attempts++;
  }

  // Fallback UUID
  const fallbackPart = uuidv4().replace(/-/g,'').slice(0,20);
  key = `key-${fallbackPart}`;
  const expiresAt = new Date(Date.now() + 24*60*60*1000).toISOString();
  try {
    const { error } = await supabase.from('keys').insert({ key, users: [], expires_at: expiresAt });
    if (error) throw error;
    console.log(`🔄 Fallback key: ${key}`);
    return res.status(201).json({ key, expires_at: expiresAt });
  } catch (err) {
    console.error('Create key error:', err);
    res.status(500).json({ error: 'Failed to create key, thử lại cu!' });
  }
});

// POST /api/checkkey
app.post('/api/checkkey', async (req, res) => {
  const { key, user_id } = req.body;
  if (!key || !user_id) return res.status(400).json({ valid:false, error:'Thiếu key hoặc user_id' });

  try {
    const { data: keyData, error: selectError } = await supabase.from('keys').select('*').eq('key', key).single();
    if (selectError || !keyData) return res.json({ valid:false, error:'Key không tồn tại' });

    if (new Date(keyData.expires_at) < new Date()) return res.json({ valid:false, error:'Key hết hạn (24h)' });

    const users = keyData.users || [];
    if (users.includes(user_id)) return res.json({ valid:true, message:'Key đã activate cho user này rồi' });
    if (users.length >= 2) return res.json({ valid:false, error:'Key full 2 users rồi' });

    // Check 1 user/1 key
    const { data: userExisting } = await supabase.from('user_keys').select('key').eq('user_id', user_id).maybeSingle();
    if (userExisting) return res.json({ valid:false, error:'User đã dùng key khác rồi (1 key/user)' });

    // Activate
    const updatedUsers = [...users, user_id];
    const { error: updateError } = await supabase.from('keys').update({ users: updatedUsers }).eq('key', key);
    if (updateError) throw updateError;

    const { error: insertUserError } = await supabase.from('user_keys').insert({ user_id, key });
    if (insertUserError) throw insertUserError;

    console.log(`🎉 Activated key ${key} for user ${user_id}`);
    return res.json({ valid:true, message:'Key activated xịn! Expires 24h từ tạo.' });
  } catch (err) {
    console.error('Check key error:', err);
    res.status(500).json({ error:'Server lỗi, thử lại' });
  }
});

// POST /api/cleanup
app.post('/api/cleanup', async (req, res) => {
  try {
    const { data: deleted } = await supabase.from('keys').delete().lt('expires_at', new Date().toISOString()).select('key');
    if (deleted && deleted.length > 0) {
      await supabase.from('user_keys').delete().in('key', deleted.map(k => k.key));
    }
    console.log(`🧹 Cleaned ${deleted?.length || 0} expired keys`);
    res.json({ cleaned: deleted?.length || 0 });
  } catch (err) {
    console.error('Cleanup error:', err);
    res.status(500).json({ error:'Cleanup fail' });
  }
});

// Convert Express app → Vercel Serverless Function
export default function handler(req, res) {
  app(req, res);
}
