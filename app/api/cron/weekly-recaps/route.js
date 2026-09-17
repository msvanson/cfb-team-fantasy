import { NextResponse } from 'next/server';
import { finalizeEndedFantasyWeeks } from '../../../../lib/weekly-snapshots';
import { generateMissingWeeklyRecaps } from '../../../../lib/weekly-recaps';
import { runTrackedAutomation } from '../../../../lib/automation-health';

export const dynamic = 'force-dynamic';

function isAuthorizedCronRequest(request) {
  const secret = process.env.CRON_SECRET || '';
  const authorization = request.headers.get('authorization') || '';

  return Boolean(secret) && authorization === `Bearer ${secret}`;
}

function easternTime(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);

  return Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );
}

export async function GET(request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const result = await runTrackedAutomation({
      jobKey: 'weekly_recaps',
      triggerSource: 'cron',
      task: async () => {
        const now = new Date();
        const eastern = easternTime(now);

        if (
          eastern.weekday !== 'Mon' ||
          eastern.hour !== '05' ||
          eastern.minute !== '15'
        ) {
          return {
            ok: true,
            skipped: true,
            reason: 'Not Monday at 5:15 AM Eastern'
          };
        }

        const finalized = await finalizeEndedFantasyWeeks(now);
        const generated = await generateMissingWeeklyRecaps({
          seasonId: 1
        });
        const newlyFinalized = finalized.filter(
          week => week.status === 'finalized'
        );
        const finalizationErrors = finalized.filter(
          week => week.status === 'error'
        );
        const created = generated.filter(
          week => week.created
        );

        if (finalizationErrors.length) {
          throw new Error(
            `Weekly snapshot finalization failed for ${finalizationErrors.map(week => week.week_key).join(', ')}`
          );
        }

        return {
          ok: true,
          finalizedWeeks: newlyFinalized.map(
            week => week.week_key
          ),
          createdWeeks: created.map(
            week => week.weekKey
          ),
          finalizedCount: newlyFinalized.length,
          createdCount: created.length,
          checkedCount: generated.length
        };
      },
      summarize: completed => ({
        recordsUpdated: completed?.createdCount ?? 0,
        details: {
          skipped: completed?.skipped === true,
          reason: completed?.reason || null,
          finalizedCount: completed?.finalizedCount ?? null,
          createdCount: completed?.createdCount ?? null,
          checkedCount: completed?.checkedCount ?? null,
          finalizedWeeks: completed?.finalizedWeeks || [],
          createdWeeks: completed?.createdWeeks || []
        }
      })
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Weekly recap automation failed', error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Weekly recap automation failed'
      },
      { status: 500 }
    );
  }
}
