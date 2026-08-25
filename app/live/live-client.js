'use client';
import {useEffect,useState} from 'react';

function gameState(g){
  if(g.completed)return 'FINAL';
  if(g.status==='in_progress'){
    if(Number(g.period)>4)return `OT${Number(g.period)>5?` ${Number(g.period)-4}`:''}`;
    const q=g.period?`${g.period}${g.period===1?'st':g.period===2?'nd':g.period===3?'rd':'th'} Quarter`:'LIVE';
    return g.clock?`${q} · ${g.clock}`:q;
  }
  if(!g.start_time)return 'Scheduled';
  return new Date(g.start_time).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'});
}
function sortRank(g){
  if(g.status==='in_progress'&&Number(g.period)>4)return 0;
  if(g.status==='in_progress')return 5-Math.min(Number(g.period||1),4); // 4Q=1,3Q=2,2Q=3,1Q=4
  if(g.completed)return 5;
  return 6;
}
function gameSort(a,b){
  const ra=sortRank(a),rb=sortRank(b);
  if(ra!==rb)return ra-rb;
  if(ra>=1&&ra<=4){
    const ca=parseClock(a.clock),cb=parseClock(b.clock);
    return ca-cb; // less time remaining first within a quarter
  }
  return new Date(a.start_time||0)-new Date(b.start_time||0);
}
function parseClock(c){const m=String(c||'').match(/(\d+):(\d+)/);return m?Number(m[1])*60+Number(m[2]):9999}
function matchupClass(g){
  if(g.home.is_owned&&g.away.is_owned){
    return g.home.owner_id===g.away.owner_id?'matchup-same-owner':'matchup-rival-owners';
  }
  return '';
}
function teamClass(t){return t?.is_owned?'owned-team-row':''}
function winPct(g,side){
  if(!g?.projection)return null;
  const v=side==='home'?g.projection.home_win_probability:g.projection.away_win_probability;
  return v==null?null:Number(v);
}
function isFallback(g){return g?.projection?.projection_source==='fallback_50_50'}

export default function LiveClient(){
  const [data,setData]=useState({games:[],weeklyStandings:[],sync:null,totalGames:0,updatedAt:null});
  const [loading,setLoading]=useState(true);
  const [requestError,setRequestError]=useState(null);

  async function refresh(force=false){
    try{
      setRequestError(null);
      const res=await fetch(`/api/live${force?'?force=1':''}`,{cache:'no-store'});
      const json=await res.json();setData(json);
      if(!res.ok)setRequestError(json.error||`Request failed (${res.status})`);
    }catch(e){setRequestError(e?.message||String(e))}
    finally{setLoading(false)}
  }
  useEffect(()=>{refresh(true);const id=setInterval(()=>refresh(false),60000);return()=>clearInterval(id)},[]);

  const games=[...(data.games||[])].sort(gameSort);
  const liveCount=games.filter(g=>!g.completed&&g.status==='in_progress').length;

  return <div>
    <div className="liveWeekHeading">
      <h1>{data.weekKey||'Current Week'}</h1>
      <div className="muted">{data.weekDates||''}</div>
    </div>
    <div className="liveHero card">
      <div><div className="muted">Games Currently Live</div><div className="liveHeroNumber">{liveCount}</div></div>
      <div className="muted">Updates every minute</div>
    </div>

    <div className="sectionTitle"><h2>This Week</h2><span className="muted">Final points + unfinished-game projections</span></div>
    <div className="tableWrap">
      <table className="table liveWeeklyTable">
        <thead><tr><th>#</th><th>Owner</th><th>Pts So Far</th><th>Pt Diff</th><th>Projected</th><th>Max Possible</th></tr></thead>
        <tbody>{(data.weeklyStandings||[]).map((r,i)=><tr key={r.owner_id}>
          <td>{i+1}</td><td><b>{r.owner_name}</b></td><td>{Number(r.points_so_far).toFixed(1)}</td><td>{Number(r.weekly_point_diff)>0?'+':''}{Number(r.weekly_point_diff||0)}</td><td><b>{Number(r.projected_points).toFixed(2)}</b></td><td>{Number(r.max_possible).toFixed(1)}</td>
        </tr>)}</tbody>
      </table>
    </div>

    <div className="liveMeta">
      <span>{liveCount} live · {games.filter(g=>g.completed).length} final · {games.filter(g=>!g.completed&&g.status!=='in_progress').length} upcoming</span>
      <span>Last checked: {data.updatedAt?new Date(data.updatedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'—'}</span>
    </div>

    {requestError&&<div className="notice">Live feed issue: {requestError}</div>}
    {data.sync?.error&&<div className="notice">Sync issue: {data.sync.error}</div>}
    {data.sync?.reason==='throttled'&&<div className="muted liveThrottle">A recent sync is being reused to conserve API calls.</div>}

    <div className="sectionTitle"><h2>Games</h2><span className="muted">OT → 4Q → 3Q → 2Q → 1Q → Final → Upcoming</span></div>
    {games.length===0&&!loading?<div className="card liveEmpty">No rostered-team games in the current window.</div>:null}
    <div className="game-list">
      {games.map(g=><div className={`card game-card ${matchupClass(g)}`} key={g.cfbd_game_id}>
        <div className="game-status">{gameState(g)}</div>

        <div className={`game-team ${teamClass(g.away)}`}>
          <span>
            {g.away.owner_name?<small className="game-owner">{g.away.owner_name}</small>:null}
            <span className="game-team-name-line"><strong><TeamName team={g.away} size="normal"/></strong>{g.away.is_owned&&winPct(g,'away')!=null?<span className="win-probability">{(winPct(g,'away')*100).toFixed(1)}%{isFallback(g)?'*':''}</span>:null}</span>
          </span>
          <b>{g.away_score??'—'}</b>
        </div>

        <div className={`game-team ${teamClass(g.home)}`}>
          <span>
            {g.home.owner_name?<small className="game-owner">{g.home.owner_name}</small>:null}
            <span className="game-team-name-line"><strong><TeamName team={g.home} size="normal"/></strong>{g.home.is_owned&&winPct(g,'home')!=null?<span className="win-probability">{(winPct(g,'home')*100).toFixed(1)}%{isFallback(g)?'*':''}</span>:null}</span>
          </span>
          <b>{g.home_score??'—'}</b>
        </div>
        {isFallback(g)?<div className="fallback-odds-note">* No sportsbook moneyline available — using 50/50 projection.</div>:null}
      </div>)}
    </div>
  </div>
}
