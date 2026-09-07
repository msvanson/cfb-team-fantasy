import {Nav} from '../nav';
import {LeagueHeader} from '../league-header';
import {OwnerIdentity} from '../owner-identity';
import {TeamName} from '../team-name';
import {
  getLatestTeamProjections,
  getOwnerProjectionTotals,
  getOwners,
  getPreviousTeams,
  getStandings,
  getTeamDirectory
} from '../../lib/data';

export const dynamic='force-dynamic';

const md=date=>{
  if(!date)return '—';
  const value=new Date(date);
  return `${value.getMonth()+1}/${value.getDate()}`;
};

export default async function Page(){
  const [
    standings,
    owners,
    teams,
    projections,
    ownerProjections,
    previous
  ]=await Promise.all([
    getStandings(),
    getOwners(),
    getTeamDirectory(),
    getLatestTeamProjections(),
    getOwnerProjectionTotals(),
    getPreviousTeams()
  ]);
  const ownerMap=new Map(owners.map(owner=>[Number(owner.id),owner]));
  const projectionMap=new Map(
    projections.map(item=>[Number(item.team_id),item.projected_points])
  );
  const ownerProjectionMap=new Map(ownerProjections.map(item=>[
    Number(item.owner_id),
    item.projected_points??
      item.projected_total??
      item.total_projected_points
  ]));

  return <main className="shell">
    <LeagueHeader/>
    <Nav/>
    <section className="section rostersSection">
      <div className="sectionTitle"><h2>Rosters</h2></div>
      <div className="leagueRosterGrid">{standings.map(standing=>{
        const owner=ownerMap.get(Number(standing.owner_id))||standing;
        const active=teams
          .filter(team=>
            team.is_owned&&
            Number(team.owner_id)===Number(standing.owner_id)
          )
          .sort((a,b)=>
            a.conference_display_order-b.conference_display_order
          );
        const prior=previous.filter(team=>
          Number(team.owner_id)===Number(standing.owner_id)
        );
        const ownerProjection=ownerProjectionMap.get(
          Number(standing.owner_id)
        );

        return <details
          className="card leagueRosterCard rosterOwnerCard"
          key={standing.owner_id}
        >
          <summary>
            <span className="rosterSummaryIdentity">
              <span className="rosterRank">#{standing.rank??'—'}</span>
              <OwnerIdentity
                owner={owner}
                href={`/owners/${standing.owner_id}`}
                size="sm"
              />
            </span>
            <span className="rosterSummaryScore">
              {standing.fantasy_points??0} Pts · {ownerProjection==null
                ?'—'
                :Number(ownerProjection).toFixed(1)} Proj
            </span>
          </summary>

          <div className="leagueRosterTeams rosterTable">
            <div className="rosterTableHead">
              <span></span><b>Pts</b><b>Proj</b>
            </div>
            {active.map(team=><div
              className="rosterTableRow"
              key={team.team_id}
            >
              <span>
                <TeamName team={team} size="sm"/>
                <small>{team.conference_code}</small>
              </span>
              <b>{team.fantasy_points??0}</b>
              <b>{projectionMap.has(Number(team.team_id))
                ?Number(projectionMap.get(Number(team.team_id))).toFixed(1)
                :'—'}</b>
            </div>)}
          </div>

          {prior.length>0&&<div className="ownerPreviousTeams">
            <div className="ownerPreviousTitle">Previous Teams</div>
            {prior.map(team=><div
              className="rosterTableRow previousRosterRow"
              key={team.ownership_id||`${team.team_id}-${team.released_at}`}
            >
              <span>
                <TeamName team={team} size="sm"/>
                <small>{team.conference_code||''}</small>
              </span>
              <span className="previousRosterPts">
                <small>Pts</small>
                <b>{team.fantasy_points_earned??0}</b>
              </span>
              <span className="previousRosterDates">
                {md(team.acquired_at)}–{md(team.released_at)}
              </span>
            </div>)}
          </div>}
        </details>;
      })}</div>
    </section>
  </main>;
}
