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

function buildRecapText({
  weekKey,
  winner,
  biggestMover
}) {
  const sentences = [
    `${winner.rosterName} won ${weekKey} with ${winner.weeklyPoints} fantasy points and a ${winner.weeklyPointDifferential >= 0 ? '+' : ''}${winner.weeklyPointDifferential} point differential.`
  ];

  if (biggestMover?.movement > 0) {
    sentences.push(
      `${biggestMover.rosterName} made the biggest standings move, climbing ${biggestMover.movement} place${biggestMover.movement === 1 ? '' : 's'} to No. ${biggestMover.currentRank}.`
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

  const [snapshotResult, ownerResult] = await Promise.all([
    supabase
      .from('weekly_snapshots')
      .select(
        'week_key,owner_id,weekly_rank,weekly_points,weekly_point_differential,result,finalized_at'
      )
      .eq('season_id', seasonId)
      .in('week_key', includedWeeks),
    supabase
      .from('owners')
      .select('id,name,roster_name,draft_slot')
      .eq('season_id', seasonId)
  ]);

  if (snapshotResult.error) throw snapshotResult.error;
  if (ownerResult.error) throw ownerResult.error;

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

  if (!weeklyRows.length) {
    throw new Error(
      `${weekKey} does not have a complete finalized snapshot`
    );
  }

  const winnerRow = weeklyRows[0];
  const winnerOwner = ownerMap.get(
    Number(winnerRow.owner_id)
  );

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

  const winner = {
    ownerId: Number(winnerRow.owner_id),
    ownerName: winnerOwner?.name || 'Roster',
    rosterName: ownerLabel(winnerOwner),
    weeklyPoints: Number(winnerRow.weekly_points || 0),
    weeklyPointDifferential: Number(
      winnerRow.weekly_point_differential || 0
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
    biggestMover: biggestMover?.movement > 0
      ? biggestMover
      : null,
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
      biggestMover
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
