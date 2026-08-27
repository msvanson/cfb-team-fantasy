import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '../../../../lib/admin-auth';
import { runProjectionImport } from '../../../../lib/projections';

export async function POST() {
  if (!await isAdminAuthenticated()) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    return NextResponse.json(
      await runProjectionImport()
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'Projection import failed because of an internal error'
      },
      { status: 500 }
    );
  }
}
