import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runTrackedAutomation } from '../../../../lib/automation-health';

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

function isAuthorizedCronRequest(req) {
  const secret = process.env.CRON_SECRET || '';
  const authHeader = req.headers.get('authorization') || '';

  return Boolean(secret) && authHeader === `Bearer ${secret}`;
}

export async function GET(req) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const result = await runTrackedAutomation({
      jobKey: 'standings_snapshot',
      triggerSource: 'cron',
      task: async () => {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23'
        }).formatToParts(new Date());

        const p = Object.fromEntries(
          parts.map(x => [x.type, x.value])
        );

        if (p.weekday !== 'Sun' || p.hour !== '06') {
          return {
            ok: true,
            skipped: true,
            reason: 'Not Sunday 6 AM Eastern'
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
      summarize: result => ({
        recordsUpdated: result?.rowsSaved,
        details: {
          snapshotAt: result?.snapshotAt || null,
          skipped: result?.skipped === true,
          reason: result?.reason || null,
          countWarning: result?.countWarning || null
        }
      })
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || String(error)
      },
      { status: 500 }
    );
  }
}
