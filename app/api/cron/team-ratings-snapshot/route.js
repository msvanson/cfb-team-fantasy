import { NextResponse } from 'next/server';
import { runWeeklyTeamRatingsSnapshot } from '../../../../lib/team-ratings-snapshot';

function authorized(req) {
  const secret = process.env.CRON_SECRET || '';
  const auth = req.headers.get('authorization') || '';

  return Boolean(
    secret &&
    auth === `Bearer ${secret}`
  );
}

export async function GET(req) {
  if (!authorized(req)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Unauthorized',
      },
      {
        status: 401,
      }
    );
  }

  try {
    const result =
      await runWeeklyTeamRatingsSnapshot({
        year: 2026,
        seasonType: 'regular',
      });

    return NextResponse.json(result);
  } catch (error) {
    console.error(
      'Weekly team ratings snapshot failed:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          'Weekly team ratings snapshot failed',
      },
      {
        status: 500,
      }
    );
  }
}
