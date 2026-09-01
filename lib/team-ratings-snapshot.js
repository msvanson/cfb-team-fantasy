import { createClient } from '@supabase/supabase-js';
import { importTeamRatings } from './team-ratings';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured');
}

if (!serviceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

const TERMINAL_NON_FINAL_STATUSES = new Set([
  'canceled',
  'cancelled',
]);

function gameIsResolved(game) {
  if (game?.completed === true) {
    return true;
  }

  return TERMINAL_NON_FINAL_STATUSES.has(
    String(game?.status || '')
      .trim()
      .toLowerCase()
  );
}

export async function runWeeklyTeamRatingsSnapshot({
  year = 2026,
  seasonType = 'regular',
} = {}) {
  const { data: season, error: seasonError } =
    await supabase
      .from('seasons')
      .select('id, year')
      .eq('year', year)
      .single();

  if (seasonError) {
    throw seasonError;
  }

  const {
    data: latestSnapshot,
    error: snapshotError,
  } = await supabase
    .from('team_rating_snapshots')
    .select('through_week')
    .eq('season_id', season.id)
    .eq('season_type', seasonType)
    .order('through_week', {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (snapshotError) {
    throw snapshotError;
  }

  const latestWeek =
    Number.isInteger(latestSnapshot?.through_week)
      ? latestSnapshot.through_week
      : -1;

  const targetWeek = latestWeek + 1;

  const { data: games, error: gamesError } =
    await supabase
      .from('games')
      .select(
        'cfbd_game_id, week, start_time, status, completed'
      )
      .eq('season_id', season.id)
      .eq('season_type', seasonType)
      .eq('week', targetWeek)
      .order('start_time', {
        ascending: true,
      });

  if (gamesError) {
    throw gamesError;
  }

  if (!games?.length) {
    return {
      ok: true,
      action: 'skipped',
      reason: 'no_games_for_target_week',
      year,
      seasonType,
      latestWeek,
      targetWeek,
    };
  }

  const unresolved = games.filter(
    game => !gameIsResolved(game)
  );

  if (unresolved.length > 0) {
    const { data: nextWeekGame, error: nextWeekError } =
      await supabase
        .from('games')
        .select('start_time')
        .eq('season_id', season.id)
        .eq('season_type', seasonType)
        .eq('week', targetWeek + 1)
        .order('start_time', {
          ascending: true,
        })
        .limit(1)
        .maybeSingle();

    if (nextWeekError) {
      throw nextWeekError;
    }

    const nextWeekStart =
      nextWeekGame?.start_time || null;

    const nextWeekHasStarted =
      nextWeekStart &&
      Date.now() >=
        new Date(nextWeekStart).getTime();

    if (nextWeekHasStarted) {
      return {
        ok: true,
        action: 'skipped',
        reason: 'snapshot_window_missed',
        year,
        seasonType,
        latestWeek,
        targetWeek,
        gameCount: games.length,
        resolvedCount:
          games.length - unresolved.length,
        unresolvedCount: unresolved.length,
        nextUnresolvedStart:
          unresolved[0]?.start_time || null,
        nextWeekStart,
        requiresManualReview: true,
      };
    }

    return {
      ok: true,
      action: 'skipped',
      reason: 'week_not_complete',
      year,
      seasonType,
      latestWeek,
      targetWeek,
      gameCount: games.length,
      resolvedCount:
        games.length - unresolved.length,
      unresolvedCount: unresolved.length,
      nextUnresolvedStart:
        unresolved[0]?.start_time || null,
      nextWeekStart,
    };
  }

  const result = await importTeamRatings({
    year,
    throughWeek: targetWeek,
    seasonType,
  });

  return {
    ...result,
    action: 'snapshot_created',
    targetWeek,
    gameCount: games.length,
  };
}
