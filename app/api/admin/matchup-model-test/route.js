import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminAuthenticated } from '../../../../lib/admin-auth';
import {
  buildMatchupModelContext,
  calculateMatchupProbability,
  choosePregameProbability,
} from '../../../../lib/matchup-model';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

async function authorized(req) {
  const secret = process.env.CRON_SECRET || '';
  const auth = req.headers.get('authorization') || '';

  if (secret && auth === `Bearer ${secret}`) {
    return true;
  }

  return await isAdminAuthenticated();
}

function pct(value) {
  if (value === null || value === undefined) return null;
  return Number((Number(value) * 100).toFixed(1));
}

export async function GET(req) {
  if (!(await authorized(req))) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const url = new URL(req.url);
    const week = Number(url.searchParams.get('week') ?? 1);

    if (!Number.isInteger(week) || week < 1 || week > 20) {
      return NextResponse.json(
        { ok: false, error: 'Invalid week' },
        { status: 400 }
      );
    }

    // Use the most recent ratings snapshot available before this week.
    const throughWeek = Math.max(0, week - 1);

    const [
      { data: ratings, error: ratingsError },
      { data: games, error: gamesError },
      { data: teams, error: teamsError },
    ] = await Promise.all([
      supabase
        .from('team_rating_snapshots')
        .select(
          'team_id,sp_rating,fpi,elo,through_week,season_type'
        )
        .eq('season_id', 1)
        .eq('through_week', throughWeek)
        .eq('season_type', 'regular'),

      supabase
        .from('games')
        .select(
          'cfbd_game_id,week,start_time,home_team_id,away_team_id,completed,winner_team_id,neutral_site'
        )
        .eq('season_id', 1)
        .eq('week', week)
        .eq('season_type', 'regular')
        .order('start_time', { ascending: true }),

      supabase
        .from('team_directory')
        .select('team_id,school')
        .eq('season_id', 1),
    ]);

    if (ratingsError) throw ratingsError;
    if (gamesError) throw gamesError;
    if (teamsError) throw teamsError;

    if (!ratings?.length) {
      return NextResponse.json(
        {
          ok: false,
          error: `No ratings snapshot found for through_week=${throughWeek}`,
        },
        { status: 400 }
      );
    }

    const gameIds = (games || []).map((g) => g.cfbd_game_id);

    let odds = [];

    if (gameIds.length) {
      const { data, error } = await supabase
        .from('weekly_game_odds')
        .select(
  'cfbd_game_id,closing_home_win_probability,closing_away_win_probability,closing_source,closing_home_spread,closing_spread_updated_at,home_win_probability,away_win_probability,projection_source,home_spread,spread_updated_at,details'
)
        .in('cfbd_game_id', gameIds);

      if (error) throw error;
      odds = data || [];
    }

    const context = buildMatchupModelContext(ratings);

    const ratingByTeam = new Map(
      ratings.map((row) => [String(row.team_id), row])
    );

    const teamNameById = new Map(
      (teams || []).map((team) => [
        String(team.team_id),
        team.school,
      ])
    );

    const oddsByGame = new Map(
      odds.map((row) => [String(row.cfbd_game_id), row])
    );

    const results = [];

    for (const game of games || []) {
      const homeRatings = ratingByTeam.get(
        String(game.home_team_id)
      );

      const awayRatings = ratingByTeam.get(
        String(game.away_team_id)
      );

      const model = calculateMatchupProbability({
        homeRatings,
        awayRatings,
        context,
        neutralSite: game.neutral_site === true,
      });

      const gameOdds = oddsByGame.get(
        String(game.cfbd_game_id)
      );

      const closingIsMarket =
  String(gameOdds?.closing_source || '').startsWith('market_');

const currentIsMarket =
  String(gameOdds?.projection_source || '').startsWith('market_');

let marketHome = null;
let marketAway = null;
let marketSource = null;

// Prefer the frozen closing market whenever we actually have one.
if (
  closingIsMarket &&
  gameOdds?.closing_home_win_probability != null &&
  gameOdds?.closing_away_win_probability != null
) {
  marketHome = Number(
    gameOdds.closing_home_win_probability
  );

  marketAway = Number(
    gameOdds.closing_away_win_probability
  );

  marketSource = gameOdds.closing_source;
}

// Otherwise use the current quote only if it really came from a market.
else if (
  currentIsMarket &&
  gameOdds?.home_win_probability != null &&
  gameOdds?.away_win_probability != null
) {
  marketHome = Number(
    gameOdds.home_win_probability
  );

  marketAway = Number(
    gameOdds.away_win_probability
  );

  marketSource = gameOdds.projection_source;
}

      const spread =
  gameOdds?.closing_home_spread != null
    ? Number(gameOdds.closing_home_spread)
    : gameOdds?.home_spread != null
      ? Number(gameOdds.home_spread)
      : null;

      const chosen = choosePregameProbability({
        marketHomeProbability: marketHome,
        marketAwayProbability: marketAway,
        spread,
        modelResult: model,
      });

      const marketGap =
        marketHome !== null && model?.ok
          ? Math.abs(
              Number(marketHome) -
                Number(model.homeWinProbability)
            )
          : null;

      results.push({
        gameId: game.cfbd_game_id,
        week: game.week,
        startTime: game.start_time,

        homeTeam:
          teamNameById.get(String(game.home_team_id)) ??
          game.home_team_id,

        awayTeam:
          teamNameById.get(String(game.away_team_id)) ??
          game.away_team_id,

        neutralSite: game.neutral_site === true,

        completed: game.completed === true,

        spread,

        model: {
          ok: model.ok,
          homePct: pct(model.homeWinProbability),
          awayPct: pct(model.awayWinProbability),
          strengthDifference:
            model.strengthDifference ?? null,
          homeMetricsUsed:
            model.homeMetricsUsed ?? [],
          awayMetricsUsed:
            model.awayMetricsUsed ?? [],
        },

        market: {
          homePct: pct(marketHome),
          awayPct: pct(marketAway),
          source: marketSource,
        },

        comparison: {
          absoluteGapPoints:
            marketGap === null
              ? null
              : Number((marketGap * 100).toFixed(1)),
        },

        selected: {
          source: chosen.source,
          homePct: pct(chosen.homeWinProbability),
          awayPct: pct(chosen.awayWinProbability),
        },
      });
    }

    const comparable = results.filter(
      (row) =>
        row.comparison.absoluteGapPoints !== null
    );

    const meanAbsoluteError =
      comparable.length > 0
        ? comparable.reduce(
            (sum, row) =>
              sum + row.comparison.absoluteGapPoints,
            0
          ) / comparable.length
        : null;

    return NextResponse.json({
      ok: true,
      modelVersion: context.version,
      week,
      ratingsThroughWeek: throughWeek,
      ratingsTeamCount: context.teamCount,
      games: results.length,
      comparableGames: comparable.length,
      meanAbsoluteErrorPoints:
        meanAbsoluteError === null
          ? null
          : Number(meanAbsoluteError.toFixed(2)),
      results,
    });
  } catch (error) {
    console.error('Matchup Model test failed:', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Matchup Model test failed',
      },
      { status: 500 }
    );
  }
}
