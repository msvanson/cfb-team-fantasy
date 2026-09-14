import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '../../../../lib/admin-auth';
import { getLatestDueWaiverPeriod } from '../../../../lib/waiver-periods';
import { runWaiverPeriod } from '../../../../lib/waiver-processing';

export async function POST(req) {
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

  const body = await req
    .json()
    .catch(() => ({}));

  if (body.confirm !== 'EXECUTE') {
    return NextResponse.json(
      {
        ok: false,
        error: 'Confirmation required'
      },
      {
        status: 400
      }
    );
  }

  const period = getLatestDueWaiverPeriod();

  if (!period) {
    return NextResponse.json(
      {
        ok: false,
        error: 'No waiver period is due yet.'
      },
      {
        status: 400
      }
    );
  }

  if (body.period !== period.key) {
    return NextResponse.json(
      {
        ok: false,
        error:
          `${body.period || 'That period'} ` +
          'is not due for processing.'
      },
      {
        status: 400
      }
    );
  }

  try {
    const result = await runWaiverPeriod({
      periodKey: period.key,
      triggerSource: 'manual'
    });

    return NextResponse.json({
      ...result,
      message: result.already_completed
        ? `${period.key} was already processed.`
        : `Manual ${period.key} waiver run completed.`
    });
  } catch (error) {
    console.error(
      'Manual waiver execution failed',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          'Waiver execution stopped because of an internal error'
      },
      {
        status: 500
      }
    );
  }
}
