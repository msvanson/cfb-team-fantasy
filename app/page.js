import {Nav} from './nav';
import {LeagueHeader} from './league-header';
import {OwnerIdentity} from './owner-identity';
import {
    getOwners,
  getOwnerProjectionHistory,
  getOwnerProjectionTotals,
  getStandings,
  getWeeklySnapshots
} from '../lib/data';
import StandingsHistoryChart from './standings-history-chart';
import RosterProjectionHistoryChart from './roster-projection-history-chart';
export const dynamic='force-dynamic';

export default async function Home(){
    const [standings,owners,ownerProj,snapshots,projectionHistory]=await Promise.all([
    getStandings(),
    getOwners(),
    getOwnerProjectionTotals(),
        getWeeklySnapshots(),
    getOwnerProjectionHistory()
  ]);
  const ownerMap=new Map(owners.map(owner=>[Number(owner.id),owner]));
  const projectionMap=new Map(
    ownerProj.map(item=>[Number(item.owner_id),item.projected_points])
  );

  return <main className="shell">
    <LeagueHeader/>
    <Nav/>

    <section className="section standingsSection">
      <div className="sectionTitle"><h2>Standings</h2></div>
      <div className="standingsTableWrap">
        <table className="table standingsCompact">
          <thead><tr>
            <th>Rank</th>
            <th>Roster</th>
            <th>Pts</th>
            <th>Proj</th>
            <th>W-L</th>
            <th>Pt Diff</th>
          </tr></thead>
          <tbody>{standings.map(standing=>{
            const owner=ownerMap.get(Number(standing.owner_id))||standing;
            return <tr key={standing.owner_id}>
              <td className="standingRank"><b>{standing.rank}</b></td>
              <td><span className="standingOwner">
                <OwnerIdentity
                  owner={owner}
                  href={`/owners/${standing.owner_id}`}
                  size="sm"
                  compact
                />
                {standing.rank_movement>0
  ?<span className="rankMove up" title={`Up ${standing.rank_movement} since Sunday`}>▲{standing.rank_movement}</span>
  :standing.rank_movement<0
    ?<span className="rankMove down" title={`Down ${Math.abs(standing.rank_movement)} since Sunday`}>▼{Math.abs(standing.rank_movement)}</span>
    :null}
              </span></td>
              <td><b>{standing.fantasy_points}</b></td>
              <td>{projectionMap.has(Number(standing.owner_id))
                ?Number(projectionMap.get(Number(standing.owner_id))).toFixed(1)
                :'—'}</td>
              <td>{standing.wins??0}-{standing.losses??0}</td>
              <td>{(standing.point_differential??0)>0?'+':''}{standing.point_differential??0}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>

    <section className="section">
      <div className="sectionTitle"><h2>Standings History</h2></div>
      <StandingsHistoryChart snapshots={snapshots.map(snapshot=>{
        const standing=standings.find(
          item=>Number(item.owner_id)===Number(snapshot.owner_id)
        );
        const owner=ownerMap.get(Number(snapshot.owner_id));
        return {
          ...snapshot,
          owner_name:owner?.roster_name||standing?.owner_name||'Roster'
        };
            })}/>
    </section>

    <section className="section">
      <div className="sectionTitle">
        <h2>Roster Projection History</h2>
        <span className="muted">Projected final fantasy points</span>
      </div>
      <RosterProjectionHistoryChart
        history={projectionHistory}
        owners={owners}
      />
    </section>

    <footer className="standingsNotes">
      <b>Notes:</b> Pts = fantasy points · Proj = projected final fantasy
      points · W-L = combined team wins-losses · Pt Diff = combined point
      differential. Projections use current betting-market inputs and update
      on the league projection refresh.
    </footer>
  </main>;
}
