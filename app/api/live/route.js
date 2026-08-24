import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncCfbd } from '../../../lib/cfbd';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false } }
);

export async function GET() {
  let sync = null;
  try {
    sync = await syncCfbd();
  } catch (error) {
    sync = { ok: false, error: error.message };
  }

  const now = new Date();
  const from = new Date(now.getTime() - 18 * 60 * 60 * 1000).toISOString();
  const to = new Date(now.getTime() + 30 * 60 * 60 * 1000).toISOString();

  const [{ data: games, error: gameError }, { data: directory, error: dirError }] = await Promise.all([
    supabase
      .from('games')
      .select('id,cfbd_game_id,week,start_time,home_team_id,away_team_id,home_score,away_score,status,period,clock,completed')
      .eq('season_id', 1)
      .gte('start_time', from)
      .lte('start_time', to)
      .order('start_time'),
    supabase
      .from('team_directory')
      .select('team_id,school,owner_name,is_owned')
      .eq('season_id', 1),
  ]);

  if (gameError || dirError) {
    return NextResponse.json({ error: gameError?.message || dirError?.message, sync }, { status: 500 });
  }

  const byId = new Map((directory || []).map(t => [t.team_id, t]));
  const decorated = (games || [])
    .map(g => ({
      ...g,
      home: byId.get(g.home_team_id) || { school: 'Opponent', owner_name: null, is_owned: false },
      away: byId.get(g.away_team_id) || { school: 'Opponent', owner_name: null, is_owned: false },
    }))
    .filter(g => g.home.is_owned || g.away.is_owned);

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    sync,
    games: decorated,
  });
}
