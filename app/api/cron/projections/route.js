import { NextResponse } from 'next/server';
import { runProjectionImport } from '../../../../lib/projections';
import { runTrackedAutomation } from '../../../../lib/automation-health';

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
      jobKey: 'projections',
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

        if (p.weekday !== 'Sun' || p.hour !== '05') {
          return {
            ok: true,
            skipped: true,
            reason: 'Not Sunday 5 AM Eastern'
          };
        }

        return await runProjectionImport();
      },
      summarize: result => ({
        recordsUpdated: result?.mapped,
        details: {
          mode: result?.mode,
          source: result?.source,
          projectionRunId: result?.runId,
          skipped: result?.skipped === true,
          reason: result?.reason || null
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
