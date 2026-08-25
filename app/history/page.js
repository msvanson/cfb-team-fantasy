import {TeamName} from '../team-name';import {Nav} from '../nav';import {getWeeklyWinners,getOwnerWeeklySummary,getSeasonRecordBook,getAllStandings,getTeamDirectory} from '../../lib/data';export const dynamic='force-dynamic';

function weekOrder(k){if(!k)return 999;const m=String(k).match(/Week\s+(\d+)/i);if(m)return Number(m[1]);if(k==='Conference Championships')return 100;if(k==='CFP')return 101;if(k==='National Championship')return 102;if(k==='Postseason')return 103;return 999}

export default async function History(){
 const [winners,summaries,seasons,allStandings,teams]=await Promise.all([getWeeklyWinners(),getOwnerWeeklySummary(),getSeasonRecordBook(),getAllStandings(),getTeamDirectory()]);
 const current=seasons.find(s=>s.is_active)||seasons[0];
 const currentWinners=winners.filter(w=>w.season_id===current?.season_id).sort((a,b)=>weekOrder(a.week_key)-weekOrder(b.week_key));
 const currentSummary=summaries.filter(s=>s.season_id===current?.season_id).sort((a,b)=>b.weekly_wins-a.weekly_wins||b.highest_weekly_score-a.highest_weekly_score);
 const completed=seasons.filter(s=>!s.is_active);
 const currentStandings=allStandings.filter(s=>s.season_id===current?.season_id);
 const highWeekly=current?.highest_weekly_score||0;
 const highWeekRows=currentWinners.filter(w=>w.weekly_points===highWeekly);
 const topTeam=teams.find(t=>t.team_id===current?.top_team_id);
 const mostWins=current?.most_weekly_wins||0;
 const mostWinsOwners=currentSummary.filter(s=>s.weekly_wins===mostWins&&mostWins>0);

 return <main className="shell">
  <div className="topbar"><div><div className="brand">History</div><div className="sub">League archive, weekly winners and all-time records</div></div></div><Nav/>

  <section className="section grid">
   <div className="card"><div className="muted">{current?.year||2026} Current Leader</div><div className="kpi">{current?.leader_owner_name||'—'}</div><div>{current?.leader_points??0} pts</div></div>
   <div className="card"><div className="muted">Highest Weekly Score</div><div className="kpi">{highWeekly||'—'}</div><div>{highWeekRows.length?highWeekRows.map(x=>x.owner_name).join(' / '):'Not established yet'}</div></div>
   <div className="card"><div className="muted">Most Weekly Wins</div><div className="kpi">{mostWins||'—'}</div><div>{mostWinsOwners.length?mostWinsOwners.map(x=>x.owner_name).join(' / '):'Not established yet'}</div></div>
  </section>

  <section className="section"><div className="sectionTitle"><h2>Weekly Winners</h2><span className="muted">Ties are preserved</span></div>
   {currentWinners.length?<div className="tableWrap"><table className="table"><thead><tr><th>Week</th><th>Winner</th><th>Points</th></tr></thead><tbody>{currentWinners.map((w,i)=><tr key={`${w.week_key}-${w.owner_id}`}><td>{w.week_key}</td><td><b>{w.owner_name}</b></td><td>{w.weekly_points}</td></tr>)}</tbody></table></div>:<div className="card liveEmpty">Weekly winners will appear here automatically once games begin.</div>}
  </section>

  <section className="section"><div className="sectionTitle"><h2>Weekly Wins Leaderboard</h2><span className="muted">Season-long prize performance</span></div>
   <div className="tableWrap"><table className="table"><thead><tr><th>Owner</th><th>Weekly Wins</th><th>Best Week</th></tr></thead><tbody>{currentSummary.map(r=><tr key={r.owner_id}><td><b>{r.owner_name}</b></td><td>{r.weekly_wins}</td><td>{r.highest_weekly_score}</td></tr>)}</tbody></table></div>
  </section>

  <section className="section"><div className="sectionTitle"><h2>Record Book</h2><span className="muted">Updates automatically</span></div>
   <div className="historyRecords">
    <div className="card"><b>Highest Season Score</b><div className="recordValue">{current?.leader_points??0}</div><div className="muted">{current?.leader_owner_name||'—'} · current {current?.year||2026}</div></div>
    <div className="card"><b>Highest Weekly Score</b><div className="recordValue">{highWeekly||'—'}</div><div className="muted">{highWeekRows.length?highWeekRows.map(x=>x.owner_name).join(' / '):'Not established'}</div></div>
    <div className="card"><b>Most Weekly Wins</b><div className="recordValue">{mostWins||'—'}</div><div className="muted">{mostWinsOwners.length?mostWinsOwners.map(x=>x.owner_name).join(' / '):'Not established'}</div></div>
    <div className="card"><b>Best Individual Team Season</b><div className="recordValue">{current?.top_team_points??0}</div><div className="muted"><TeamName school={topTeam?.school||current?.top_team_name||'—'} size="sm"/></div></div>
   </div>
  </section>

  <section className="section"><div className="sectionTitle"><h2>Season Champions</h2><span className="muted">Added automatically after a season closes</span></div>
   {completed.length?<div className="tableWrap"><table className="table"><thead><tr><th>Season</th><th>Champion</th><th>Points</th></tr></thead><tbody>{completed.map(s=><tr key={s.season_id}><td>{s.year}</td><td><b>{s.leader_owner_name}</b></td><td>{s.leader_points}</td></tr>)}</tbody></table></div>:<div className="card liveEmpty">2026 is the inaugural season. The first champion will appear here when the season is closed.</div>}
  </section>

  <section className="section"><div className="sectionTitle"><h2>Current Final-Standings Preview</h2><span className="muted">Becomes the permanent 2026 result when the season closes</span></div>
   <div className="tableWrap"><table className="table"><thead><tr><th>Rank</th><th>Owner</th><th>Points</th></tr></thead><tbody>{currentStandings.map(s=><tr key={s.owner_id}><td>{s.rank}</td><td><b>{s.owner_name}</b></td><td>{s.fantasy_points}</td></tr>)}</tbody></table></div>
  </section>
 </main>
}