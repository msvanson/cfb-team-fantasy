import { NextResponse } from 'next/server';
import { runProjectionImport } from '../../../../lib/projections';

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

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());

  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));

  if (p.weekday !== 'Sun' || p.hour !== '05') {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'Not Sunday 5 AM Eastern'
    });
  }

  try {
    return NextResponse.json(await runProjectionImport());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
