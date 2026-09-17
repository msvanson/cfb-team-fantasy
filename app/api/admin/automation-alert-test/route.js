import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '../../../../lib/admin-auth.js';
import { sendAutomationFailureAlert } from '../../../../lib/automation-alerts.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  if (!await isAdminAuthenticated()) {
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

  const result = await sendAutomationFailureAlert({
    jobKey: 'test_alert',
    jobName: 'Automation Alerts',
    triggerSource: 'manual',
    errorMessage:
      'This is a test alert. No automation actually failed.',
    runId: `test-${Date.now()}`,
    startedAt: Date.now(),
    test: true
  });

  if (!result.sent) {
    const message =
      result.reason === 'not_configured'
        ? 'Email alerts are not configured yet'
        : 'The test alert could not be delivered';

    return NextResponse.json(
      {
        ok: false,
        error: message,
        reason: result.reason
      },
      {
        status: 503
      }
    );
  }

  return NextResponse.json({
    ok: true,
    message: 'Test alert sent',
    emailId: result.emailId
  });
}
