import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminAuthenticated } from '../../../../lib/admin-auth';
import { runTrackedAutomation } from '../../../../lib/automation-health';

export const dynamic = 'force-dynamic';

const supabase = createClient(
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

export async function POST(request) {
  if (!await isAdminAuthenticated()) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  let body = {};

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid request body' },
      { status: 400 }
    );
  }

  if (body.jobKey !== 'standings_snapshot') {
    return NextResponse.json(
      { ok: false, error: 'Unsupported automation job' },
      { status: 400 }
    );
  }

  if (body.confirm !== 'CAPTURE') {
    return NextResponse.json(
      {
        ok: false,
        error: 'Type CAPTURE to confirm the standings snapshot'
      },
      { status: 400 }
    );
  }

  try {
    const result = await runTrackedAutomation({
      jobKey: 'standings_snapshot',
      triggerSource: 'manual',
      details: {
        requestedBy: 'commissioner'
      },
      task: async () => {
        const {
          data: recent,
          error: recentError
        } = await supabase
          .from('standings_rank_snapshots')
          .select('snapshot_at')
          .eq('season_id', 1)
          .order('snapshot_at', {
            ascending: false
          })
          .limit(1)
          .maybeSingle();

        if (recentError) throw recentError;

        const recentAge = recent?.snapshot_at
          ? Date.now() - Date.parse(recent.snapshot_at)
          : null;

        if (
          recentAge !== null &&
          recentAge < 10 * 60 * 1000
        ) {
          return {
            ok: true,
            skipped: true,
            reason: 'A standings snapshot was already captured within the last ten minutes',
            snapshotAt: recent.snapshot_at,
            rowsSaved: 0
          };
        }

        const { data, error } = await supabase.rpc(
          'capture_standings_rank_snapshot',
          { p_season_id: 1 }
        );

        if (error) throw error;

        const {
          count,
          error: countError
        } = await supabase
          .from('standings_rank_snapshots')
          .select('id', {
            count: 'exact',
            head: true
          })
          .eq('season_id', 1)
          .eq('snapshot_at', data);

        return {
          ok: true,
          snapshotAt: data,
          rowsSaved: countError
            ? null
            : count,
          countWarning: countError
            ? countError.message
            : null
        };
      },
      summarize: captured => ({
        recordsUpdated: captured?.rowsSaved,
        details: {
          requestedBy: 'commissioner',
          snapshotAt: captured?.snapshotAt || null,
          skipped: captured?.skipped === true,
          reason: captured?.reason || null,
          countWarning: captured?.countWarning || null
        }
      })
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error(
      'Manual standings snapshot failed',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error: 'Manual standings snapshot failed'
      },
      { status: 500 }
    );
  }
}
