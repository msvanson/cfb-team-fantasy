import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '../../../../lib/admin-auth';
import { importTeamRatings } from '../../../../lib/team-ratings';

async function authorized(req) {
  const secret = process.env.CRON_SECRET || '';
  const auth = req.headers.get('authorization') || '';

  if (secret && auth === `Bearer ${secret}`) {
    return true;
  }

  return await isAdminAuthenticated();
}

export async function GET(req) {
  if (!(await authorized(req))) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const url = new URL(req.url);

    const throughWeek = Number(
      url.searchParams.get('week') ?? 0
    );

    if (
      !Number.isInteger(throughWeek) ||
      throughWeek < 0 ||
      throughWeek > 20
    ) {
      return NextResponse.json(
        { ok: false, error: 'Invalid week' },
        { status: 400 }
      );
    }

    const result = await importTeamRatings({
      year: 2026,
      throughWeek,
      seasonType: 'regular',
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Team ratings import failed:', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Team ratings import failed',
      },
      { status: 500 }
    );
  }
}
