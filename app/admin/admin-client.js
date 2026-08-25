'use client';
import { useEffect,useState } from 'react';

export function Login(){
  const [password,setPassword]=useState('');
  const [msg,setMsg]=useState('');
  async function submit(e){
    e.preventDefault();
    setMsg('Signing in…');
    const r=await fetch('/api/admin/login',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({password})
    });
    const j=await r.json();
    if(r.ok) location.reload();
    else setMsg(j.error||'Login failed');
  }
  return <div className="card adminLogin">
    <h2>Commissioner Login</h2>
    <p className="muted">This page is hidden from public navigation.</p>
    <form onSubmit={submit}>
      <input className="field" type="password" placeholder="Commissioner password" value={password} onChange={e=>setPassword(e.target.value)}/>
      <button className="button" type="submit">Sign in</button>
    </form>
    {msg&&<div className="notice">{msg}</div>}
  </div>;
}

export function AdminPanel({teams}){
  const [msg,setMsg]=useState('');
  const [qa,setQa]=useState(null);
  const [sdio,setSdio]=useState(null);const [projResult,setProjResult]=useState(null);const [projectionQa,setProjectionQa]=useState(null);const [espnFutures,setEspnFutures]=useState(null);const [weeklyOddsTest,setWeeklyOddsTest]=useState(null);const [winTotalsInspect,setWinTotalsInspect]=useState(null);
  const [health,setHealth]=useState(null);
  const [audit,setAudit]=useState([]);
  const [teamId,setTeamId]=useState(teams[0]?.team_id||'');
  const [points,setPoints]=useState(1);
  const [eventType,setEventType]=useState('commissioner_adjustment');
  const [weekKey,setWeekKey]=useState('Commissioner');
  const [note,setNote]=useState('');
  const [gameId,setGameId]=useState('');
  const [gameType,setGameType]=useState('ccg');

  async function loadHealth(){
    const r=await fetch('/api/admin/health',{cache:'no-store'});
    const j=await r.json();
    if(r.ok){setHealth(j.health);setAudit(j.audit||[])}
  }

  useEffect(()=>{loadHealth()},[]);

  async function checkSportsData(){
    setMsg('Checking SportsDataIO futures…');
    const r=await fetch('/api/admin/sportsdataio',{cache:'no-store'});
    const j=await r.json();
    setSdio(j);
    setMsg(r.ok?'SportsDataIO check complete':(j.error||'SportsDataIO check failed'));
  }

  async function refreshProjections(){setMsg('Refreshing projections…');const r=await fetch('/api/admin/projections',{method:'POST'});const j=await r.json();setProjResult(j);setMsg(r.ok?'Projection refresh complete':(j.error||'Projection refresh failed'))}

  async function inspectWinTotals(){setMsg('Inspecting 2026 win totals…');const r=await fetch('/api/admin/win-totals-inspector',{cache:'no-store'});const j=await r.json();setWinTotalsInspect(j);setMsg(r.ok?'Win totals inspection complete':(j.error||'Win totals inspection failed'))}

  async function testWeeklyOdds(){setMsg('Testing NCAAF weekly odds…');const r=await fetch('/api/admin/weekly-odds-test',{cache:'no-store'});const j=await r.json();setWeeklyOddsTest(j);setMsg(r.ok?'Weekly odds test complete':(j.error||'Weekly odds test failed'))}

  async function inspectEspnFutures(){setMsg('Inspecting ESPN 2026 futures…');const r=await fetch('/api/admin/espn-futures',{cache:'no-store'});const j=await r.json();setEspnFutures(j);setMsg(r.ok?'ESPN futures inspection complete':(j.error||'ESPN futures inspection failed'))}

  async function runProjectionQa(){setMsg('Running projection QA…');const r=await fetch('/api/admin/projection-qa',{cache:'no-store'});const j=await r.json();if(r.ok){setProjectionQa(j.qa);setMsg('Projection QA complete')}else setMsg(j.error||'Projection QA failed')}

  async function runQa(){
    setMsg('Running QA…');
    const r=await fetch('/api/admin/qa',{cache:'no-store'});
    const j=await r.json();
    if(r.ok){setQa(j.qa);setMsg('QA complete')}
    else setMsg(j.error||'QA failed');
  }

  async function post(url,body){
    setMsg('Working…');
    const r=await fetch(url,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:body?JSON.stringify(body):undefined
    });
    const j=await r.json();
    setMsg(r.ok?'Saved successfully':(j.error||'Action failed'));
    if(r.ok)setTimeout(()=>location.reload(),700);
  }

  return <div>
    <div className="sectionTitle"><h2>System Health</h2><span className="muted">Commissioner diagnostics</span></div>
    <div className="adminHealth">
      <div className="card"><div className="muted">Tier 1 Live</div><div className="kpi">{health?.liveAvailable?'Yes':'—'}</div></div>
      <div className="card"><div className="muted">2026 Games</div><div className="kpi">{health?.gameCount??'—'}</div></div>
      <div className="card"><div className="muted">Last Sync</div><div><b>{health?.lastCompleted?new Date(health.lastCompleted).toLocaleString():'—'}</b></div></div>
    </div>

    <div className="adminActions">
      <div className="card">
        <h2>CFBD Sync</h2>
        <p className="muted">Clear the shared cooldown and run a score/schedule sync immediately.</p>
        <button className="button" onClick={()=>post('/api/admin/sync')}>Force CFBD Sync</button>
      </div>

      <div className="card">
        <h2>Manual Scoring Adjustment</h2>
        <label>Team</label>
        <select className="field" value={teamId} onChange={e=>setTeamId(e.target.value)}>{teams.map(t=><option key={t.team_id} value={t.team_id}>{t.school}</option>)}</select>
        <label>Event</label><input className="field" value={eventType} onChange={e=>setEventType(e.target.value)}/>
        <label>Points</label><input className="field" type="number" value={points} onChange={e=>setPoints(e.target.value)}/>
        <label>Week key</label><input className="field" value={weekKey} onChange={e=>setWeekKey(e.target.value)}/>
        <label>Note</label><input className="field" value={note} onChange={e=>setNote(e.target.value)}/>
        <button className="button" onClick={()=>post('/api/admin/scoring',{teamId,eventType,points,weekKey,note})}>Add Adjustment</button>
      </div>

      <div className="card">
        <h2>Postseason Game Override</h2>
        <p className="muted">Use only if CFBD labels a postseason game incorrectly.</p>
        <label>Internal game ID</label><input className="field" type="number" value={gameId} onChange={e=>setGameId(e.target.value)}/>
        <label>Classification</label>
        <select className="field" value={gameType} onChange={e=>setGameType(e.target.value)}>
          <option value="ccg">Conference Championship</option>
          <option value="bowl">Bowl</option>
          <option value="cfp">CFP</option>
        </select>
        <button className="button" onClick={()=>post('/api/admin/classification',{gameId,isCcg:gameType==='ccg',isBowl:gameType==='bowl',isCfp:gameType==='cfp'})}>Apply Override</button>
      </div>
    </div>

    {msg&&<div className="notice">{msg}</div>}

    <div className="sectionTitle"><h2>SportsDataIO Futures</h2><span className="muted">2026 projection feed diagnostic</span></div>
    <div className="card">
      <div className="qaTop">
        <div><b>Inspect 2026 futures markets</b><div className="muted">Reads nested BettingMarkets and BettingOutcomes without displaying your API key.</div></div>
        <button className="button" onClick={checkSportsData}>Check Futures</button>
      </div>

      {sdio&&<div className="qaList">
        <div className="qaRow">
          <span className={'qaBadge '+(sdio.keyVisible?'pass':'fail')}>{sdio.keyVisible?'PASS':'FAIL'}</span>
          <div><b>API key visible</b><div className="muted">{sdio.keyVisible?'Server can access the key.':'Key is not available to this deployment.'}</div></div>
        </div>

        {sdio.structure ? <>
          <div className="qaRow"><span className="qaBadge pass">INFO</span><div><b>Relevant markets</b><div className="muted">{sdio.structure.relevantMarketCount??0} projection markets found</div></div></div>
          <div className="qaRow"><span className="qaBadge pass">INFO</span><div><b>Relevant bet types</b><div className="muted wrapText">{(sdio.structure.relevantBetTypes||[]).join(' · ')||'—'}</div></div></div>
          <div className="qaRow"><span className="qaBadge pass">INFO</span><div><b>BettingOutcome fields</b><div className="muted wrapText">{(sdio.structure.bettingOutcomeFields||[]).join(', ')||'—'}</div></div></div>
          <div className="qaRow"><span className="qaBadge pass">INFO</span><div><b>ConsensusOutcome fields</b><div className="muted wrapText">{(sdio.structure.consensusOutcomeFields||[]).join(', ')||'—'}</div></div></div>
          <div className="sdioShape"><b>Targeted market samples</b>{(sdio.structure.samples||[]).map((m,i)=><div className="card" key={i}><div><b>{m.betType||m.name||'Market'}</b>{m.teamKey?` · ${m.teamKey}`:''}</div><div className="muted">Betting outcomes: {m.bettingOutcomeCount} · Consensus outcomes: {m.consensusOutcomeCount}</div><div className="muted wrapText">Consensus: {JSON.stringify(m.consensusOutcomes)}</div><div className="muted wrapText">Book sample: {JSON.stringify(m.bettingOutcomes)}</div></div>)}</div>
        </> : sdio.ok ? <div className="notice">No nested structure returned.</div> : null}

        {sdio.error&&<div className="notice">{sdio.error}</div>}
      </div>}
    </div>

    <div className="sectionTitle"><h2>Season Projections</h2><span className="muted">Sunday 5:00 AM ET model</span></div><div className="card"><div className="qaTop"><div><b>Refresh full-season projections</b><div className="muted">Trial/scrambled SportsDataIO runs are stored for testing but never published to league pages.</div></div><button className="button" onClick={refreshProjections}>Refresh Projections</button></div>{projResult&&<div className="qaList"><div className="qaRow"><span className={'qaBadge '+(projResult.publishable?'pass':'warning')}>{projResult.publishable?'PUBLIC':'TEST'}</span><div><b>{projResult.quality}</b><div className="muted">Mapped {projResult.mappedTeams} teams · Win totals for {projResult.winTotalTeams} · Run #{projResult.runId}</div></div></div>{projResult.unmapped?.length?<div className="muted wrapText">Unmapped: {projResult.unmapped.join(', ')}</div>:null}</div>}</div><div className="sectionTitle"><h2>Win Totals Inspector</h2><span className="muted">2026 · $0 public source</span></div>
<div className="card">
 <div className="qaTop"><div><b>Inspect SportsBettingDime win totals</b><div className="muted">Parses team total, Over/Under prices and a vig-adjusted expected-win estimate without changing production projections.</div></div><button className="button" onClick={inspectWinTotals}>Inspect Win Totals</button></div>
 {winTotalsInspect?.ok&&<div className="qaList">
  <div className="qaRow"><span className={'qaBadge '+(winTotalsInspect.safeToUse?'pass':'warning')}>{winTotalsInspect.safeToUse?'PASS':'CHECK'}</span><div><b>{winTotalsInspect.matchedTeams} of 138 FBS teams matched</b><div className="muted">{winTotalsInspect.parsedRows} source rows parsed</div></div></div>
  <div className="qaRow"><span className="qaBadge info">INFO</span><div><b>Missing FBS teams</b><div className="muted wrapText">{winTotalsInspect.missingTeams?.join(' · ')||'None'}</div></div></div><div className="qaRow"><span className="qaBadge info">INFO</span><div><b>Unmatched source names</b><div className="muted wrapText">{winTotalsInspect.unmatchedSourceNames?.join(' · ')||'None'}</div></div></div>
  <div className="sdioShape"><b>Sample matched totals</b>{(winTotalsInspect.samples||[]).map((x,i)=><div className="muted" key={i}>{x.school}: {x.line} · O {x.over>0?'+':''}{x.over} / U {x.under>0?'+':''}{x.under} · adjusted {Number(x.adjustedWins).toFixed(2)}</div>)}</div>
 </div>}
 {winTotalsInspect&&!winTotalsInspect.ok&&<div className="notice">{winTotalsInspect.error}</div>}
</div>
<div className="sectionTitle"><h2>Weekly Odds Test</h2><span className="muted">NCAAF · DraftKings + FanDuel</span></div>
<div className="card">
  <div className="qaTop">
    <div><b>Test free weekly betting feed</b><div className="muted">Checks NCAAF event access, pregame moneylines, and whether the free key exposes in-play events/odds.</div></div>
    <button className="button" onClick={testWeeklyOdds}>Test Weekly Odds</button>
  </div>
  {weeklyOddsTest?.ok&&<div className="qaList">
    <div className="qaRow"><span className="qaBadge pass">PASS</span><div><b>API key + NCAAF league</b><div className="muted">{weeklyOddsTest.league?.name} · {weeklyOddsTest.league?.slug}</div></div></div>
    <div className="qaRow"><span className={'qaBadge '+(weeklyOddsTest.pending?.moneylineEntries>0?'pass':'warning')}>{weeklyOddsTest.pending?.moneylineEntries>0?'PASS':'CHECK'}</span><div><b>Pregame moneylines</b><div className="muted">{weeklyOddsTest.pending?.eventCount??0} upcoming events · {weeklyOddsTest.pending?.moneylineEntries??0} DraftKings/FanDuel moneyline entries in sampled games</div></div></div>
    <div className="qaRow"><span className={'qaBadge '+(weeklyOddsTest.live?.conclusion==='live-moneylines-confirmed'?'pass':weeklyOddsTest.live?.conclusion==='blocked'?'fail':'warning')}>{weeklyOddsTest.live?.conclusion==='live-moneylines-confirmed'?'PASS':weeklyOddsTest.live?.conclusion==='blocked'?'FAIL':'CHECK'}</span><div><b>Live/in-play odds</b><div className="muted">{weeklyOddsTest.live?.conclusion==='live-moneylines-confirmed'?'Live moneylines confirmed on the free key.':weeklyOddsTest.live?.conclusion==='no-live-games-to-test'?'Live endpoint works, but there are no NCAAF games live right now to verify in-play moneylines.':weeklyOddsTest.live?.conclusion==='blocked'?'The live endpoint is blocked for this key.':'Live events were found but DraftKings/FanDuel moneylines were not returned.'}</div></div></div>
    {(weeklyOddsTest.pending?.samples||[]).map((x,i)=><div className="card" key={'p'+i}><b>{x.away} @ {x.home}</b><div className="muted">{x.date} · {x.status}</div><div className="muted wrapText">{JSON.stringify(x.moneylines)}</div></div>)}
    {(weeklyOddsTest.live?.samples||[]).map((x,i)=><div className="card" key={'l'+i}><b>LIVE · {x.away} @ {x.home}</b><div className="muted">{x.status}</div><div className="muted wrapText">{JSON.stringify(x.moneylines)}</div></div>)}
  </div>}
  {weeklyOddsTest&&!weeklyOddsTest.ok&&<div className="notice">{weeklyOddsTest.error}</div>}
</div>
<div className="sectionTitle"><h2>ESPN Futures Inspector</h2><span className="muted">2026 · free ESPN futures feed</span></div>
<div className="card">
  <div className="qaTop">
    <div><b>Inspect ESPN futures board</b><div className="muted">Checks which 2026 markets ESPN currently exposes before we replace SportsDataIO.</div></div>
    <button className="button" onClick={inspectEspnFutures}>Inspect ESPN Futures</button>
  </div>
  {espnFutures?.ok&&<div className="qaList">
    <div className="qaRow"><span className="qaBadge pass">INFO</span><div><b>{espnFutures.marketCount} markets · {espnFutures.marketsWithBooks} with odds</b><div className="muted">{espnFutures.totalBookEntries||0} total sportsbook entries</div><div className="muted wrapText">{(espnFutures.targetLikeMarkets||[]).join(' · ')||'No projection-like labels detected'}</div></div></div>
    <div className="sdioShape"><b>Market labels</b><div className="muted wrapText">{(espnFutures.marketLabels||[]).join(' · ')||'—'}</div></div>
    {(espnFutures.markets||[]).slice(0,30).map((m,i)=><div className="card" key={i}><div><b>{m.display||m.name||'Market'}</b></div><div className="muted">Type: {String(m.type||'—')} · Providers: {m.providerCount} · Book entries: {m.totalBooks}</div><div className="muted wrapText">Fields: {(m.topLevelFields||[]).join(', ')}</div><div className="muted wrapText">{JSON.stringify(m.providers)}</div></div>)}
  </div>}
  {espnFutures&&!espnFutures.ok&&<div className="notice">{espnFutures.error}</div>}
</div>
<div className="sectionTitle"><h2>Projection QA</h2><span className="muted">Latest saved projection run</span></div>
<div className="card">
  <div className="qaTop">
    <div>
      <b>Validate latest projection run</b>
      <div className="muted">Checks FBS coverage, roster rollups, floor protection and conference/CFP point pools.</div>
    </div>
    <button className="button" onClick={runProjectionQa}>Run Projection QA</button>
  </div>
  {projectionQa?.checkedAt&&<div className="muted qaTime">Run #{projectionQa.runId} · Checked {new Date(projectionQa.checkedAt).toLocaleString()}</div>}
  {projectionQa?.checks?.length?<div className="qaList">
    {projectionQa.checks.map((c,i)=><div className="qaRow" key={i}>
      <span className={'qaBadge '+String(c.status).toLowerCase()}>{c.status}</span>
      <div><b>{c.name}</b><div className="muted">{c.detail}</div></div>
    </div>)}
  </div>:<div className="liveEmpty">No projection QA run yet.</div>}
</div>
<div className="sectionTitle"><h2>Preseason QA</h2><span className="muted">Production integrity checks</span></div>
    <div className="card">
      <div className="qaTop"><div><b>Run full system check</b><div className="muted">Owners, rosters, season guard, scoring, Tier 1, standings and sync health.</div></div><button className="button" onClick={runQa}>Run QA</button></div>
      {qa?.checkedAt&&<div className="muted qaTime">Last checked: {new Date(qa.checkedAt).toLocaleString()}</div>}
      {qa?.checks?.length?<div className="qaList">{qa.checks.map((c,i)=><div className="qaRow" key={i}><span className={'qaBadge '+String(c.status).toLowerCase()}>{c.status}</span><div><b>{c.name}</b><div className="muted">{c.detail}</div></div></div>)}</div>:<div className="liveEmpty">No QA run yet.</div>}
    </div>

    <div className="sectionTitle"><h2>Commissioner Audit History</h2><span className="muted">Last 100 actions</span></div>
    {audit.length?<div className="tableWrap"><table className="table"><thead><tr><th>When</th><th>Action</th><th>Details</th></tr></thead><tbody>{audit.map(a=><tr key={a.id}><td>{new Date(a.created_at).toLocaleString()}</td><td><b>{a.action_type.replaceAll('_',' ')}</b></td><td>{a.summary}</td></tr>)}</tbody></table></div>:<div className="card liveEmpty">No commissioner actions logged yet.</div>}

    <button className="button secondary" onClick={async()=>{await fetch('/api/admin/logout',{method:'POST'});location.reload()}}>Log out</button>
  </div>;
}
