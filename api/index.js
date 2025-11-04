const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

const SUPABASE_URL = "https://wxlxlhbfuezfvtbshwsw.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4bHhsaGJmdWV6ZnZ0YnNod3N3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjIzODYzNiwiZXhwIjoyMDc3ODE0NjM2fQ.a9AoVbSciixxREtvQz31auD0hnMADdpit2HuzkShhMA";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  logger.error('❌ Missing Supabase env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static('public'));

const limiter = rateLimit({ windowMs: 60 * 1000, max: 10 });
app.use('/api/', limiter);

function randomString(length) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

// GET /api/keys
app.get('/api/keys', async (req, res) => {
  try {
    const { data, error } = await supabase.from('keys').select('key, users, created_at, expires_at').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ keys: data || [] });
  } catch (error) {
    logger.error('Fetch keys:', error);
    res.status(500).json({ error: 'Failed to fetch' });
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
      const { data } = await supabase.from('keys').select('id').eq('key', key).maybeSingle();
      if (!data) {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const { error } = await supabase.from('keys').insert({ key, users: [], expires_at: expiresAt });
        if (error) throw error;
        logger.info(`Key created: ${key}`);
        return res.status(201).json({ key, expires_at: expiresAt });
      }
    } catch (error) {}
    attempts++;
  }

  // Fallback
  const fallbackPart = uuidv4().replace(/-/g, '').slice(0, 20);
  key = `key-${fallbackPart}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  try {
    const { error } = await supabase.from('keys').insert({ key, users: [], expires_at: expiresAt });
    if (error) throw error;
    logger.info(`Fallback key: ${key}`);
    return res.status(201).json({ key, expires_at: expiresAt });
  } catch (error) {
    logger.error('Create key:', error);
    res.status(500).json({ error: 'Failed to create key' });
  }
});

// POST /api/checkkey
app.post('/api/checkkey', async (req, res) => {
  const { key, user_id } = req.body;
  if (!key || !user_id) return res.status(400).json({ valid: false, error: 'Missing data' });

  try {
    const { data: keyData, error: selectError } = await supabase.from('keys').select('*').eq('key', key).single();
    if (selectError || !keyData) return res.json({ valid: false, error: 'Invalid key' });

    const now = new Date().toISOString();
    if (new Date(keyData.expires_at) < new Date(now)) return res.json({ valid: false, error: 'Key expired' });

    const users = keyData.users || [];
    if (users.includes(user_id)) return res.json({ valid: true, message: 'Already activated' });

    if (users.length >= 2) return res.json({ valid: false, error: 'Limit reached (2 users)' });

    const { data: userExisting } = await supabase.from('user_keys').select('key').eq('user_id', user_id).maybeSingle();
    if (userExisting) return res.json({ valid: false, error: 'User already used a key' });

    const updatedUsers = [...users, user_id];
    const { error: updateError } = await supabase.from('keys').update({ users: updatedUsers }).eq('key', key);
    if (updateError) throw updateError;

    const { error: insertError } = await supabase.from('user_keys').insert({ user_id, key });
    if (insertError) throw insertError;

    logger.info(`Activated ${key} for ${user_id}`);
    res.json({ valid: true, message: 'Activated! Expires 24h.' });
  } catch (error) {
    logger.error('Check key:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/cleanup (Manual cleanup expired)
app.post('/api/cleanup', async (req, res) => {
  try {
    const { data: deletedKeys } = await supabase.from('keys').delete().lt('expires_at', new Date().toISOString()).select('key');
    await supabase.from('user_keys').delete().in('key', deletedKeys.map(k => k.key));
    logger.info(`Cleaned ${deletedKeys.length} expired keys`);
    res.json({ cleaned: deletedKeys.length });
  } catch (error) {
    logger.error('Cleanup:', error);
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

module.exports = app;
