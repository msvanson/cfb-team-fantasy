import {NextResponse} from 'next/server';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';
import {createClient} from '@supabase/supabase-js';

const BASE='https://api.odds-api.io/v3';
const BOOKS='DraftKings,FanDuel';
const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});

async function api(path,key){
 const sep=path.includes('?')?'&':'?';
 const r=await fetch(`${BASE}${path}${sep}apiKey=${encodeURIComponent(key)}`,{headers:{accept:'application/json'},cache:'no-store'});
 const text=await r.text();let body;try{body=JSON.parse(text)}catch{body=text}
 return {ok:r.ok,status:r.status,body};
}
const arr=x=>Array.isArray(x)?x:Array.isArray(x?.data)?x.data:Array.isArray(x?.events)?x.events:Array.isArray(x?.items)?x.items:[];
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim();

const aliases={
 'north carolina':'north carolina tar heels','tcu':'tcu horned frogs','san jose state':'san jose state spartans',
 'usc':'usc trojans','nc state':'nc state wolfpack','virginia':'virginia cavaliers',
 'jacksonville state':'jacksonville state gamecocks','north dakota state':'north dakota state bison',
 'sacramento state':'sacramento state hornets','eastern michigan':'eastern michigan eagles',
 'hawaii':'hawaii rainbow warriors','stanford':'stanford cardinal',
 'new mexico state':'new mexico state aggies','florida state':'florida state seminoles',
 'memphis':'memphis tigers','unlv':'unlv rebels'
};
function teamMatch(apiName,school){
 const a=norm(apiName),s=norm(school),al=norm(aliases[s]||'');
 return a===s||a===al||a.startsWith(s+' ')||s.startsWith(a+' ')||(al&&a===al);
}
function eventMatch(e,home,away){
 return (teamMatch(e.home,home)&&teamMatch(e.away,away))||(teamMatch(e.home,away)&&teamMatch(e.away,home));
}
function raw(x,n=8000){try{return JSON.parse(JSON.stringify(x??null).slice(0,n))}catch{return x}}

export async function GET(){
 if(!await isAdminAuthenticated())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
 const key=process.env.ODDS_API_KEY;if(!key)return NextResponse.json({ok:false,error:'ODDS_API_KEY missing'},{status:500});
 try{
  const now=new Date().toISOString();
  const {data:games,error:ge}=await supabase.from('games')
   .select('cfbd_game_id,start_time,home_team_id,away_team_id,status,completed')
   .eq('season_id',1).gte('start_time',now).eq('completed',false).order('start_time',{ascending:true}).limit(20);
  if(ge)throw ge;
  const ids=[...new Set((games||[]).flatMap(g=>[g.home_team_id,g.away_team_id]))];
  const {data:teams,error:te}=await supabase.from('team_directory').select('team_id,school').eq('season_id',1).in('team_id',ids);
  if(te)throw te;
  const tm=new Map((teams||[]).map(t=>[t.team_id,t.school]));

  // Pull the actual broad college event pool, then let OUR FBS schedule decide what matters.
  const poolR=await api('/events?sport=american-football&league=usa-college&status=pending&limit=500',key);
  const pool=poolR.ok?arr(poolR.body):[];

  const checks=[];
  for(const g of (games||[]).slice(0,12)){
   const home=tm.get(g.home_team_id),away=tm.get(g.away_team_id);
   if(!home||!away)continue;
   const e=pool.find(x=>eventMatch(x,home,away))||null;
   let odds=null;
   if(e?.id){
    const or=await api(`/odds?eventId=${encodeURIComponent(e.id)}&bookmakers=${encodeURIComponent(BOOKS)}`,key);
    odds={httpStatus:or.status,ok:or.ok,raw:raw(or.body)};
   }
   checks.push({cfbdGameId:g.cfbd_game_id,startTime:g.start_time,home,away,eventMatched:!!e,
    event:e?{id:e.id,home:e.home,away:e.away,date:e.date,status:e.status,league:e.league}:null,odds});
  }

  const matched=checks.filter(x=>x.eventMatched).length;
  const oddsOk=checks.filter(x=>x.odds?.ok).length;
  const liveR=await api('/events/live?sport=american-football',key);
  const live=liveR.ok?arr(liveR.body):[];

  return NextResponse.json({
   ok:true,model:'CFBD FBS schedule → usa-college event pool → matched event odds',
   eventPool:{httpStatus:poolR.status,count:pool.length,sample:pool.slice(0,5).map(e=>({id:e.id,home:e.home,away:e.away,date:e.date,status:e.status,league:e.league}))},
   upcomingGamesChecked:checks.length,eventsMatched:matched,oddsResponsesOk:oddsOk,checks,
   live:{endpointOk:liveR.ok,httpStatus:liveR.status,allAmericanFootballLive:live.length,
    explanation:'Only games actually underway appear here; zero is normal when nothing is live.'}
  });
 }catch(e){return NextResponse.json({ok:false,error:e?.message||String(e)},{status:500})}
}
