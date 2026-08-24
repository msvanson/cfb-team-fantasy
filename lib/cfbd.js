import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false } }
);

const CFBD_BASE = 'https://api.collegefootballdata.com';

async function cfbdFetch(path) {
  const key = process.env.CFBD_API_KEY;
  if (!key) throw new Error('CFBD_API_KEY is not configured');
  const res = await fetch(`${CFBD_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`CFBD ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function pushGames(games) {
  const secret = process.env.CFB_SYNC_SECRET;
  if (!secret) throw new Error('CFB_SYNC_SECRET is not configured');
  let total = { upserted: 0, skipped: 0, winEvents: 0 };
  for (let i = 0; i < games.length; i += 100) {
    const chunk = games.slice(i, i + 100);
    const { data, error } = await supabase.rpc('sync_cfbd_games', {
      p_secret: secret,
      p_games: chunk,
    });
    if (error) throw error;
    total.upserted += data?.upserted || 0;
    total.skipped += data?.skipped || 0;
    total.winEvents += data?.winEvents || 0;
  }
  return total;
}

function normalizeScoreboardGame(g) {
  return {
    id: g.id,
    startDate: g.startDate,
    completed: g.status === 'completed',
    status: g.status,
    period: g.period,
    clock: g.clock,
    homeId: g.homeTeam?.id,
    homeTeam: g.homeTeam?.name,
    homePoints: g.homeTeam?.points,
    awayId: g.awayTeam?.id,
    awayTeam: g.awayTeam?.name,
    awayPoints: g.awayTeam?.points,
  };
}

export async function syncCfbd({ forceSchedule = false } = {}) {
  const secret = process.env.CFB_SYNC_SECRET;
  if (!secret) return { ok: false, reason: 'missing-sync-secret' };

  const { data: claimed, error: claimError } = await supabase.rpc('claim_cfbd_sync', {
    p_secret: secret,
    p_min_seconds: 120,
  });
  if (claimError) throw claimError;
  if (!claimed) return { ok: true, skipped: true, reason: 'throttled' };

  const result = { ok: true, schedule: null, scoreboard: null, liveAvailable: true };
  try {
    const { count } = await supabase
      .from('games')
      .select('*', { count: 'exact', head: true })
      .eq('season_id', 1);

    if (forceSchedule || !count || count < 500) {
      const schedule = await cfbdFetch('/games?year=2026&seasonType=both&classification=fbs');
      result.schedule = await pushGames(schedule);
    }

    try {
      const scoreboard = await cfbdFetch('/scoreboard?classification=fbs');
      result.scoreboard = await pushGames(scoreboard.map(normalizeScoreboardGame));
    } catch (err) {
      if ([401, 402, 403].includes(err.status)) {
        result.liveAvailable = false;
        result.scoreboardError = err.message;
      } else {
        throw err;
      }
    }

    await supabase.rpc('finish_cfbd_sync', {
      p_secret: secret,
      p_result: result,
    });
    return result;
  } catch (error) {
    const failure = { ok: false, error: error.message };
    try {
      await supabase.rpc('finish_cfbd_sync', { p_secret: secret, p_result: failure });
    } catch {}
    throw error;
  }
}
