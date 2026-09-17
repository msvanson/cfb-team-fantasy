import { NextResponse } from 'next/server';
import { getDueWaiverPeriods } from '../../../../lib/waiver-periods';
import { runWaiverPeriod } from '../../../../lib/waiver-processing';
import { runTrackedAutomation } from '../../../../lib/automation-health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;

  return (
    Boolean(secret) &&
    req.headers.get('authorization') ===
      `Bearer ${secret}`
  );
}

export async function GET(req) {
  if (!isAuthorized(req)) {
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

  try {
    const result = await runTrackedAutomation({
      jobKey: 'waivers',
      triggerSource: 'cron',
      task: async () => {
        const periods = getDueWaiverPeriods();

        if (!periods.length) {
          return {
            ok: true,
            skipped: true,
            reason: 'No period is due',
            results: []
          };
        }

        const results = [];

        for (const period of periods) {
          results.push(
            await runWaiverPeriod({
              periodKey: period.key,
              triggerSource: 'cron'
            })
          );
        }

        return {
          ok: true,
          results
        };
      },
      summarize: result => {
        const results = Array.isArray(result?.results)
          ? result.results
          : [];

        return {
          recordsUpdated: results.reduce(
            (total, item) =>
              total + Number(item?.successful || 0),
            0
          ),
          details: {
            skipped: result?.skipped === true,
            reason: result?.reason || null,
            periods: results
              .map(item => item?.period)
              .filter(Boolean),
            successfulTransactions: results.reduce(
              (total, item) =>
                total + Number(item?.successful || 0),
              0
            ),
            unsuccessfulClaims: results.reduce(
              (total, item) =>
                total + Number(item?.unsuccessful || 0),
              0
            ),
            alreadyCompleted: results.filter(
              item => item?.already_completed === true
            ).length
          }
        };
      }
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error(
      'Automatic waiver execution failed',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error: 'Automatic waiver execution failed'
      },
      {
        status: 500
      }
    );
  }
}
