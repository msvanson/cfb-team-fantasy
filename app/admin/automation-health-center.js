'use client';

function formatDate(value) {
  if (!value) return 'Not recorded yet';

  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatDuration(value) {
  const milliseconds = Number(value);

  if (!Number.isFinite(milliseconds)) return '—';
  if (milliseconds < 1000) return `${milliseconds} ms`;

  const seconds = milliseconds / 1000;

  if (seconds < 60) return `${seconds.toFixed(1)} sec`;

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);

  return `${minutes}m ${remaining}s`;
}

function runLabel(run) {
  if (!run) return 'No runs';

  if (run.status === 'succeeded') return 'Succeeded';
  if (run.status === 'failed') return 'Failed';
  if (run.status === 'running') return 'Running';

  return 'Skipped';
}

function detailItems(run) {
  if (!run?.details) return [];

  return Object.entries(run.details).filter(([, value]) =>
    value !== null &&
    value !== undefined &&
    value !== '' &&
    !Array.isArray(value) &&
    typeof value !== 'object'
  );
}

export function AutomationHealthCenter({
  jobs = [],
  summary = {},
  refreshing = false,
  onRefresh
}) {
  return (
    <div className="automationHealthCenter">
      <div className="automationHealthHeader">
        <div>
          <h2>Automation Health Center</h2>
          <p className="muted">
            Scheduled scores, projections, odds, snapshots, and waivers
          </p>
        </div>

        <button
          className="button secondary"
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing…' : 'Refresh Status'}
        </button>
      </div>

      <div className="automationSummaryGrid">
        <div className="card automationSummary healthy">
          <span>Healthy</span>
          <b>{summary.healthy ?? 0}</b>
        </div>

        <div className="card automationSummary attention">
          <span>Needs Attention</span>
          <b>{summary.attention ?? 0}</b>
        </div>

        <div className="card automationSummary running">
          <span>Running</span>
          <b>{summary.running ?? 0}</b>
        </div>

        <div className="card automationSummary waiting">
          <span>Waiting</span>
          <b>{summary.waiting ?? jobs.length}</b>
        </div>
      </div>

      <div className="automationJobGrid">
        {jobs.map(job => (
          <article
            className={`card automationJob ${job.status}`}
            key={job.jobKey}
          >
            <div className="automationJobTop">
              <div>
                <h3>{job.name}</h3>
                <p>{job.description}</p>
              </div>

              <span className={`automationBadge ${job.status}`}>
                {job.statusLabel}
              </span>
            </div>

            <div className="automationSchedule">
              <span>Schedule</span>
              <b>{job.schedule}</b>
            </div>

            <div className="automationRunStats">
              <div>
                <span>Last success</span>
                <b>{formatDate(job.lastSuccess?.finished_at)}</b>
              </div>

              <div>
                <span>Last attempt</span>
                <b>{formatDate(job.latestRun?.started_at)}</b>
              </div>

              <div>
                <span>Records changed</span>
                <b>{job.latestRun?.records_updated ?? '—'}</b>
              </div>

              <div>
                <span>Duration</span>
                <b>{formatDuration(job.latestRun?.duration_ms)}</b>
              </div>
            </div>

            <div className={`automationReason ${job.status}`}>
              {job.statusReason}
            </div>

            <details className="automationHistory">
              <summary>
                Recent runs ({job.recentRuns?.length || 0})
              </summary>

              {job.recentRuns?.length ? (
                <div className="automationHistoryList">
                  {job.recentRuns.map(run => (
                    <div className="automationRun" key={run.id}>
                      <div className="automationRunHeading">
                        <span className={`automationRunStatus ${run.status}`}>
                          {runLabel(run)}
                        </span>

                        <b>{formatDate(run.started_at)}</b>
                      </div>

                      <div className="automationRunMeta">
                        <span>{run.trigger_source}</span>
                        <span>{formatDuration(run.duration_ms)}</span>

                        {run.records_updated !== null ? (
                          <span>{run.records_updated} changed</span>
                        ) : null}
                      </div>

                      {run.error_message ? (
                        <div className="automationRunError">
                          {run.error_message}
                        </div>
                      ) : null}

                      {detailItems(run).length ? (
                        <div className="automationRunDetails">
                          {detailItems(run).map(([key, value]) => (
                            <span key={key}>
                              {key}: <b>{String(value)}</b>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="automationEmpty">
                  This job will populate after its first invocation.
                </div>
              )}
            </details>
          </article>
        ))}
      </div>
    </div>
  );
}
