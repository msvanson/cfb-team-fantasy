import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncCfbd } from '../../../lib/cfbd';

export const dynamic = 'force-dynamic';

const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const hasSupabaseKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://invalid.local',
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'missing',
  { auth: { persistSession: false } }
);

export async function GET(request) {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';
  const diagnostics = {
    server: true,
    cfbdApiKeyPresent: Boolean(process.env.CFBD_API_KEY),
    syncSecretPresent: Boolean(process.env.CFB_SYNC_SECRET),
    supabaseUrlPresent: hasSupabaseUrl,
    supabasePublishableKeyPresent: hasSupabaseKey,
    vercelEnvironment: process.env.VERCEL_ENV || null,
  };

  let sync = null;
  try {
    sync = await syncCfbd({ forceSchedule: force });
  } catch (error) {
    sync = { ok: false, error: error?.message || String(error) };
  }

  const now = new Date();
  const from = new Date(now.getTime() - 18 * 60 * 60 * 1000).toISOString();
  const to = new Date(now.getTime() + 30 * 60 * 60 * 1000).toISOString();

  const [{ data: games, error: gameError }, { data: directory, error: dirError }, { count: totalGames, error: countError }] = await Promise.all([
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
    supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', 1),
  ]);

  if (gameError || dirError || countError) {
    return NextResponse.json({
      ok: false,
      error: gameError?.message || dirError?.message || countError?.message,
      diagnostics,
      sync,
    }, { status: 500 });
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
    ok: Boolean(sync?.ok),
    updatedAt: new Date().toISOString(),
    totalGames: totalGames || 0,
    diagnostics,
    sync,
    games: decorated,
  });
}
