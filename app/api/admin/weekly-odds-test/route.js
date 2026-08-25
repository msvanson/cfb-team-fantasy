import {NextResponse} from 'next/server';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';
import {createClient} from '@supabase/supabase-js';

const BASE='https://api.odds-api.io/v3';
const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});

const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 .replace(/&/g,'and').replace(/\b(university|college|the)\b/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();

const alias={
 'tcu':['tcu','texas christian'],'usc':['usc','southern california'],'umass':['umass','massachusetts'],
 'miami':['miami fl','miami florida'],'miami oh':['miami ohio'],'utsa':['utsa','texas san antonio'],
 'ucf':['ucf','central florida'],'uconn':['uconn','connecticut'],'smu':['smu','southern methodist'],
 'lsu':['lsu','louisiana state'],'ole miss':['ole miss','mississippi'],'byu':['byu','brigham young'],
 'fiu':['fiu','florida international'],'uab':['uab','alabama birmingham'],'utep':['utep','texas el paso'],
 'ul monroe':['ul monroe','ulm','louisiana monroe'],'louisiana':['louisiana','louisiana lafayette','ul lafayette'],
 'nc state':['nc state','north carolina state']
};
const mascot={
 'minnesota':['golden gophers'],
 'missouri':['tigers'],
 'buffalo':['bulls'],
 'delaware':['blue hens'],
 'ucf':['knights'],
 'kennesaw state':['owls'],
 'utah':['utes']
};
function roots(s){const n=norm(s),out=new Set([n]);for(const x of(alias[n]||[]))out.add(norm(x));return[...out].filter(Boolean)}
function strictKnownTeam(apiName,school){
 const a=norm(apiName),n=norm(school); if(!a||!n)return false;
 for(const r of roots(school)){
   if(a===r)return true;
   // Mascot suffix is acceptable only when the API name starts with the exact school/alias boundary.
   if(a.startsWith(r+' ')){
     const suffix=a.slice(r.length+1);
     const expected=(mascot[n]||[]).map(norm);
     // For schools with explicit collision protection, require the correct mascot.
     if(expected.length)return expected.some(m=>suffix===m||suffix.startsWith(m+' '));
     return true;
   }
 }
 return false;
}
function twoSideScore(apiName,school){
 const a=norm(apiName);if(!a||!school)return 0;
 for(const r of roots(school)){if(a===r)return 100;if(a.startsWith(r+' '))return 95}
 return 0;
}
const dh=(a,b)=>Math.abs(new Date(a).getTime()-new Date(b).getTime())/3600000;
function bestMatch(pool,home,away,start){
 if(home&&away){
  let best=null,bestScore=-1;
  for(const e of pool){
   const normal=twoSideScore(e.home,home)+twoSideScore(e.away,away);
   const flip=twoSideScore(e.home,away)+twoSideScore(e.away,home);
   let score=Math.max(normal,flip);const h=dh(e.date,start);
   if(h<=1)score+=30;else if(h<=3)score+=20;else if(h<=8)score+=10;else if(h>24)score-=40;
   if(score>bestScore){bestScore=score;best=e}
  }
  return bestScore>=210?{event:best,score:bestScore,mode:'two-sided'}:null;
 }
 const known=home||away;if(!known)return null;
 // One-sided: exact FBS identity + very tight kickoff window. No generic substring matching.
 const candidates=pool.filter(e=>dh(e.date,start)<=1&&(strictKnownTeam(e.home,known)||strictKnownTeam(e.away,known)));
 if(candidates.length!==1)return null; // ambiguous is safer than wrong
 return {event:candidates[0],score:130,mode:'one-sided'};
}
const list=x=>Array.isArray(x)?x:Array.isArray(x?.data)?x.data:Array.isArray(x?.events)?x.events:Array.isArray(x?.items)?x.items:[];

export async function GET(){
 if(!await isAdminAuthenticated())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
 const key=process.env.ODDS_API_KEY;if(!key)return NextResponse.json({ok:false,error:'ODDS_API_KEY missing'},{status:500});
 try{
  const now=new Date().toISOString();
  const {data:games,error:ge}=await supabase.from('games').select('cfbd_game_id,start_time,home_team_id,away_team_id,completed')
   .eq('season_id',1).gte('start_time',now).eq('completed',false).order('start_time',{ascending:true}).limit(30);if(ge)throw ge;
  const ids=[...new Set((games||[]).flatMap(g=>[g.home_team_id,g.away_team_id]).filter(Boolean))];
  const {data:teams,error:te}=await supabase.from('team_directory').select('team_id,school').eq('season_id',1).in('team_id',ids);if(te)throw te;
  const names=new Map((teams||[]).map(t=>[t.team_id,t.school]));

  // Exactly ONE Odds-API request.
  const r=await fetch(`${BASE}/events?sport=american-football&league=usa-college&status=pending&limit=500&apiKey=${encodeURIComponent(key)}`,{headers:{accept:'application/json'},cache:'no-store'});
  const text=await r.text();let body;try{body=JSON.parse(text)}catch{body=text}
  const pool=r.ok?list(body):[];

  const checks=(games||[]).slice(0,20).map(g=>{
   const home=names.get(g.home_team_id)||null,away=names.get(g.away_team_id)||null;
   const m=bestMatch(pool,home,away,g.start_time);
   return{startTime:g.start_time,home,away,matched:!!m,matchMode:m?.mode||null,matchScore:m?.score||null,
    event:m?{id:m.event.id,home:m.event.home,away:m.event.away,date:m.event.date}:null};
  });
  return NextResponse.json({ok:r.ok,mode:'ONE_CALL_STRICT_MATCHER',externalRequestsUsed:1,httpStatus:r.status,eventPoolCount:pool.length,
   gamesChecked:checks.length,matched:checks.filter(x=>x.matched).length,twoSidedMatched:checks.filter(x=>x.matchMode==='two-sided').length,
   oneSidedMatched:checks.filter(x=>x.matchMode==='one-sided').length,checks,note:'Strict one-sided matching rejects ambiguous school-name collisions.'},
   {status:r.ok?200:502});
 }catch(e){return NextResponse.json({ok:false,externalRequestsUsed:0,error:e?.message||String(e)},{status:500})}
}
