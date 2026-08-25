import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncCfbd } from '../../../lib/cfbd';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://invalid.local',
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'missing',
  { auth: { persistSession: false } }
);

export async function GET(request) {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  let sync = null;
  try { sync = await syncCfbd({ forceSchedule: force }); }
  catch (error) { sync = { ok:false, error:error?.message || String(error) }; }

  const now = new Date();
  const from = new Date(now.getTime() - 18*60*60*1000).toISOString();
  const to = new Date(now.getTime() + 30*60*60*1000).toISOString();

  const [
    {data:games,error:gameError},
    {data:directory,error:dirError},
    {data:owners,error:ownerError},
    {data:weeklyOdds,error:oddsError},
    {data:weeklyRows,error:weeklyError},
    {count:totalGames,error:countError}
  ] = await Promise.all([
    supabase.from('games')
      .select('id,cfbd_game_id,week,season_type,start_time,home_team_id,away_team_id,home_score,away_score,status,period,clock,completed,is_conference_championship,is_bowl,is_cfp,playoff_round')
      .eq('season_id',1).gte('start_time',from).lte('start_time',to).order('start_time'),
    supabase.from('team_directory')
      .select('team_id,school,abbreviation,mascot,owner_id,owner_name,is_owned')
      .eq('season_id',1),
    supabase.from('owners').select('id,name,draft_slot').eq('season_id',1).order('draft_slot'),
    supabase.from('weekly_game_odds')
      .select('cfbd_game_id,home_team_id,away_team_id,home_win_probability,away_win_probability,projection_source,books_used,odds_updated_at,fetched_at')
      .eq('season_id',1),
    supabase.from('weekly_owner_points')
      .select('owner_id,owner_name,week_key,weekly_points').eq('season_id',1),
    supabase.from('games').select('id',{count:'exact',head:true}).eq('season_id',1)
  ]);

  if(gameError||dirError||ownerError||oddsError||weeklyError||countError){
    return NextResponse.json({ok:false,error:gameError?.message||dirError?.message||ownerError?.message||oddsError?.message||weeklyError?.message||countError?.message,sync},{status:500});
  }

  const byId=new Map((directory||[]).map(t=>[t.team_id,t]));
  const oddsByGame=new Map((weeklyOdds||[]).map(o=>[String(o.cfbd_game_id),o]));

  const decorated=(games||[]).map(g=>({
    ...g,
    home:byId.get(g.home_team_id)||{school:'Opponent',abbreviation:'OPP',owner_id:null,owner_name:null,is_owned:false},
    away:byId.get(g.away_team_id)||{school:'Opponent',abbreviation:'OPP',owner_id:null,owner_name:null,is_owned:false},
    projection:oddsByGame.get(String(g.cfbd_game_id))||null
  })).filter(g=>g.home.is_owned||g.away.is_owned);

  // Current week is taken from the nearest game in the live window.
  const withWeek=decorated.filter(g=>g.week!=null);
  const currentWeek=withWeek.length ? Number(withWeek[0].week) : null;
  const weekKey=currentWeek!=null ? `Week ${currentWeek}` : null;

  const actualByOwner=new Map();
  if(weekKey){
    for(const r of (weeklyRows||[]).filter(x=>x.week_key===weekKey)){
      actualByOwner.set(r.owner_id,Number(r.weekly_points||0));
    }
  }

  // Remaining cached game probabilities form projected/max remaining win points.
  const projectedRemaining=new Map(), maxRemaining=new Map();
  for(const o of (weeklyOdds||[])){
    const h=byId.get(o.home_team_id),a=byId.get(o.away_team_id);
    if(h?.is_owned&&a?.is_owned&&h.owner_id===a.owner_id){
      projectedRemaining.set(h.owner_id,(projectedRemaining.get(h.owner_id)||0)+1);
      maxRemaining.set(h.owner_id,(maxRemaining.get(h.owner_id)||0)+1);
    }else{
      if(h?.is_owned){
        projectedRemaining.set(h.owner_id,(projectedRemaining.get(h.owner_id)||0)+Number(o.home_win_probability||0.5));
        maxRemaining.set(h.owner_id,(maxRemaining.get(h.owner_id)||0)+1);
      }
      if(a?.is_owned){
        projectedRemaining.set(a.owner_id,(projectedRemaining.get(a.owner_id)||0)+Number(o.away_win_probability||0.5));
        maxRemaining.set(a.owner_id,(maxRemaining.get(a.owner_id)||0)+1);
      }
    }
  }

  const weeklyStandings=(owners||[]).map(o=>{
    const actual=actualByOwner.get(o.id)||0;
    const projected=actual+(projectedRemaining.get(o.id)||0);
    const max=actual+(maxRemaining.get(o.id)||0);
    return {owner_id:o.id,owner_name:o.name,draft_slot:o.draft_slot,points_so_far:actual,projected_points:projected,max_possible:max};
  }).sort((a,b)=>b.projected_points-a.projected_points||b.points_so_far-a.points_so_far||a.draft_slot-b.draft_slot);

  return NextResponse.json({
    ok:Boolean(sync?.ok),
    updatedAt:new Date().toISOString(),
    totalGames:totalGames||0,
    currentWeek,
    weekKey,
    sync,
    weeklyStandings,
    games:decorated
  });
}
