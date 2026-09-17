import { createClient } from '@supabase/supabase-js';

export const AUTOMATION_JOBS = {
  projections: {
    name: 'Season Projections',
    description: 'Refreshes full-season team and owner projections.',
    schedule: 'Sunday at 5:00 AM Eastern',
    staleAfterHours: 192
  },
  standings_snapshot: {
    name: 'Standings Snapshot',
    description: 'Locks the weekly standings used for movement arrows.',
    schedule: 'Sunday at 6:00 AM Eastern',
    staleAfterHours: 192
  },
  weekly_odds: {
    name: 'Weekly Odds',
    description: 'Refreshes win probabilities, spreads, and closing-line candidates.',
    schedule: 'Daily at approximately 7:00 AM Eastern',
    staleAfterHours: 30
  },
  waivers: {
    name: 'Waiver Processing',
    description: 'Processes due waiver periods once and records the result.',
    schedule: 'Monday at 11:59 PM Eastern',
    staleAfterHours: 192
  }
};

let client;

function getClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Automation health database configuration is missing');
  }

  client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  return client;
}

function objectDetails(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return {};
  }

  return value;
}

function validRecordCount(value) {
  const count = Number(value);

  return Number.isInteger(count) && count >= 0
    ? count
    : null;
}

function errorMessage(error) {
  return String(
    error?.message ||
    error ||
    'Automation failed'
  ).slice(0, 2000);
}

async function createRun({
  jobKey,
  triggerSource,
  details
}) {
  try {
    const { data, error } = await getClient()
      .from('automation_job_runs')
      .insert({
        job_key: jobKey,
        status: 'running',
        trigger_source: triggerSource,
        details: objectDetails(details)
      })
      .select('id')
      .single();

    if (error) throw error;

    return data.id;
  } catch (error) {
    console.error(
      `Could not start automation health record for ${jobKey}`,
      error
    );

    return null;
  }
}

async function finishRun(runId, values) {
  if (!runId) return;

  try {
    const { error } = await getClient()
      .from('automation_job_runs')
      .update(values)
      .eq('id', runId);

    if (error) throw error;
  } catch (error) {
    console.error(
      `Could not finish automation health record ${runId}`,
      error
    );
  }
}

export async function runTrackedAutomation({
  jobKey,
  triggerSource = 'cron',
  details = {},
  summarize,
  task
}) {
  if (!AUTOMATION_JOBS[jobKey]) {
    throw new Error(`Unknown automation job: ${jobKey}`);
  }

  if (!['cron', 'manual'].includes(triggerSource)) {
    throw new Error(`Unknown automation trigger: ${triggerSource}`);
  }

  if (typeof task !== 'function') {
    throw new Error('Automation task must be a function');
  }

  const startedAt = Date.now();
  const runId = await createRun({
    jobKey,
    triggerSource,
    details
  });

  try {
    const result = await task();
    const summary = objectDetails(
      typeof summarize === 'function'
        ? summarize(result)
        : {}
    );

    const failed = result?.ok === false;
    const skipped = result?.skipped === true;

    await finishRun(runId, {
      status: failed
        ? 'failed'
        : skipped
          ? 'skipped'
          : 'succeeded',
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      records_updated: validRecordCount(
        summary.recordsUpdated
      ),
      details: {
        ...objectDetails(details),
        ...objectDetails(summary.details)
      },
      error_message: failed
        ? errorMessage(result?.error)
        : null
    });

    return result;
  } catch (error) {
    await finishRun(runId, {
      status: 'failed',
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      records_updated: null,
      details: objectDetails(details),
      error_message: errorMessage(error)
    });

    throw error;
  }
}
