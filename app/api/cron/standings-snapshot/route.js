import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false } }
);

export async function GET(request) {
  const auth = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());

  const part = Object.fromEntries(parts.map(x => [x.type, x.value]));

  if (part.weekday !== 'Sun' || part.hour !== '06') {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'Not Sunday 6 AM Eastern'
    });
  }

  const { data, error } = await supabase.rpc('capture_standings_rank_snapshot', {
    p_season_id: 1
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, snapshotAt: data });
}
