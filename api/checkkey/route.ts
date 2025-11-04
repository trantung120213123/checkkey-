import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  // CORS mở
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 200, headers: corsHeaders });
  }

  const { key, user_id } = await req.json();
  if (!key || !user_id) {
    return NextResponse.json({ valid: false, error: 'Missing key or user_id' }, { status: 400, headers: corsHeaders });
  }

  try {
    const { data: keyData, error: selectError } = await supabase.from('keys').select('*').eq('key', key).single();
    if (selectError || !keyData) {
      return NextResponse.json({ valid: false, error: 'Invalid key' }, { headers: corsHeaders });
    }

    const now = new Date().toISOString();
    if (new Date(keyData.expires_at) < new Date(now)) {
      return NextResponse.json({ valid: false, error: 'Key expired (24h limit)' }, { headers: corsHeaders });
    }

    const users = keyData.users || [];
    if (users.includes(user_id)) {
      return NextResponse.json({ valid: true, message: 'Key already activated for this user' }, { headers: corsHeaders });
    }

    if (users.length >= 2) {
      return NextResponse.json({ valid: false, error: 'Key limit reached (max 2 users)' }, { headers: corsHeaders });
    }

    const { data: userExisting } = await supabase.from('user_keys').select('key').eq('user_id', user_id).maybeSingle();
    if (userExisting) {
      return NextResponse.json({ valid: false, error: 'User already used a key (1 key per user)' }, { headers: corsHeaders });
    }

    const updatedUsers = [...users, user_id];
    const { error: updateError } = await supabase.from('keys').update({ users: updatedUsers }).eq('key', key);
    if (updateError) throw updateError;

    const { error: insertUserError } = await supabase.from('user_keys').insert({ user_id, key });
    if (insertUserError) throw insertUserError;

    console.log(`🎉 Activated key ${key} for user ${user_id}`);
    return NextResponse.json({ valid: true, message: 'Key activated! Expires in 24h from creation.' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Check key error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500, headers: corsHeaders });
  }
}
