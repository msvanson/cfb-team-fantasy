import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncCfbd } from '../../../lib/cfbd';
import { currentFantasyWeek } from '../../../lib/fantasy-weeks';
import { finalizeEndedFantasyWeeks } from '../../../lib/weekly-snapshots';

function compareWeeklyRank(a,b){
  // Official weekly order:
  // 1) fantasy points earned, 2) combined point differential, 3) higher draft order.
  return Number(b.points_so_far||0)-Number(a.points_so_far||0)
    || Number(b.weekly_point_diff||0)-Number(a.weekly_point_diff||0)
    || Number(a.draft_slot||999)-Number(b.draft_slot||999);
}
function compareLiveDisplay(a,b){
  // During an unfinished week, projection is useful for display only.
  // Exact projected ties fall back to the official weekly ranking rules.
  return Number(b.projected_points||0)-Number(a.projected_points||0) || compareWeeklyRank(a,b);
}


export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://invalid.local',
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'missing',
  { auth: { persistSession: false } }
);

export async function GET(request) {
  try{await finalizeEndedFantasyWeeks(new Date())}catch{}
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  let sync = null;
  try { sync = await syncCfbd({ forceSchedule: force }); }
  catch (error) { sync = { ok:false, error:error?.message || String(error) }; }

  const now = new Date();
  const fantasyWeek = currentFantasyWeek(now);
  const from = fantasyWeek.start;
  const to = fantasyWeek.end;

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

  const currentWeek = fantasyWeek.label;
  const weekKey = fantasyWeek.key;
  const weekDates = fantasyWeek.dates;

  const actualByOwner=new Map();
  if(weekKey){
    for(const r of (weeklyRows||[]).filter(x=>x.week_key===weekKey)){
      actualByOwner.set(r.owner_id,Number(r.weekly_points||0));
    }
  }

  // Project only UNFINISHED games in the current custom fantasy week.
  // Completed games are represented only by actual weekly scoring, preventing double counting.
  // Missing cached odds use the league's neutral 50/50 fallback.
  const projectedRemaining=new Map(), maxRemaining=new Map();
  for(const g of decorated){
    if(g.completed) continue;

    const h=g.home,a=g.away,o=g.projection;
    const hp=o?.home_win_probability!=null?Number(o.home_win_probability):0.5;
    const ap=o?.away_win_probability!=null?Number(o.away_win_probability):0.5;

    if(h?.is_owned&&a?.is_owned&&h.owner_id===a.owner_id){
      projectedRemaining.set(h.owner_id,(projectedRemaining.get(h.owner_id)||0)+1);
      maxRemaining.set(h.owner_id,(maxRemaining.get(h.owner_id)||0)+1);
    }else{
      if(h?.is_owned){
        projectedRemaining.set(h.owner_id,(projectedRemaining.get(h.owner_id)||0)+hp);
        maxRemaining.set(h.owner_id,(maxRemaining.get(h.owner_id)||0)+1);
      }
      if(a?.is_owned){
        projectedRemaining.set(a.owner_id,(projectedRemaining.get(a.owner_id)||0)+ap);
        maxRemaining.set(a.owner_id,(maxRemaining.get(a.owner_id)||0)+1);
      }
    }
  }

  // Weekly point differential is live: sum each owned team's score minus its opponent's
  // score for every started game in the current custom fantasy week. Upcoming games add 0.
  const weeklyPointDiff=new Map();
  for(const g of decorated){
    const started=g.completed||g.status==='in_progress'||g.home_score!=null||g.away_score!=null;
    if(!started)continue;
    const hs=Number(g.home_score??0),as=Number(g.away_score??0);
    if(g.home?.is_owned&&g.home.owner_id!=null){
      weeklyPointDiff.set(g.home.owner_id,(weeklyPointDiff.get(g.home.owner_id)||0)+(hs-as));
    }
    if(g.away?.is_owned&&g.away.owner_id!=null){
      weeklyPointDiff.set(g.away.owner_id,(weeklyPointDiff.get(g.away.owner_id)||0)+(as-hs));
    }
  }

  const weeklyStandings=(owners||[]).map(o=>{
    const actual=actualByOwner.get(o.id)||0;
    const projected=actual+(projectedRemaining.get(o.id)||0);
    const max=actual+(maxRemaining.get(o.id)||0);
    return {owner_id:o.id,owner_name:o.name,draft_slot:o.draft_slot,points_so_far:actual,weekly_point_diff:weeklyPointDiff.get(o.id)||0,projected_points:projected,max_possible:max};
  }).sort(compareLiveDisplay);

  const officialWeeklyOrder=[...weeklyStandings].sort(compareWeeklyRank).map((r,i)=>({...r,official_weekly_rank:i+1}));

  return NextResponse.json({
    ok:Boolean(sync?.ok),
    updatedAt:new Date().toISOString(),
    totalGames:totalGames||0,
    currentWeek,
    weekKey,
    weekDates,
    sync,
    weeklyStandings,
    officialWeeklyOrder,
    games:decorated
  });
}