import { createClient } from '@supabase/supabase-js';

const DUPLICATE_WINDOW_HOURS = 6;
const DEFAULT_ADMIN_URL =
  'https://cfb-team-fantasy.vercel.app/admin';

let client;

function getClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  return client;
}

function cleanText(value, fallback = 'Unknown error') {
  return String(value || fallback).slice(0, 2000);
}

function escapeHtml(value) {
  return cleanText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function isDuplicateFailure({
  jobKey,
  errorMessage,
  runId
}) {
  const supabase = getClient();

  if (!supabase || !runId) return false;

  const since = new Date(
    Date.now() -
      DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString();

  try {
    const { data, error } = await supabase
      .from('automation_job_runs')
      .select('id')
      .eq('job_key', jobKey)
      .eq('status', 'failed')
      .eq('error_message', errorMessage)
      .neq('id', runId)
      .gte('started_at', since)
      .limit(1);

    if (error) throw error;

    return Boolean(data?.length);
  } catch (error) {
    console.error(
      `Could not check duplicate alert for ${jobKey}`,
      error
    );

    return false;
  }
}

export async function sendAutomationFailureAlert({
  jobKey,
  jobName,
  triggerSource,
  errorMessage,
  runId,
  startedAt,
  test = false
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const recipient =
    process.env.AUTOMATION_ALERT_EMAIL;

  if (!apiKey || !recipient) {
    console.warn(
      'Automation failure email is not configured'
    );

    return {
      sent: false,
      reason: 'not_configured'
    };
  }

  const message = cleanText(errorMessage);

  if (
    !test &&
    await isDuplicateFailure({
      jobKey,
      errorMessage: message,
      runId
    })
  ) {
    console.info(
      `Duplicate automation alert suppressed for ${jobKey}`
    );

    return {
      sent: false,
      reason: 'duplicate'
    };
  }

  const from =
    process.env.AUTOMATION_ALERT_FROM ||
    'CFB Team Fantasy <onboarding@resend.dev>';

  const adminUrl =
    process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/admin`
      : DEFAULT_ADMIN_URL;

  const displayedName =
    jobName || jobKey || 'Automation';

  const occurredAt = new Date(
    startedAt || Date.now()
  ).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'medium',
    timeStyle: 'long'
  });

  const subject = test
    ? '[CFB Team Fantasy] Test automation alert'
    : `[CFB Team Fantasy] ${displayedName} failed`;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#172033;max-width:600px">
      <h2 style="margin-bottom:8px">
        ${test ? 'Test alert successful' : 'Automation failure'}
      </h2>
      <p>
        ${test
          ? 'CFB Team Fantasy automation alerts are configured correctly.'
          : 'A scheduled website automation needs attention.'}
      </p>
      <table style="border-collapse:collapse;width:100%;margin:20px 0">
        <tr>
          <td style="padding:8px;border:1px solid #d7dce5"><strong>Job</strong></td>
          <td style="padding:8px;border:1px solid #d7dce5">${escapeHtml(displayedName)}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #d7dce5"><strong>Trigger</strong></td>
          <td style="padding:8px;border:1px solid #d7dce5">${escapeHtml(triggerSource || 'manual')}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #d7dce5"><strong>Time</strong></td>
          <td style="padding:8px;border:1px solid #d7dce5">${escapeHtml(occurredAt)} ET</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #d7dce5"><strong>Error</strong></td>
          <td style="padding:8px;border:1px solid #d7dce5">${escapeHtml(message)}</td>
        </tr>
      </table>
      <p>
        <a href="${adminUrl}" style="display:inline-block;padding:10px 16px;background:#183153;color:#ffffff;text-decoration:none;border-radius:6px">
          Open Automation Health Center
        </a>
      </p>
    </div>
  `;

  try {
    const response = await fetch(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'idempotency-key':
            `automation-${jobKey}-${runId || Date.now()}`
        },
        body: JSON.stringify({
          from,
          to: [recipient],
          subject,
          html
        }),
        signal: AbortSignal.timeout(8000)
      }
    );

    if (!response.ok) {
      throw new Error(
        `Resend returned status ${response.status}`
      );
    }

    const result = await response.json();

    return {
      sent: true,
      emailId: result?.id || null
    };
  } catch (error) {
    console.error(
      `Could not send automation alert for ${jobKey}`,
      error
    );

    return {
      sent: false,
      reason: 'provider_error'
    };
  }
}
