export const WAIVER_PERIODS = [
  { key: 'W1', deadline: '2026-09-07T23:59:00-04:00' },
  { key: 'W2', deadline: '2026-09-14T23:59:00-04:00' },
  { key: 'W3', deadline: '2026-09-21T23:59:00-04:00' },
  { key: 'W4', deadline: '2026-09-28T23:59:00-04:00' },
  { key: 'W5', deadline: '2026-10-05T23:59:00-04:00' },
  { key: 'W6', deadline: '2026-10-12T23:59:00-04:00' },
  { key: 'W7', deadline: '2026-10-19T23:59:00-04:00' },
  { key: 'W8', deadline: '2026-10-26T23:59:00-04:00' },
  { key: 'W9', deadline: '2026-11-02T23:59:00-05:00' },
  { key: 'W10', deadline: '2026-11-09T23:59:00-05:00' },
  { key: 'W11', deadline: '2026-11-16T23:59:00-05:00' },
  { key: 'W12', deadline: '2026-11-23T23:59:00-05:00' },
  { key: 'W13', deadline: '2026-11-30T23:59:00-05:00' }
];

export function getOpenWaiverPeriod(now = new Date()) {
  const current = WAIVER_PERIODS.find(
    ({ deadline }) => new Date(deadline).getTime() > now.getTime()
  );

  return current
    ? { ...current, closed: false }
    : { key: 'CLOSED', deadline: null, closed: true };
}

export function getDueWaiverPeriods(now = new Date()) {
  return WAIVER_PERIODS.filter(
    ({ deadline }) => new Date(deadline).getTime() <= now.getTime()
  );
}

export function getLatestDueWaiverPeriod(now = new Date()) {
  return getDueWaiverPeriods(now).at(-1) || null;
}
