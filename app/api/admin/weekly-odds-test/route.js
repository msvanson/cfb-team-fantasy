import {NextResponse} from 'next/server';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';
import {createClient} from '@supabase/supabase-js';
const BASE='https://api.odds-api.io/v3';
const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
const norm=s=>String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim();
function tm(a,s){a=norm(a);s=norm(s);return a===s||a.startsWith(s+' ')||s.startsWith(a+' ')}
function em(e,h,a){return(tm(e.home,h)&&tm(e.away,a))||(tm(e.home,a)&&tm(e.away,h))}
const list=x=>Array.isArray(x)?x:Array.isArray(x?.data)?x.data:Array.isArray(x?.events)?x.events:Array.isArray(x?.items)?x.items:[];
export async function GET(){
 if(!await isAdminAuthenticated())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
 const key=process.env.ODDS_API_KEY;if(!key)return NextResponse.json({ok:false,error:'ODDS_API_KEY missing'},{status:500});
 try{
  const now=new Date().toISOString();
  const {data:games,error:ge}=await supabase.from('games').select('cfbd_game_id,start_time,home_team_id,away_team_id,completed').eq('season_id',1).gte('start_time',now).eq('completed',false).order('start_time',{ascending:true}).limit(20);if(ge)throw ge;
  const ids=[...new Set((games||[]).flatMap(g=>[g.home_team_id,g.away_team_id]))];
  const {data:teams,error:te}=await supabase.from('team_directory').select('team_id,school').eq('season_id',1).in('team_id',ids);if(te)throw te;
  const names=new Map((teams||[]).map(t=>[t.team_id,t.school]));
  const url=`${BASE}/events?sport=american-football&league=usa-college&status=pending&limit=500&apiKey=${encodeURIComponent(key)}`;
  const r=await fetch(url,{headers:{accept:'application/json'},cache:'no-store'});
  const text=await r.text();let body;try{body=JSON.parse(text)}catch{body=text}const pool=r.ok?list(body):[];
  const checks=(games||[]).slice(0,12).map(g=>{const home=names.get(g.home_team_id),away=names.get(g.away_team_id);const e=pool.find(x=>em(x,home,away));return{startTime:g.start_time,home,away,eventMatched:!!e,eventId:e?.id||null,apiHome:e?.home||null,apiAway:e?.away||null}});
  return NextResponse.json({ok:r.ok,mode:'ONE_CALL_EVENT_POOL',externalRequestsUsed:1,httpStatus:r.status,eventPoolCount:pool.length,fbsGamesChecked:checks.length,fbsGamesMatched:checks.filter(x=>x.eventMatched).length,checks,error:r.ok?null:String(body?.message||body?.error||body)});
 }catch(e){return NextResponse.json({ok:false,mode:'ONE_CALL_EVENT_POOL',externalRequestsUsed:0,error:e?.message||String(e)},{status:500})}
}
