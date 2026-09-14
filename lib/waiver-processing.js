import { createClient } from '@supabase/supabase-js';

const SEASON_ID = 1;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

function legalDrops(roster, target) {
  const counts = new Map();

  for (const team of roster) {
    counts.set(
      team.conference_code,
      (counts.get(team.conference_code) || 0) + 1
    );
  }

  const doubled = new Set(
    [...counts]
      .filter(([, count]) => count > 1)
      .map(([conference]) => conference)
  );

  return roster.filter(
    (team) =>
      team.conference_code === target.conference_code ||
      doubled.has(team.conference_code)
  );
}

export function buildWaiverPlan({ claims, teams, standings }) {
  const order = [...standings].sort(
    (a, b) =>
      Number(a.waiver_priority) -
      Number(b.waiver_priority)
  );

  const orderIndex = new Map(
    order.map((owner, index) => [
      Number(owner.owner_id),
      index + 1
    ])
  );

  const teamMap = new Map(
    teams.map((team) => [
      Number(team.team_id),
      team
    ])
  );

  const rosters = new Map(
    order.map((owner) => [
      Number(owner.owner_id),
      teams
        .filter(
          (team) =>
            Number(team.owner_id) ===
            Number(owner.owner_id)
        )
        .map((team) => ({ ...team }))
    ])
  );

  const queues = new Map(
    order.map((owner) => [
      Number(owner.owner_id),
      claims
        .filter(
          (claim) =>
            Number(claim.owner_id) ===
            Number(owner.owner_id)
        )
        .sort(
          (a, b) =>
            Number(a.priority) -
            Number(b.priority)
        )
        .map((claim) => ({ ...claim }))
    ])
  );

  const claimedTeams = new Set();
  const steps = [];

  let round = 1;
  let awardedInRound = true;

  while (awardedInRound) {
    awardedInRound = false;

    for (const owner of order) {
      const ownerId = Number(owner.owner_id);
      const queue = queues.get(ownerId) || [];

      while (queue.length) {
        const claim = queue.shift();
        const addTeamId = Number(claim.add_team_id);
        const dropTeamId = Number(claim.drop_team_id);
        const target = teamMap.get(addTeamId);
        const roster = rosters.get(ownerId) || [];

        const drop = roster.find(
          (team) =>
            Number(team.team_id) === dropTeamId
        );

        const base = {
          claim_id: Number(claim.id),
          owner_id: ownerId,
          owner_name: owner.owner_name,
          claim_priority: Number(claim.priority),
          round,
          waiver_order: orderIndex.get(ownerId),
          add_team_id: addTeamId,
          add_team_name:
            target?.school || `Team ${addTeamId}`,
          drop_team_id: dropTeamId,
          drop_team_name:
            drop?.school || `Team ${dropTeamId}`
        };

        if (claimedTeams.has(addTeamId)) {
          steps.push({
            ...base,
            status: 'lost_to_priority',
            reason:
              'Target won by a higher-priority claim'
          });

          continue;
        }

        if (
          !target ||
          target.is_owned ||
          Number(target.wins || 0) >= 5
        ) {
          steps.push({
            ...base,
            status: 'invalid',
            reason:
              'Target is no longer eligible or available'
          });

          continue;
        }

        if (
          !drop ||
          !legalDrops(roster, target).some(
            (team) =>
              Number(team.team_id) === dropTeamId
          )
        ) {
          steps.push({
            ...base,
            status: 'invalid',
            reason:
              'Add/drop is no longer roster-legal'
          });

          continue;
        }

        const competingOwners = claims
          .filter(
            (other) =>
              Number(other.add_team_id) ===
                addTeamId &&
              Number(other.owner_id) !== ownerId
          )
          .map((other) =>
            Number(other.owner_id)
          );

        steps.push({
          ...base,
          status: 'successful',
          competing_owner_ids: [
            ...new Set(competingOwners)
          ]
        });

        claimedTeams.add(addTeamId);
        awardedInRound = true;

        const rosterIndex = roster.findIndex(
          (team) =>
            Number(team.team_id) === dropTeamId
        );

        roster[rosterIndex] = {
          ...target,
          owner_id: ownerId,
          owner_name: owner.owner_name,
          roster_slot: drop.roster_slot,
          is_owned: true
        };

        break;
      }
    }

    round += 1;

    if (round > 100) {
      throw new Error(
        'Waiver processing exceeded 100 rounds'
      );
    }
  }

  if (steps.length !== claims.length) {
    throw new Error(
      'Waiver order does not include every pending claim owner'
    );
  }

  return { order, steps };
}

export async function runWaiverPeriod({
  periodKey,
  triggerSource
}) {
  const supabase = adminClient();

  const [
    claimsResult,
    teamsResult,
    standingsResult
  ] = await Promise.all([
    supabase
      .from('waiver_claims')
      .select('*')
      .eq('season_id', SEASON_ID)
      .eq('waiver_period_key', periodKey)
      .eq('status', 'pending')
      .order('priority'),

    supabase
      .from('team_directory')
      .select('*')
      .eq('season_id', SEASON_ID),

    supabase
      .from('official_waiver_order')
      .select('*')
      .eq('season_id', SEASON_ID)
      .order('waiver_priority')
  ]);

  const readError =
    claimsResult.error ||
    teamsResult.error ||
    standingsResult.error;

  if (readError) {
    throw new Error(readError.message);
  }

  const { steps } = buildWaiverPlan({
    claims: claimsResult.data || [],
    teams: teamsResult.data || [],
    standings: standingsResult.data || []
  });

  const effectiveAt = new Date().toISOString();

  const { data, error } = await supabase.rpc(
    'execute_waiver_period',
    {
      p_season_id: SEASON_ID,
      p_period: periodKey,
      p_steps: steps,
      p_trigger_source: triggerSource,
      p_effective_at: effectiveAt
    }
  );

  if (error) {
    await supabase.rpc(
      'record_waiver_processing_failure',
      {
        p_season_id: SEASON_ID,
        p_period: periodKey,
        p_trigger_source: triggerSource,
        p_error: error.message
      }
    );

    throw new Error(error.message);
  }

  return data;
}
