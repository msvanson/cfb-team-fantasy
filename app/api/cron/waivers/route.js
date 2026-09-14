import { NextResponse } from 'next/server';
import { getDueWaiverPeriods } from '../../../../lib/waiver-periods';
import { runWaiverPeriod } from '../../../../lib/waiver-processing';

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

  const periods = getDueWaiverPeriods();

  if (!periods.length) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'No period is due'
    });
  }

  try {
    const results = [];

    for (const period of periods) {
      results.push(
        await runWaiverPeriod({
          periodKey: period.key,
          triggerSource: 'cron'
        })
      );
    }

    return NextResponse.json({
      ok: true,
      results
    });
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
