import { createClient } from '@supabase/supabase-js';
import { FANTASY_WEEKS_2026 } from './fantasy-weeks';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );
}

function ownerLabel(owner) {
  return owner?.roster_name || owner?.name || 'Roster';
}

function signed(value) {
  const number = Number(value || 0);
  return `${number > 0 ? '+' : ''}${number}`;
}

function rankCumulative(rows, owners, includedWeeks) {
  const included = new Set(includedWeeks);
  const totals = new Map(
    owners.map(owner => [
      Number(owner.id),
      {
        ownerId: Number(owner.id),
        ownerName: owner.name,
        rosterName: ownerLabel(owner),
        draftSlot: Number(owner.draft_slot),
        fantasyPoints: 0,
        pointDifferential: 0
      }
    ])
  );

  for (const row of rows) {
    if (!included.has(row.week_key)) continue;

    const total = totals.get(Number(row.owner_id));
    if (!total) continue;

    total.fantasyPoints += Number(row.weekly_points || 0);
    total.pointDifferential += Number(
      row.weekly_point_differential || 0
    );
  }

  return [...totals.values()]
    .sort((a, b) =>
      b.fantasyPoints - a.fantasyPoints ||
      b.pointDifferential - a.pointDifferential ||
      a.draftSlot - b.draftSlot
    )
    .map((row, index) => ({
      ...row,
      rank: index + 1
    }));
}

function bestCollegeTeam(games, teams, owners) {
  const teamMap = new Map(
    teams.map(team => [Number(team.id), team])
  );
  const ownerMap = new Map(
    owners.map(owner => [Number(owner.id), owner])
  );
  const totals = new Map();

  for (const game of games) {
    const teamId = Number(game.team_id);
    const current = totals.get(teamId) || {
      teamId,
      ownerId: Number(game.owner_id),
      fantasyPoints: 0,
      pointDifferential: 0,
      gamesPlayed: 0
    };

    current.fantasyPoints += Number(game.fantasy_points || 0);
    current.pointDifferential += Number(
      game.point_differential || 0
    );
    current.gamesPlayed += 1;
    totals.set(teamId, current);
  }

  const ordered = [...totals.values()].sort((a, b) => {
    const aTeam = teamMap.get(a.teamId);
    const bTeam = teamMap.get(b.teamId);

    return (
      b.fantasyPoints - a.fantasyPoints ||
      b.pointDifferential - a.pointDifferential ||
      String(aTeam?.school || '').localeCompare(
        String(bTeam?.school || '')
      )
    );
  });

  if (!ordered.length) return null;

  const best = ordered[0];
  const team = teamMap.get(best.teamId);
  const owner = ownerMap.get(best.ownerId);

  return {
    ...best,
    school: team?.school || 'College team',
    abbreviation: team?.abbreviation || '',
    mascot: team?.mascot || '',
    ownerName: owner?.name || 'Roster',
    rosterName: ownerLabel(owner)
  };
}

function buildRecapText({
  weekKey,
  winner,
  runnerUp,
  winningMargin,
  biggestMover,
  bestTeam
}) {
  const finish = winningMargin === 0
    ? `${winner.rosterName} won the tiebreaker over ${runnerUp.rosterName}`
    : `${winner.rosterName} finished ${winningMargin} point${winningMargin === 1 ? '' : 's'} ahead of ${runnerUp.rosterName}`;

  const sentences = [
    `${winner.rosterName} won ${weekKey} with ${winner.weeklyPoints} fantasy points. ${finish}.`
  ];

  if (biggestMover?.movement > 0) {
    sentences.push(
      `${biggestMover.rosterName} made the biggest standings move, climbing ${biggestMover.movement} place${biggestMover.movement === 1 ? '' : 's'} to No. ${biggestMover.currentRank}.`
    );
  }

  if (bestTeam) {
    sentences.push(
      `${bestTeam.school} delivered the best college-team performance with ${bestTeam.fantasyPoints} fantasy point${bestTeam.fantasyPoints === 1 ? '' : 's'} and a ${signed(bestTeam.pointDifferential)} point differential for ${bestTeam.rosterName}.`
    );
  }

  return sentences.join(' ');
}

