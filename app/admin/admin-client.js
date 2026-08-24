'use client';
import { useState } from 'react';

export function Login(){
  const [password,setPassword]=useState(''); const [msg,setMsg]=useState('');
  async function submit(e){e.preventDefault();setMsg('Signing in…');const r=await fetch('/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});const j=await r.json();if(r.ok)location.reload();else setMsg(j.error||'Login failed')}
  return <div className="card adminLogin"><h2>Commissioner Login</h2><p className="muted">This page is hidden from public navigation.</p><form onSubmit={submit}><input className="field" type="password" placeholder="Commissioner password" value={password} onChange={e=>setPassword(e.target.value)}/><button className="button" type="submit">Sign in</button></form>{msg&&<div className="notice">{msg}</div>}</div>
}

export function AdminPanel({teams}){
  const [msg,setMsg]=useState('');
  const [teamId,setTeamId]=useState(teams[0]?.team_id||'');
  const [points,setPoints]=useState(1);
  const [eventType,setEventType]=useState('commissioner_adjustment');
  const [weekKey,setWeekKey]=useState('Commissioner');
  const [note,setNote]=useState('');
  const [gameId,setGameId]=useState('');
  const [gameType,setGameType]=useState('ccg');
  async function post(url,body){setMsg('Working…');const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const j=await r.json();setMsg(r.ok?'Saved successfully':(j.error||'Action failed'));if(r.ok)setTimeout(()=>location.reload(),700)}
  return <div>
    <div className="adminActions">
      <div className="card"><h2>CFBD Sync</h2><p className="muted">Clear the shared cooldown and run a score/schedule sync immediately.</p><button className="button" onClick={()=>post('/api/admin/sync')}>Force CFBD Sync</button></div>
      <div className="card"><h2>Manual Scoring Adjustment</h2><label>Team</label><select className="field" value={teamId} onChange={e=>setTeamId(e.target.value)}>{teams.map(t=><option key={t.team_id} value={t.team_id}>{t.school}</option>)}</select><label>Event</label><input className="field" value={eventType} onChange={e=>setEventType(e.target.value)}/><label>Points</label><input className="field" type="number" value={points} onChange={e=>setPoints(e.target.value)}/><label>Week key</label><input className="field" value={weekKey} onChange={e=>setWeekKey(e.target.value)}/><label>Note</label><input className="field" value={note} onChange={e=>setNote(e.target.value)}/><button className="button" onClick={()=>post('/api/admin/scoring',{teamId,eventType,points,weekKey,note})}>Add Adjustment</button></div>
      <div className="card"><h2>Postseason Game Override</h2><p className="muted">Use only if CFBD labels a postseason game incorrectly.</p><label>Internal game ID</label><input className="field" type="number" value={gameId} onChange={e=>setGameId(e.target.value)}/><label>Classification</label><select className="field" value={gameType} onChange={e=>setGameType(e.target.value)}><option value="ccg">Conference Championship</option><option value="bowl">Bowl</option><option value="cfp">CFP</option></select><button className="button" onClick={()=>post('/api/admin/classification',{gameId,isCcg:gameType==='ccg',isBowl:gameType==='bowl',isCfp:gameType==='cfp'})}>Apply Override</button></div>
    </div>
    {msg&&<div className="notice">{msg}</div>}
    <button className="button secondary" onClick={async()=>{await fetch('/api/admin/logout',{method:'POST'});location.reload()}}>Log out</button>
  </div>
}
