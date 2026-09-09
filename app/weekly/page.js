import {Nav} from '../nav';
import {LeagueHeader} from '../league-header';
import {OwnerIdentity} from '../owner-identity';
import {
  getOwners,
  getWeeklySnapshots
} from '../../lib/data';

export const dynamic='force-dynamic';

const signed=value=>{
  const number=Number(value||0);
  return `${number>0?'+':''}${number}`;
};

export default async function Page(){
  const [snapshots,owners]=await Promise.all([
    getWeeklySnapshots(),
    getOwners()
  ]);

  const ownerMap=new Map(
    owners.map(owner=>[Number(owner.id),owner])
  );

  const groups=new Map();

  for(const snapshot of snapshots){
    if(!groups.has(snapshot.week_key)){
      groups.set(snapshot.week_key,[]);
    }

    groups.get(snapshot.week_key).push(snapshot);
  }

  const stats=owners.map(owner=>{
    const rows=snapshots.filter(
      snapshot=>Number(snapshot.owner_id)===Number(owner.id)
    );

    const scores=rows.map(row=>Number(row.weekly_points||0));
    const ranks=rows.map(row=>Number(row.weekly_rank||0));

    return {
      owner,
      weekly_wins:rows.filter(row=>row.result==='winner').length,
      best:scores.length?Math.max(...scores):0,
      avg_rank:ranks.length
        ?ranks.reduce((total,value)=>total+value,0)/ranks.length
        :null,
      avg_points:scores.length
        ?scores.reduce((total,value)=>total+value,0)/scores.length
        :null
    };
  }).sort((a,b)=>
    b.weekly_wins-a.weekly_wins||
    (a.avg_rank??999)-(b.avg_rank??999)||
    Number(a.owner.draft_slot)-Number(b.owner.draft_slot)
  );

  return <main className="shell">
    <LeagueHeader/>
    <Nav/>

    <section className="section weeklyPerformanceSection">
      <div className="tableWrap">
        <table className="table weeklyPerformanceTable">
          <thead>
            <tr>
              <th>Roster</th>
              <th>Wins</th>
              <th>Best</th>
              <th>Avg Rk</th>
              <th>Avg Pts</th>
            </tr>
          </thead>
          <tbody>{stats.map(row=><tr key={row.owner.id}>
            <td>
              <OwnerIdentity
                owner={row.owner}
                href={`/owners/${row.owner.id}`}
                size="sm"
                compact
              />
            </td>
            <td>{row.weekly_wins}</td>
            <td>{row.best}</td>
            <td>
              {row.avg_rank==null?'—':row.avg_rank.toFixed(1)}
            </td>
            <td>
              {row.avg_points==null?'—':row.avg_points.toFixed(1)}
            </td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <section className="section weeklyHistorySection">
      <div className="sectionTitle">
        <h2>Weekly Scoring History</h2>
      </div>

      {groups.size?[...groups.entries()].map(([week,rows])=>{
        const ordered=[...rows].sort(
          (a,b)=>Number(a.weekly_rank)-Number(b.weekly_rank)
        );
        const winner=ordered.find(row=>row.result==='winner');
        const winnerOwner=winner
          ?ownerMap.get(Number(winner.owner_id))
          :null;
        const winnerName=winnerOwner?.roster_name||
          winnerOwner?.name||
          'Roster';

        return <div className="weeklyHistoryBlock" key={week}>
          <div className="sectionTitle weeklyHistoryTitle">
            <h3>{week}</h3>
            {winner?<span className="pill">
              Winner: {winnerName} · {winner.weekly_points} pts ·{' '}
              {signed(winner.weekly_point_differential)}
            </span>:null}
          </div>

          <div className="tableWrap weeklyHistoryTableWrap">
            <table className="table weeklyHistoryTable">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Roster</th>
                  <th>Pts</th>
                  <th>Diff</th>
                </tr>
              </thead>
              <tbody>{ordered.map(row=>{
                const owner=ownerMap.get(Number(row.owner_id))||{
                  id:row.owner_id,
                  name:'Roster'
                };

                return <tr key={row.owner_id}>
                  <td><b>{row.weekly_rank}</b></td>
                  <td>
                    <OwnerIdentity
                      owner={owner}
                      href={`/owners/${row.owner_id}`}
                      size="sm"
                      compact
                    />
                  </td>
                  <td><b>{row.weekly_points}</b></td>
                  <td>{signed(row.weekly_point_differential)}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </div>;
      }):<div className="card">
        <div className="liveEmpty">
          <b>Weekly scoring is ready.</b><br/>
          Results will appear after the first fantasy week is finalized.
        </div>
      </div>}
    </section>

    <footer className="standingsNotes">
      <b>Notes:</b> Weekly rankings use fantasy points, then point
      differential, then draft order. Results are locked when each fantasy
      week ends.
    </footer>
  </main>;
}
