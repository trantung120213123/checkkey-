import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: NextRequest) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { data, error } = await supabase.from('keys').select('key, users, created_at, expires_at').order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ keys: data || [] }, { headers: corsHeaders });
  } catch (error) {
    console.error('Fetch keys error:', error);
    return NextResponse.json({ error: 'Failed to fetch keys' }, { status: 500, headers: corsHeaders });
  }
}
