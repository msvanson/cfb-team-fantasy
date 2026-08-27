import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {syncCfbd} from '../../../lib/cfbd';

export const dynamic='force-dynamic';
const supabase=createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL||'https://invalid.local',
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'missing',
  {auth:{persistSession:false}}
);

function pickForTeam(teamId,games,now){
  const relevant=games.filter(g=>Number(g.home_team_id)===Number(teamId)||Number(g.away_team_id)===Number(teamId));
  const live=relevant.find(g=>g.status==='in_progress'&&!g.completed);
  if(live)return live;

  // Keep a just-finished game visible for 24 hours, then roll forward to the next game.
  const recentFinal=[...relevant].filter(g=>g.completed&&new Date(g.start_time).getTime()<=now)
    .sort((a,b)=>new Date(b.start_time)-new Date(a.start_time))[0];
  if(recentFinal && now-new Date(recentFinal.start_time).getTime() < 24*60*60*1000)return recentFinal;

  return relevant.filter(g=>!g.completed&&new Date(g.start_time).getTime()>now)
    .sort((a,b)=>new Date(a.start_time)-new Date(b.start_time))[0]||recentFinal||null;
}

export async function GET(){
  let sync = null;

try {
  sync = await syncCfbd({ forceSchedule: false });
} catch {
  sync = {
    ok: false,
    error: 'Live data sync temporarily unavailable'
  };
}

  const now=Date.now();
  const from=new Date(now-18*60*60*1000).toISOString();
  const [
    {data:directory,error:de},
    {data:games,error:ge},
    {data:odds,error:oe}
  ]=await Promise.all([
    supabase.from('team_directory').select('team_id,school,abbreviation,mascot,owner_id,owner_name,is_owned').eq('season_id',1),
    supabase.from('games').select('id,cfbd_game_id,start_time,home_team_id,away_team_id,home_score,away_score,status,period,clock,completed,winner_team_id').eq('season_id',1).gte('start_time',from).order('start_time'),
    supabase.from('weekly_game_odds').select('cfbd_game_id,home_team_id,away_team_id,home_win_probability,away_win_probability,projection_source,books_used,odds_updated_at').eq('season_id',1)
  ]);
  if (de || ge || oe) {
  return NextResponse.json(
    {
      ok: false,
      error: 'Roster game data temporarily unavailable',
      sync
    },
    { status: 500 }
  );
}

  const tm=new Map((directory||[]).map(t=>[Number(t.team_id),t]));
  const om=new Map((odds||[]).map(o=>[String(o.cfbd_game_id),o]));
  const owned=(directory||[]).filter(t=>t.is_owned);
  const byTeam={};

  for(const t of owned){
    const g=pickForTeam(t.team_id,games||[],now);
    if(!g){byTeam[t.team_id]=null;continue}
    const isHome=Number(g.home_team_id)===Number(t.team_id);
    const oppId=isHome?g.away_team_id:g.home_team_id;
    const projection=om.get(String(g.cfbd_game_id))||null;
    const rawPct=projection
      ? Number(isHome?projection.home_win_probability:projection.away_win_probability)
      : 0.5;
    byTeam[t.team_id]={
      ...g,
      team_id:t.team_id,
      is_home:isHome,
      opponent:tm.get(Number(oppId))||{team_id:oppId,school:'Opponent',abbreviation:'OPP'},
      team_score:isHome?g.home_score:g.away_score,
      opponent_score:isHome?g.away_score:g.home_score,
      win_probability:Number.isFinite(rawPct)?rawPct:0.5,
      projection_source:projection?.projection_source||'fallback_50_50',
      books_used:projection?.books_used||0
    };
  }

  return NextResponse.json({ok:true,updatedAt:new Date().toISOString(),sync,byTeam});
}
