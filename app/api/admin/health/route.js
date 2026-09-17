import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminAuthenticated } from '../../../../lib/admin-auth';
import { adminRpc } from '../../../../lib/admin-rpc';
import { AUTOMATION_JOBS } from '../../../../lib/automation-health';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
);

function runTime(run) {
  return run
    ? Date.parse(run.started_at)
    : 0;
}

function automationStatus(jobKey, runs) {
  const config = AUTOMATION_JOBS[jobKey];
  const history = runs
    .filter(run => run.job_key === jobKey)
    .slice(0, 8);

  const latestRun = history[0] || null;
  const lastSuccess = history.find(
    run => run.status === 'succeeded'
  ) || null;
  const lastFailure = history.find(
    run => run.status === 'failed'
  ) || null;

  const successAgeHours = lastSuccess
    ? (Date.now() - runTime(lastSuccess)) / 3600000
    : null;

  const runningAgeMinutes =
    latestRun?.status === 'running'
      ? (Date.now() - runTime(latestRun)) / 60000
      : null;

  let status = 'pending';
  let statusLabel = 'Waiting';
  let statusReason = 'No completed run has been recorded yet.';

  if (
    latestRun?.status === 'running' &&
    runningAgeMinutes <= 15
  ) {
    status = 'running';
    statusLabel = 'Running';
    statusReason = 'The automation is currently running.';
  } else if (
    latestRun?.status === 'running' &&
    runningAgeMinutes > 15
  ) {
    status = 'failed';
    statusLabel = 'Stalled';
    statusReason = 'The run started but did not finish within 15 minutes.';
  } else if (
    lastFailure &&
    (
      !lastSuccess ||
      runTime(lastFailure) > runTime(lastSuccess)
    )
  ) {
    status = 'failed';
    statusLabel = 'Failed';
    statusReason = lastFailure.error_message || 'The most recent completed attempt failed.';
  } else if (
    lastSuccess &&
    successAgeHours > config.staleAfterHours
  ) {
    status = 'stale';
    statusLabel = 'Stale';
    statusReason = `No successful run in the last ${config.staleAfterHours} hours.`;
  } else if (lastSuccess) {
    status = 'healthy';
    statusLabel = 'Healthy';
    statusReason = 'The most recent meaningful run succeeded.';
  } else if (latestRun?.status === 'skipped') {
    statusReason = latestRun.details?.reason || 'The last invocation was safely skipped.';
  }

  return {
    jobKey,
    ...config,
    status,
    statusLabel,
    statusReason,
    latestRun,
    lastSuccess,
    lastFailure,
    recentRuns: history
  };
}

export async function GET() {
  if (!await isAdminAuthenticated()) {
    return NextResponse.json(
      { ok: false },
      { status: 401 }
    );
  }

  try {
    const [sync, audit, runsResult] = await Promise.all([
      adminRpc('admin_system_health'),
      adminRpc('admin_get_audit'),
      supabase
        .from('automation_job_runs')
        .select(
          'id,job_key,status,trigger_source,started_at,finished_at,duration_ms,records_updated,details,error_message'
        )
        .order('started_at', {
          ascending: false
        })
        .limit(80)
    ]);

    if (runsResult.error) {
      throw runsResult.error;
    }

    const runs = runsResult.data || [];
    const automation = Object.keys(
      AUTOMATION_JOBS
    ).map(jobKey =>
      automationStatus(jobKey, runs)
    );

    return NextResponse.json({
      ok: true,
      health: sync,
      audit,
      automation,
      automationHistory: runs.slice(0, 25),
      automationSummary: {
        healthy: automation.filter(
          job => job.status === 'healthy'
        ).length,
        attention: automation.filter(
          job => ['failed', 'stale'].includes(job.status)
        ).length,
        running: automation.filter(
          job => job.status === 'running'
        ).length,
        waiting: automation.filter(
          job => job.status === 'pending'
        ).length
      }
    });
  } catch (error) {
    console.error(
      'Could not load commissioner health data',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error: 'System health data temporarily unavailable'
      },
      { status: 500 }
    );
  }
}
