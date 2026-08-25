import {NextResponse} from 'next/server';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';
import {createClient} from '@supabase/supabase-js';

const BASE='https://api.odds-api.io/v3';
const BOOKS='DraftKings,FanDuel';

const supabase=createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  {auth:{persistSession:false}}
);

async function api(path,key){
  const sep=path.includes('?')?'&':'?';
  const r=await fetch(`${BASE}${path}${sep}apiKey=${encodeURIComponent(key)}`,{
    headers:{accept:'application/json'},
    cache:'no-store'
  });
  const text=await r.text();
  let body;try{body=JSON.parse(text)}catch{body=text}
  return {ok:r.ok,status:r.status,body};
}
const arr=x=>Array.isArray(x)?x:Array.isArray(x?.data)?x.data:Array.isArray(x?.events)?x.events:Array.isArray(x?.items)?x.items:[];

function norm(s){
  return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim();
}
function loose(a,b){
  const x=norm(a),y=norm(b);
  return x===y||x.startsWith(y+' ')||y.startsWith(x+' ')||x.includes(y)||y.includes(x);
}
function matchEvent(events,home,away){
  return events.find(e=>
    (loose(e.home,home)&&loose(e.away,away))||
    (loose(e.home,away)&&loose(e.away,home))
  )||null;
}
function summarizeOdds(body){
  return {
    topLevelFields:body&&typeof body==='object'?Object.keys(body):[],
    raw:JSON.parse(JSON.stringify(body??null).slice(0,10000))
  };
}

export async function GET(){
  if(!await isAdminAuthenticated())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
  const key=process.env.ODDS_API_KEY;
  if(!key)return NextResponse.json({ok:false,error:'ODDS_API_KEY missing'},{status:500});

  try{
    const now=new Date().toISOString();
    const {data:games,error:ge}=await supabase
      .from('games')
      .select('id,cfbd_game_id,start_time,home_team_id,away_team_id,status,completed')
      .eq('season_id',1)
      .gte('start_time',now)
      .eq('completed',false)
      .order('start_time',{ascending:true})
      .limit(12);
    if(ge)throw ge;

    const teamIds=[...new Set((games||[]).flatMap(g=>[g.home_team_id,g.away_team_id]))];
    const {data:teams,error:te}=await supabase
      .from('team_directory')
      .select('team_id,school')
      .eq('season_id',1)
      .in('team_id',teamIds);
    if(te)throw te;
    const tm=new Map((teams||[]).map(t=>[t.team_id,t.school]));

    const checks=[];
    for(const g of (games||[]).slice(0,8)){
      const home=tm.get(g.home_team_id),away=tm.get(g.away_team_id);
      if(!home||!away)continue;

      // Search by both school names because Odds-API groups all college levels together.
      const queries=[`${away} ${home}`,home,away];
      let events=[],usedQuery=null,searchStatus=null;
      for(const q of queries){
        const sr=await api(`/events/search?query=${encodeURIComponent(q)}`,key);
        searchStatus=sr.status;
        if(sr.ok){
          const found=arr(sr.body);
          events.push(...found);
          const hit=matchEvent(found,home,away);
          if(hit){usedQuery=q;events=found;break}
        }
      }
      const event=matchEvent(events,home,away);
      let odds=null;
      if(event?.id){
        const or=await api(`/odds?eventId=${encodeURIComponent(event.id)}&bookmakers=${encodeURIComponent(BOOKS)}`,key);
        odds={httpStatus:or.status,ok:or.ok,...summarizeOdds(or.body)};
      }
      checks.push({
        cfbdGameId:g.cfbd_game_id,
        startTime:g.start_time,
        home,away,
        searchHttpStatus:searchStatus,
        usedQuery,
        eventMatched:!!event,
        event:event?{id:event.id,home:event.home,away:event.away,date:event.date,status:event.status,league:event.league}:null,
        odds
      });
    }

    const matched=checks.filter(x=>x.eventMatched).length;
    const oddsOk=checks.filter(x=>x.odds?.ok).length;

    // Live endpoint is separate and should only contain games actually underway.
    const liveR=await api('/events/live?sport=american-football',key);
    const liveAll=liveR.ok?arr(liveR.body):[];

    return NextResponse.json({
      ok:true,
      model:'CFBD schedule -> Odds-API event search',
      upcomingGamesChecked:checks.length,
      eventsMatched:matched,
      oddsResponsesOk:oddsOk,
      checks,
      live:{
        endpointOk:liveR.ok,
        httpStatus:liveR.status,
        allAmericanFootballLive:liveAll.length,
        explanation:'Zero is normal when no American-football games are actually in progress.'
      }
    });
  }catch(e){
    return NextResponse.json({ok:false,error:e?.message||String(e)},{status:500});
  }
}
