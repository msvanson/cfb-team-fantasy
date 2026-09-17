import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '../../../../lib/admin-auth';
import { runProjectionImport } from '../../../../lib/projections';
import { runTrackedAutomation } from '../../../../lib/automation-health';

export async function POST() {
  if (!await isAdminAuthenticated()) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const result = await runTrackedAutomation({
      jobKey: 'projections',
      triggerSource: 'manual',
      task: () => runProjectionImport(),
      summarize: imported => ({
        recordsUpdated: imported?.mapped,
        details: {
          mode: imported?.mode || null,
          source: imported?.source || null,
          projectionRunId: imported?.runId || null,
          requestedBy: 'commissioner'
        }
      })
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error(
      'Manual projection refresh failed',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error: 'Projection import failed because of an internal error'
      },
      { status: 500 }
    );
  }
}
