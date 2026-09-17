import { OwnerIdentity } from '../owner-identity';
import { TeamName } from '../team-name';

function signed(value) {
  const number = Number(value || 0);
  return `${number > 0 ? '+' : ''}${number}`;
}

function movementLabel(row) {
  if (row?.previousRank == null) return 'Opening rank';
  if (row.movement > 0) return `▲ ${row.movement}`;
  if (row.movement < 0) return `▼ ${Math.abs(row.movement)}`;
  return '—';
}

function ownerFor(ownerMap, fact) {
  return ownerMap.get(Number(fact?.ownerId)) || {
    id: fact?.ownerId,
    name: fact?.ownerName || 'Owner',
    roster_name: fact?.rosterName || 'Roster'
  };
}

function publishedDate(value) {
  if (!value) return '';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value));
}

export function WeeklyRecapCard({ recap, owners = [] }) {
  const facts = recap?.recap_data || {};
  const winner = facts.winner;
  const runnerUp = facts.runnerUp;
  const closest = facts.closestFinish;
  const mover = facts.biggestMover;
  const bestTeam = facts.bestTeam;
  const standings = facts.standings || [];
  const ownerMap = new Map(
    owners.map(owner => [Number(owner.id), owner])
  );
  const winnerOwner = ownerFor(ownerMap, winner);
  const moverOwner = mover
    ? ownerFor(ownerMap, mover)
    : null;

  return (
    <article className="card weeklyRecapCard">
      <header className="weeklyRecapHeader">
        <div>
          <span className="weeklyRecapEyebrow">
            {recap.week_key} Recap
          </span>
          <h2>{recap.headline}</h2>
        </div>

        {recap.published_at ? (
          <span className="weeklyRecapPublished">
            Published {publishedDate(recap.published_at)}
          </span>
        ) : null}
      </header>

      <p className="weeklyRecapNarrative">
        {recap.recap_text}
      </p>

      <div className="weeklyRecapHighlights">
        <div className="weeklyRecapHighlight weeklyRecapWinner">
          <small>Weekly Winner</small>
          <OwnerIdentity
            owner={winnerOwner}
            href={`/owners/${winner?.ownerId}`}
            size="sm"
            compact
          />
          <strong>
            {winner?.weeklyPoints ?? 0} pts
          </strong>
          <span>
            {signed(winner?.weeklyPointDifferential)} differential
          </span>
        </div>

        <div className="weeklyRecapHighlight">
          <small>Closest Finish</small>
          <strong>
            {closest?.winningMargin === 0
              ? 'Tiebreaker'
              : `${closest?.winningMargin ?? 0}-point margin`}
          </strong>
          <span>
            over {runnerUp?.rosterName || 'second place'}
          </span>
        </div>

        <div className="weeklyRecapHighlight">
          <small>Biggest Mover</small>
          {moverOwner ? (
            <OwnerIdentity
              owner={moverOwner}
              href={`/owners/${mover.ownerId}`}
              size="sm"
              compact
            />
          ) : (
            <strong>Opening Week</strong>
          )}
          <span>
            {mover
              ? `▲ ${mover.movement} to No. ${mover.currentRank}`
              : 'No previous standings'}
          </span>
        </div>

        <div className="weeklyRecapHighlight">
          <small>Best College Team</small>
          {bestTeam ? (
            <TeamName
              school={bestTeam.school}
              team={{
                id: bestTeam.teamId,
                school: bestTeam.school,
                abbreviation: bestTeam.abbreviation
              }}
              size="small"
            />
          ) : (
            <strong>—</strong>
          )}
          <strong>
            {bestTeam?.fantasyPoints ?? 0} fantasy pts
          </strong>
          <span>
            {signed(bestTeam?.pointDifferential)} differential
          </span>
        </div>
      </div>

      {standings.length ? (
        <details className="weeklyRecapStandings">
          <summary>Final standings after {recap.week_key}</summary>

          <div className="weeklyRecapStandingsList">
            {standings.map(row => {
              const owner = ownerFor(ownerMap, row);

              return (
                <div
                  className="weeklyRecapStandingRow"
                  key={row.ownerId}
                >
                  <b className="weeklyRecapRank">
                    {row.currentRank}
                  </b>

                  <OwnerIdentity
                    owner={owner}
                    href={`/owners/${row.ownerId}`}
                    size="sm"
                    compact
                  />

                  <span className={
                    row.movement > 0
                      ? 'movementUp'
                      : row.movement < 0
                        ? 'movementDown'
                        : 'movementEven'
                  }>
                    {movementLabel(row)}
                  </span>

                  <span className="weeklyRecapStandingPoints">
                    <b>{row.seasonPoints}</b> pts
                    <small>
                      {signed(row.seasonPointDifferential)} diff
                    </small>
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
    </article>
  );
}
