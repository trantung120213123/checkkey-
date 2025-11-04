import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { data: deleted } = await supabase.from('keys').delete().lt('expires_at', new Date().toISOString()).select('key');
    if (deleted && deleted.length > 0) {
      await supabase.from('user_keys').delete().in('key', deleted.map((k: any) => k.key));
    }
    console.log(`🧹 Cleaned ${deleted?.length || 0} expired keys`);
    return NextResponse.json({ cleaned: deleted?.length || 0 }, { headers: corsHeaders });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500, headers: corsHeaders });
  }
}
