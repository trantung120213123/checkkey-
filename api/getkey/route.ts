import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function randomString(length: number): string {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

export async function POST(req: NextRequest) {
  // CORS mở cho HTML ngoài + Roblox gọi
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 200, headers: corsHeaders });
  }

  let key: string;
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    const randomPart = randomString(20);
    key = `key-${randomPart}`;

    try {
      const { data: existing } = await supabase.from('keys').select('id').eq('key', key).maybeSingle();
      if (!existing) {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const { error: insertError } = await supabase.from('keys').insert({ key, users: [], expires_at: expiresAt });
        if (insertError) throw insertError;
        console.log(`✅ Key created: ${key}`);
        return NextResponse.json({ key, expires_at: expiresAt }, { status: 201, headers: corsHeaders });
      }
    } catch (error) {
      // Retry
    }
    attempts++;
  }

  // Fallback UUID
  const fallbackPart = uuidv4().replace(/-/g, '').slice(0, 20);
  key = `key-${fallbackPart}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  try {
    const { error } = await supabase.from('keys').insert({ key, users: [], expires_at: expiresAt });
    if (error) throw error;
    console.log(`🔄 Fallback key: ${key}`);
    return NextResponse.json({ key, expires_at: expiresAt }, { status: 201, headers: corsHeaders });
  } catch (error) {
    console.error('Create key error:', error);
    return NextResponse.json({ error: 'Failed to create key' }, { status: 500, headers: corsHeaders });
  }
}
