import {NextResponse} from 'next/server';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';
import {createClient} from '@supabase/supabase-js';

const BASE='https://api.odds-api.io/v3';
const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});

const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 .replace(/&/g,'and').replace(/\b(university|college|the)\b/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();

const alias={
 'tcu':['texas christian','tcu'],
 'usc':['southern california','usc'],
 'umass':['massachusetts','umass'],
 'miami':['miami fl','miami florida'],
 'miami oh':['miami ohio'],
 'utsa':['texas san antonio','utsa'],
 'ucf':['central florida','ucf'],
 'uconn':['connecticut','uconn'],
 'smu':['southern methodist','smu'],
 'lsu':['louisiana state','lsu'],
 'ole miss':['mississippi','ole miss'],
 'byu':['brigham young','byu'],
 'fiu':['florida international','fiu'],
 'uab':['alabama birmingham','uab'],
 'utep':['texas el paso','utep'],
 'ul monroe':['louisiana monroe','ulm'],
 'louisiana':['louisiana lafayette','ul lafayette','louisiana'],
 'nc state':['north carolina state','nc state']
};
function roots(s){
 const n=norm(s), out=new Set([n]);
 for(const x of (alias[n]||[]))out.add(norm(x));
 return [...out].filter(Boolean);
}
function teamScore(apiName,school){
 const a=norm(apiName); if(!a||!school)return 0;
 let best=0;
 for(const s of roots(school)){
  if(a===s)best=Math.max(best,100);
  if(a.startsWith(s+' '))best=Math.max(best,95); // API often appends mascot.
  if(s.startsWith(a+' '))best=Math.max(best,90);
  const aw=new Set(a.split(' ')), sw=s.split(' ');
  const overlap=sw.filter(w=>aw.has(w)).length;
  if(sw.length&&overlap===sw.length)best=Math.max(best,80);
 }
 return best;
}
function dateDistanceHours(a,b){return Math.abs(new Date(a).getTime()-new Date(b).getTime())/3600000}
function bestMatch(pool,home,away,start){
 let best=null,bestScore=-1;
 for(const e of pool){
  const normal=teamScore(e.home,home)+teamScore(e.away,away);
  const flipped=teamScore(e.home,away)+teamScore(e.away,home);
  let score=Math.max(normal,flipped);
  const dh=dateDistanceHours(e.date,start);
  if(dh<=2)score+=20; else if(dh<=8)score+=10; else if(dh>24)score-=30;
  if(score>bestScore){bestScore=score;best=e}
 }
 return bestScore>=170?{event:best,score:bestScore}:null;
}
const list=x=>Array.isArray(x)?x:Array.isArray(x?.data)?x.data:Array.isArray(x?.events)?x.events:Array.isArray(x?.items)?x.items:[];

export async function GET(){
 if(!await isAdminAuthenticated())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
 const key=process.env.ODDS_API_KEY;if(!key)return NextResponse.json({ok:false,error:'ODDS_API_KEY missing'},{status:500});
 try{
  const now=new Date().toISOString();
  const {data:games,error:ge}=await supabase.from('games').select('cfbd_game_id,start_time,home_team_id,away_team_id,completed')
   .eq('season_id',1).gte('start_time',now).eq('completed',false).order('start_time',{ascending:true}).limit(30);if(ge)throw ge;
  const ids=[...new Set((games||[]).flatMap(g=>[g.home_team_id,g.away_team_id]))];
  const {data:teams,error:te}=await supabase.from('team_directory').select('team_id,school').eq('season_id',1).in('team_id',ids);if(te)throw te;
  const names=new Map((teams||[]).map(t=>[t.team_id,t.school]));

  // Exactly ONE Odds-API request. Everything else is local matching.
  const r=await fetch(`${BASE}/events?sport=american-football&league=usa-college&status=pending&limit=500&apiKey=${encodeURIComponent(key)}`,{headers:{accept:'application/json'},cache:'no-store'});
  const text=await r.text();let body;try{body=JSON.parse(text)}catch{body=text}
  const pool=r.ok?list(body):[];

  const checks=(games||[]).slice(0,20).map(g=>{
   const home=names.get(g.home_team_id),away=names.get(g.away_team_id);
   if(!home||!away)return{startTime:g.start_time,home:home||null,away:away||null,matched:false,reason:'Missing local team-directory name'};
   const m=bestMatch(pool,home,away,g.start_time);
   return{startTime:g.start_time,home,away,matched:!!m,matchScore:m?.score||null,
    event:m?{id:m.event.id,home:m.event.home,away:m.event.away,date:m.event.date}:null};
  });

  return NextResponse.json({
   ok:r.ok,mode:'ONE_CALL_IMPROVED_MATCHER',externalRequestsUsed:1,httpStatus:r.status,eventPoolCount:pool.length,
   gamesChecked:checks.length,matched:checks.filter(x=>x.matched).length,
   missingLocalNames:checks.filter(x=>x.reason).length,checks,
   note:'No odds or live requests were made.'
  },{status:r.ok?200:502});
 }catch(e){return NextResponse.json({ok:false,externalRequestsUsed:0,error:e?.message||String(e)},{status:500})}
}
