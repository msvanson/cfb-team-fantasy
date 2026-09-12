import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminAuthenticated } from '../../../../lib/admin-auth';
import {
  getLatestDueWaiverPeriod,
  getOpenWaiverPeriod
} from '../../../../lib/waiver-periods';
import { buildWaiverPlan } from '../../../../lib/waiver-processing';

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false
      }
    }
  );

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Unauthorized'
      },
      {
        status: 401
      }
    );
  }

  const supabase = sb();
  const due = getLatestDueWaiverPeriod();
  const open = getOpenWaiverPeriod();

  let periodKey = open.key;

  if (due) {
    const { count, error } = await supabase
      .from('waiver_claims')
      .select('id', {
        count: 'exact',
        head: true
      })
      .eq('season_id', 1)
      .eq('waiver_period_key', due.key)
      .eq('status', 'pending');

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message
        },
        {
          status: 500
        }
      );
    }

    if (count > 0) {
      periodKey = due.key;
    }
  }

  if (periodKey === 'CLOSED') {
    return NextResponse.json({
      ok: true,
      period: periodKey,
      steps: [],
      message: 'Waivers are closed.'
    });
  }

  const [
    claimsResult,
    teamsResult,
    standingsResult
  ] = await Promise.all([
    supabase
      .from('waiver_claims')
      .select('*')
      .eq('season_id', 1)
      .eq('waiver_period_key', periodKey)
      .eq('status', 'pending')
      .order('priority'),

    supabase
      .from('team_directory')
      .select('*')
      .eq('season_id', 1),

    supabase
      .from('official_waiver_order')
      .select('*')
      .eq('season_id', 1)
      .order('waiver_priority')
  ]);

  const error =
    claimsResult.error ||
    teamsResult.error ||
    standingsResult.error;

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message
      },
      {
        status: 500
      }
    );
  }

  try {
    const { order, steps } = buildWaiverPlan({
      claims: claimsResult.data || [],
      teams: teamsResult.data || [],
      standings: standingsResult.data || []
    });

    const ownerNames = new Map(
      order.map((owner) => [
        Number(owner.owner_id),
        owner.owner_name
      ])
    );

    const previewSteps = steps.map((step) => ({
      round: step.round,
      waiver_order: step.waiver_order,
      owner: step.owner_name,
      claim_priority: step.claim_priority,
      status:
        step.status === 'successful'
          ? 'would_succeed'
          : step.status,
      add: step.add_team_name,
      drop: step.drop_team_name,
      reason: step.reason,
      competing_owners:
        (step.competing_owner_ids || [])
          .map((ownerId) =>
            ownerNames.get(Number(ownerId))
          )
          .filter(Boolean)
    }));

    const successful = previewSteps.filter(
      (step) =>
        step.status === 'would_succeed'
    );

    const rounds = [
      ...new Set(
        successful.map((step) => step.round)
      )
    ]
      .sort((a, b) => a - b)
      .map((round) => ({
        round,
        transactions: successful.filter(
          (step) => step.round === round
        )
      }));

    return NextResponse.json({
      ok: true,
      dry_run: true,
      period: periodKey,

      waiver_order: order.map(
        (owner, index) => ({
          order: index + 1,
          owner_id: owner.owner_id,
          owner: owner.owner_name,
          points: owner.fantasy_points,
          point_differential:
            owner.point_differential,
          draft_slot: owner.draft_slot
        })
      ),

      rounds,

      unsuccessful_claims:
        previewSteps.filter(
          (step) =>
            step.status !== 'would_succeed'
        ),

      steps: previewSteps,

      summary: {
        successful: successful.length,

        lost: previewSteps.filter(
          (step) =>
            step.status ===
            'lost_to_priority'
        ).length,

        invalid: previewSteps.filter(
          (step) =>
            step.status === 'invalid'
        ).length
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message
      },
      {
        status: 500
      }
    );
  }
}
