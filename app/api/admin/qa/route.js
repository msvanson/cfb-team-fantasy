import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '../../../../lib/admin-auth';
import { adminRpc } from '../../../../lib/admin-rpc';

export async function GET() {
  if (!await isAdminAuthenticated()) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const qa = await adminRpc('admin_run_qa');

    return NextResponse.json({
      ok: true,
      qa
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'QA data temporarily unavailable'
      },
      { status: 500 }
    );
  }
}
