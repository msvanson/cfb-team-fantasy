import {TeamName} from '../team-name';import Link from 'next/link';
import {Nav} from '../nav';
import RosterGameStatus from './roster-game-status';
import {getTeamDirectory,getStandings,getLatestTeamProjections,getOwnerProjectionTotals,getPreviousTeams,getHeadToHeadRecords,getHeadToHeadGames} from '../../lib/data';
export const dynamic='force-dynamic';

export default async function Page(){
  const [all,standings,projections,ownerProj,previousTeams,h2hRecords,h2hGames]=await Promise.all([
    getTeamDirectory(),
    getStandings(),
    getLatestTeamProjections(),
    getOwnerProjectionTotals(),
    getPreviousTeams(),
    getHeadToHeadRecords(),
    getHeadToHeadGames()
  ]);

  const data=all.filter(x=>x.is_owned);
  const groups=data.reduce((a,x)=>((a[x.owner_name]??=[]).push(x),a),{});
  const sm=new Map(standings.map(s=>[s.owner_name,s]));
  const tpm=new Map(projections.map(x=>[x.team_id,x.projected_points]));
  const opm=new Map(ownerProj.map(x=>[x.owner_name,x.projected_points]));

  return <main className="shell">
    <div className="topbar">
      <div>
        <div className="brand">Rosters</div>
        <div className="sub">Every owner’s 11-team roster with current and projected fantasy totals</div>
      </div>
    </div>

    <Nav/>

    <section className="section">
      <div className="projectionNote"><b>Projected Final</b> estimates end-of-season fantasy points from current betting markets. Updates every Sunday at 5:00 AM ET.</div>
    </section>

    <section className="section ownerGrid">
      {Object.entries(groups).map(([owner,ts])=>{
        const st=sm.get(owner)||{};
        return <div className="card" key={owner}>
          <div className="ownerHead">
            <div>
              <h2>{owner}</h2>
              <div className="muted">Rank #{st.rank??'—'} · {st.wins??0}-{st.losses??0} combined</div>
            </div>
            <div className="ownerScorePair">
              <div><small>Fantasy</small><b>{st.fantasy_points??0}</b></div>
              <div><small>Proj Final</small><b>{opm.has(owner)?Number(opm.get(owner)).toFixed(1):'—'}</b></div>
            </div>
          </div>

          <div className="rosterRows">
            {ts.sort((a,b)=>a.conference_display_order-b.conference_display_order).map(t=>
              <div className="rosterRow" key={t.team_id}>
                <span>
                  <b><TeamName team={t} size="sm"/></b>
                  <small>{t.conference_code}</small>
                  <RosterGameStatus teamId={t.team_id}/>
                </span>
                <span className="rosterProjectionStats">
                  <span><small>Fantasy</small><b>{t.fantasy_points}</b></span>
                  <span><small>Proj</small><b>{tpm.has(t.team_id)?Number(tpm.get(t.team_id)).toFixed(1):'—'}</b></span>
                  <small className="rosterRecord">{t.wins}-{t.losses} · {(t.point_differential??0)>0?'+':''}{t.point_differential??0}</small>
                </span>
              </div>
            )}
          </div>
          <details className="headToHead">
            <summary>Head-to-Head</summary>
            <div className="h2hRows">
              {standings.filter(x=>x.owner_name!==owner).map(opp=>{
                const ownerId=st.owner_id;
                const rec=h2hRecords.find(r=>Number(r.owner_a_id)===Number(ownerId)&&Number(r.owner_b_id)===Number(opp.owner_id));
                const games=h2hGames.filter(g=>Number(g.owner_a_id)===Number(ownerId)&&Number(g.owner_b_id)===Number(opp.owner_id));
                return <details className="h2hOpponent" key={opp.owner_id}><summary><b>{opp.owner_name}</b><span>{rec?`${rec.wins}-${rec.losses}${rec.ties?`-${rec.ties}`:''}`:'0-0'} <small>{rec?`${Number(rec.point_differential)>0?'+':''}${rec.point_differential} diff`:'No games yet'}</small></span></summary>
                  {games.length?<div className="h2hGames">{games.map(g=>{
                    const myTeam=all.find(t=>Number(t.team_id)===Number(g.owner_a_team_id));
                    const theirTeam=all.find(t=>Number(t.team_id)===Number(g.owner_b_team_id));
                    const result=Number(g.owner_a_score)>Number(g.owner_b_score)?'W':Number(g.owner_a_score)<Number(g.owner_b_score)?'L':'T';
                    return <div className="h2hGame" key={g.game_id}><span className={`h2hResult ${result}`}>{result}</span><span><TeamName team={myTeam} school={myTeam?.school||'Team'} size="sm"/> vs <TeamName team={theirTeam} school={theirTeam?.school||'Team'} size="sm"/></span><b>{g.owner_a_score}-{g.owner_b_score}</b></div>
                  })}</div>:<div className="muted h2hEmpty">No completed matchups yet.</div>}
                </details>
              })}
            </div>
          </details>
          {previousTeams.filter(x=>x.owner_name===owner).length>0&&<details className="previousTeams">
            <summary>Previous Teams ({previousTeams.filter(x=>x.owner_name===owner).length})</summary>
            <div className="previousTeamRows">
              {previousTeams.filter(x=>x.owner_name===owner).map(x=><div className="previousTeamRow" key={x.ownership_id}>
                <span><b><TeamName team={x} size="sm"/></b><small>{x.conference_code||''}</small></span>
                <span className="previousTeamFrozen"><span><small>Fantasy earned</small><b>{x.fantasy_points_earned}</b></span><span><small>Wins owned</small><b>{x.wins_while_owned}</b></span><span><small>Pt diff owned</small><b>{Number(x.point_differential_while_owned)>0?'+':''}{x.point_differential_while_owned}</b></span></span>
                <small className="muted">Owned {new Date(x.acquired_at).toLocaleDateString()} – {new Date(x.released_at).toLocaleDateString()}</small>
              </div>)}
            </div>
          </details>}
        </div>
      })}
    </section>
  </main>
}
