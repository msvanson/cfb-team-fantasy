import Link from 'next/link';
import {Nav} from '../nav';
import {getTeamDirectory,getStandings,getLatestTeamProjections,getOwnerProjectionTotals} from '../../lib/data';
export const dynamic='force-dynamic';

export default async function Page(){
  const [all,standings,projections,ownerProj]=await Promise.all([
    getTeamDirectory(),
    getStandings(),
    getLatestTeamProjections(),
    getOwnerProjectionTotals()
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
                  <Link className="teamLink" href={`/teams/${t.team_id}`}><b>{t.school}</b></Link>
                  <small>{t.conference_code}</small>
                </span>
                <span className="rosterProjectionStats">
                  <span><small>Fantasy</small><b>{t.fantasy_points}</b></span>
                  <span><small>Proj</small><b>{tpm.has(t.team_id)?Number(tpm.get(t.team_id)).toFixed(1):'—'}</b></span>
                  <small className="rosterRecord">{t.wins}-{t.losses} · {(t.point_differential??0)>0?'+':''}{t.point_differential??0}</small>
                </span>
              </div>
            )}
          </div>
        </div>
      })}
    </section>
  </main>
}