export async function generateWeeklyRecap({
  seasonId = 1,
  weekKey,
  supabase = serviceClient()
}) {
  const weekIndex = FANTASY_WEEKS_2026.findIndex(
    week => week.key === weekKey
  );

  if (weekIndex < 0) {
    throw new Error(`Unknown fantasy week: ${weekKey}`);
  }

  const { data: existing, error: existingError } = await supabase
    .from('weekly_recaps')
    .select('*')
    .eq('season_id', seasonId)
    .eq('week_key', weekKey)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    return {
      created: false,
      recap: existing
    };
  }

  const includedWeeks = FANTASY_WEEKS_2026
    .slice(0, weekIndex + 1)
    .map(week => week.key);

  const [snapshotResult, gameResult, ownerResult, teamResult] =
    await Promise.all([
      supabase
        .from('weekly_snapshots')
        .select(
          'week_key,owner_id,weekly_rank,weekly_points,weekly_point_differential,result,finalized_at'
        )
        .eq('season_id', seasonId)
        .in('week_key', includedWeeks),
      supabase
        .from('weekly_snapshot_games')
        .select(
          'owner_id,team_id,fantasy_points,point_differential'
        )
        .eq('season_id', seasonId)
        .eq('week_key', weekKey),
      supabase
        .from('owners')
        .select('id,name,roster_name,draft_slot')
        .eq('season_id', seasonId),
      supabase
        .from('teams')
        .select('id,school,abbreviation,mascot')
    ]);

  if (snapshotResult.error) throw snapshotResult.error;
  if (gameResult.error) throw gameResult.error;
  if (ownerResult.error) throw ownerResult.error;
  if (teamResult.error) throw teamResult.error;

  const snapshots = snapshotResult.data || [];
  const owners = ownerResult.data || [];
  const ownerMap = new Map(
    owners.map(owner => [Number(owner.id), owner])
  );
  const weeklyRows = snapshots
    .filter(row => row.week_key === weekKey)
    .sort((a, b) =>
      Number(a.weekly_rank) - Number(b.weekly_rank)
    );

  if (weeklyRows.length < 2) {
    throw new Error(
      `${weekKey} does not have a complete finalized snapshot`
    );
  }

  const winnerRow = weeklyRows[0];
  const runnerUpRow = weeklyRows[1];
  const winnerOwner = ownerMap.get(Number(winnerRow.owner_id));
  const runnerUpOwner = ownerMap.get(Number(runnerUpRow.owner_id));
  const winningMargin = Number(winnerRow.weekly_points || 0) -
    Number(runnerUpRow.weekly_points || 0);

  const currentStandings = rankCumulative(
    snapshots,
    owners,
    includedWeeks
  );
  const previousStandings = weekIndex > 0
    ? rankCumulative(
        snapshots,
        owners,
        includedWeeks.slice(0, -1)
      )
    : [];
  const previousRankMap = new Map(
    previousStandings.map(row => [row.ownerId, row.rank])
  );
  const weeklyRowMap = new Map(
    weeklyRows.map(row => [Number(row.owner_id), row])
  );

  const standings = currentStandings.map(row => {
    const previousRank = previousRankMap.get(row.ownerId) || null;
    const weekly = weeklyRowMap.get(row.ownerId);

    return {
      ownerId: row.ownerId,
      ownerName: row.ownerName,
      rosterName: row.rosterName,
      previousRank,
      currentRank: row.rank,
      movement: previousRank === null
        ? 0
        : previousRank - row.rank,
      weeklyPoints: Number(weekly?.weekly_points || 0),
      weeklyPointDifferential: Number(
        weekly?.weekly_point_differential || 0
      ),
      seasonPoints: row.fantasyPoints,
      seasonPointDifferential: row.pointDifferential
    };
  });

  const biggestMover = weekIndex > 0
    ? [...standings].sort((a, b) =>
        b.movement - a.movement ||
        a.currentRank - b.currentRank
      )[0]
    : null;
  const bestTeam = bestCollegeTeam(
    gameResult.data || [],
    teamResult.data || [],
    owners
  );
  const winner = {
    ownerId: Number(winnerRow.owner_id),
    ownerName: winnerOwner?.name || 'Roster',
    rosterName: ownerLabel(winnerOwner),
    weeklyPoints: Number(winnerRow.weekly_points || 0),
    weeklyPointDifferential: Number(
      winnerRow.weekly_point_differential || 0
    )
  };
  const runnerUp = {
    ownerId: Number(runnerUpRow.owner_id),
    ownerName: runnerUpOwner?.name || 'Roster',
    rosterName: ownerLabel(runnerUpOwner),
    weeklyPoints: Number(runnerUpRow.weekly_points || 0),
    weeklyPointDifferential: Number(
      runnerUpRow.weekly_point_differential || 0
    )
  };
  const finalizedAt = weeklyRows
    .map(row => row.finalized_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  const recapData = {
    weekKey,
    winner,
    runnerUp,
    closestFinish: {
      winningMargin,
      winnerPointDifferential: winner.weeklyPointDifferential,
      runnerUpPointDifferential: runnerUp.weeklyPointDifferential
    },
    biggestMover: biggestMover?.movement > 0
      ? biggestMover
      : null,
    bestTeam,
    standings
  };

  const payload = {
    season_id: seasonId,
    week_key: weekKey,
    status: 'draft',
    headline: `${winner.rosterName} wins ${weekKey}`,
    recap_text: buildRecapText({
      weekKey,
      winner,
      runnerUp,
      winningMargin,
      biggestMover,
      bestTeam
    }),
    recap_data: recapData,
    source_finalized_at: finalizedAt,
    generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data: recap, error: insertError } = await supabase
    .from('weekly_recaps')
    .insert(payload)
    .select('*')
    .single();

  if (insertError?.code === '23505') {
    const { data: concurrent, error: concurrentError } =
      await supabase
        .from('weekly_recaps')
        .select('*')
        .eq('season_id', seasonId)
        .eq('week_key', weekKey)
        .single();

    if (concurrentError) throw concurrentError;

    return {
      created: false,
      recap: concurrent
    };
  }

  if (insertError) throw insertError;

  return {
    created: true,
    recap
  };
}

export async function generateMissingWeeklyRecaps({
  seasonId = 1,
  supabase = serviceClient()
} = {}) {
  const { data, error } = await supabase
    .from('weekly_snapshots')
    .select('week_key')
    .eq('season_id', seasonId);

  if (error) throw error;

  const finalized = new Set(
    (data || []).map(row => row.week_key)
  );
  const results = [];

  for (const week of FANTASY_WEEKS_2026) {
    if (!finalized.has(week.key)) continue;

    const result = await generateWeeklyRecap({
      seasonId,
      weekKey: week.key,
      supabase
    });

    results.push({
      weekKey: week.key,
      created: result.created,
      status: result.recap?.status || null
    });
  }

  return results;
}
