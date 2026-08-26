'use client';
import {useEffect,useState} from 'react';
import {TeamName} from '../team-name';

function statusText(g){
  if(!g)return 'No upcoming game found';
  if(g.completed){
    const won=Number(g.team_score)>Number(g.opponent_score);
    return `FINAL · ${won?'W':'L'} ${g.team_score??'—'}–${g.opponent_score??'—'}`;
  }
  if(g.status==='in_progress'){
    let q='LIVE';
    if(Number(g.period)>4)q=`OT${Number(g.period)>5?` ${Number(g.period)-4}`:''}`;
    else if(g.period)q=`Q${g.period}`;
    return `${q}${g.clock?` · ${g.clock}`:''} · ${g.team_score??0}–${g.opponent_score??0}`;
  }
  return new Date(g.start_time).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
}

export default function RosterGameStatus({teamId}){
  const [game,setGame]=useState(undefined);
  useEffect(()=>{
    let active=true;
    async function load(){
      try{
        const r=await fetch('/api/roster-games',{cache:'no-store'});
        const j=await r.json();
        if(active&&r.ok)setGame(j.byTeam?.[teamId]??null);
      }catch{}
    }
    load();
    const id=setInterval(load,60000);
    return()=>{active=false;clearInterval(id)};
  },[teamId]);

  if(game===undefined)return <div className="rosterGameLine muted">Loading game…</div>;
  if(!game)return <div className="rosterGameLine muted">No upcoming game found</div>;

  const pct=(Number(game.win_probability||0.5)*100).toFixed(1);
  const fallback=game.projection_source==='fallback_50_50';
  const live=game.status==='in_progress'&&!game.completed;
  return <div className={`rosterGameLine myRosterGameLine ${live?'isLive':''}`}>
    <span className="myRosterOpponent">{game.is_home?'vs':'@'} <TeamName team={game.opponent} school={game.opponent?.school||'Opponent'} size="sm"/></span>
    <span className={`rosterGameState ${live?'myRosterLiveState':''}`}>{live?<i className="miniLiveDot"/>:null}{statusText(game)}</span>
    {!game.completed&&game.status!=='in_progress'?<span className="rosterGamePct">{pct}%{fallback?'*':''}</span>:null}
  </div>;
}
