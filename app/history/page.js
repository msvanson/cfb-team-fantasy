import {TeamName} from '../team-name';import {Nav} from '../nav';import {LeagueHeader} from '../league-header';import {getWeeklyWinners,getOwnerWeeklySummary,getSeasonRecordBook,getAllStandings,getTeamDirectory,getWeeklySnapshots,getWeeklySnapshotGames,getOwnerWeeklyRecordStats,getDraftHistory,getWaiverTransactionHistory} from '../../lib/data';import HistoryTabs from './history-tabs';import {finalizeEndedFantasyWeeks} from '../../lib/weekly-snapshots';export const dynamic='force-dynamic';

function weekOrder(k){if(!k)return 999;const m=String(k).match(/Week\s+(\d+)/i);if(m)return Number(m[1]);if(k==='Conference Championships')return 100;if(k==='CFP')return 101;if(k==='National Championship')return 102;if(k==='Postseason')return 103;return 999}

export default async function History(){
 try{await finalizeEndedFantasyWeeks(new Date())}catch{}
 const [winners,summaries,seasons,allStandings,teams,snapshots,snapshotGames,weeklyStats,draftHistory,transactions]=await Promise.all([getWeeklyWinners(),getOwnerWeeklySummary(),getSeasonRecordBook(),getAllStandings(),getTeamDirectory(),getWeeklySnapshots(),getWeeklySnapshotGames(),getOwnerWeeklyRecordStats(),getDraftHistory(),getWaiverTransactionHistory()]);
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
 const teamMap=new Map(teams.map(t=>[Number(t.team_id),t]));
 const snapshotWeeks=[...new Set(snapshots.map(x=>x.week_key))].sort((a,b)=>weekOrder(a)-weekOrder(b));


 return <main className="shell">
  <LeagueHeader/><Nav/><div className="pageContext"><b>History</b><span>League archive, weekly winners and all-time records</span></div>

  <section className="section grid">
   <div className="card"><div className="muted">{current?.year||2026} Current Leader</div><div className="kpi">{current?.leader_owner_name||'—'}</div><div>{current?.leader_points??0} pts</div></div>
   <div className="card"><div className="muted">Highest Weekly Score</div><div className="kpi">{highWeekly||'—'}</div><div>{highWeekRows.length?highWeekRows.map(x=>x.owner_name).join(' / '):'Not established yet'}</div></div>
   <div className="card"><div className="muted">Most Weekly Wins</div><div className="kpi">{mostWins||'—'}</div><div>{mostWinsOwners.length?mostWinsOwners.map(x=>x.owner_name).join(' / '):'Not established yet'}</div></div>
  </section>

  <HistoryTabs>
   <div>  <section className="section"><div className="sectionTitle"><h2>Weekly Results</h2><span className="muted">Finalized automatically after each custom fantasy week</span></div>
   {snapshotWeeks.length?snapshotWeeks.map(week=>{
     const rows=snapshots.filter(x=>x.week_key===week).sort((a,b)=>a.weekly_rank-b.weekly_rank);
     const winner=rows.find(x=>x.result==='winner'),loser=rows.find(x=>x.result==='loser');
     return <details className="card weeklySnapshotCard" key={week}><summary><b>{week}</b><span>{winner?.owner_id?`${allStandings.find(o=>o.owner_id===winner.owner_id)?.owner_name||'Winner'} won · ${loser?.owner_id?`${allStandings.find(o=>o.owner_id===loser.owner_id)?.owner_name||'Loser'} lost`:''}`:''}</span></summary>
       <div className="tableWrap"><table className="table"><thead><tr><th>Rank</th><th>Owner</th><th>Points</th><th>Pt Diff</th><th>Result</th></tr></thead><tbody>{rows.map(r=>{const owner=allStandings.find(o=>o.owner_id===r.owner_id);return <tr key={r.owner_id}><td>{r.weekly_rank}</td><td><b>{owner?.owner_name||'Owner'}</b></td><td>{r.weekly_points}</td><td>{r.weekly_point_differential>0?'+':''}{r.weekly_point_differential}</td><td>{r.result==='winner'?'Winner':r.result==='loser'?'Loser':'—'}</td></tr>})}</tbody></table></div>
       <div className="weeklyBreakdowns">{rows.map(r=>{const owner=allStandings.find(o=>o.owner_id===r.owner_id);const gs=snapshotGames.filter(g=>g.week_key===week&&g.owner_id===r.owner_id);return <details key={r.owner_id}><summary>{owner?.owner_name||'Owner'} game breakdown</summary>{gs.length?gs.map(g=>{const tm=teamMap.get(Number(g.team_id)),opp=teamMap.get(Number(g.opponent_team_id));return <div className="weeklyGameRow" key={g.id}><span><TeamName team={tm} school={tm?.school||'Team'} size="sm"/> vs <TeamName team={opp} school={opp?.school||'Opponent'} size="sm"/></span><span>{g.team_score}–{g.opponent_score} · {g.fantasy_points>0?`+${g.fantasy_points} fantasy`:0}</span></div>}):<div className="muted">No finalized games.</div>}</details>})}</div>
     </details>
   }):<div className="card liveEmpty">Week 1 will be finalized automatically after Sep 7 at 11:59 PM ET.</div>}
  </section>

  <section className="section"><div className="sectionTitle"><h2>Weekly Performance</h2><span className="muted">Based on finalized weekly snapshots</span></div>
   <div className="card"><div className="tableWrap"><table className="table weeklyStatsTable"><thead><tr><th>Owner</th><th>Weeks Won</th><th>Weeks Lost</th><th>Avg Finish</th><th>Weeks</th></tr></thead><tbody>
    {weeklyStats.map(x=><tr key={x.owner_id}><td><b>{x.owner_name}</b></td><td>{x.weeks_won}</td><td>{x.weeks_lost}</td><td>{x.average_weekly_finish==null?'—':Number(x.average_weekly_finish).toFixed(2)}</td><td>{x.weeks_completed}</td></tr>)}
   </tbody></table></div>
   {!weeklyStats.some(x=>x.weeks_completed>0)&&<div className="muted weeklyStatsNote">Stats will populate after Week 1 is finalized.</div>}</div>
  </section>

</div>
   <div>  <section className="section"><div className="sectionTitle"><h2>Draft Log</h2><span className="muted">Original 2026 draft selections</span></div>{draftHistory.length?<div className="tableWrap"><table className="table"><thead><tr><th>Pick</th><th>Owner</th><th>Team</th><th>Roster Slot</th></tr></thead><tbody>{draftHistory.map(x=><tr key={`${x.draft_pick}-${x.team_id}`}><td>{x.draft_pick}</td><td><b>{x.owner_name}</b></td><td><TeamName team={teamMap.get(Number(x.team_id))} school={x.team_name} size="sm"/></td><td>{x.roster_slot}</td></tr>)}</tbody></table></div>:<div className="card liveEmpty">No draft history found.</div>}</section></div>
   <div>  <section className="section"><div className="sectionTitle"><h2>Transactions</h2><span className="muted">Permanent waiver transaction log</span></div>{transactions.length?transactions.map(x=><div className="card transactionHistoryRow" key={x.id}><div><b>{x.owner_name}</b><span>{x.waiver_period_key} · Round {x.waiver_round} · Waiver #{x.waiver_order}</span></div><div><span>Added <TeamName team={teamMap.get(Number(x.add_team_id))} school={x.add_team_name} size="sm"/></span><span>Dropped <TeamName team={teamMap.get(Number(x.drop_team_id))} school={x.drop_team_name} size="sm"/></span></div><small>{new Date(x.effective_at).toLocaleString()}</small></div>):<div className="card liveEmpty">No completed waiver transactions yet.</div>}</section></div>
   <div>  <section className="section"><div className="sectionTitle"><h2>Record Book</h2><span className="muted">Updates automatically</span></div>
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
</div>
  </HistoryTabs>
 </main>
}