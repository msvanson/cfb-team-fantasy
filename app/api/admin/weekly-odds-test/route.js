import {NextResponse} from 'next/server';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';
import {createClient} from '@supabase/supabase-js';
import {currentFantasyWeek} from '../../../../lib/fantasy-weeks';

const BASE='https://api.odds-api.io/v3';
const supabase=createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}
);

const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,'and').replace(/\b(university|college|the)\b/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const aliases={'tcu':['tcu','texas christian'],'usc':['usc','southern california'],'umass':['umass','massachusetts'],'ucf':['ucf','central florida'],'uconn':['uconn','connecticut'],'smu':['smu','southern methodist'],'lsu':['lsu','louisiana state'],'ole miss':['ole miss','mississippi'],'byu':['byu','brigham young'],'fiu':['fiu','florida international'],'uab':['uab','alabama birmingham'],'utep':['utep','texas el paso'],'nc state':['nc state','north carolina state']};
const roots=s=>{const n=norm(s),a=new Set([n]);for(const x of(aliases[n]||[]))a.add(norm(x));return[...a]};
function exactTeam(api,school,mascot){const a=norm(api);for(const r of roots(school)){if(a===r)return true;if(a.startsWith(r+' ')){if(mascot)return a===`${r} ${norm(mascot)}`;return true}}return false}
const hours=(a,b)=>Math.abs(new Date(a)-new Date(b))/3600000;
const list=x=>Array.isArray(x)?x:Array.isArray(x?.data)?x.data:Array.isArray(x?.events)?x.events:[];
function findEvent(pool,g,h,a){
 const candidates=pool.filter(e=>hours(e.date,g.start_time)<=1);
 if(h&&a)return candidates.find(e=>(exactTeam(e.home,h.school,h.mascot)&&exactTeam(e.away,a.school,a.mascot))||(exactTeam(e.home,a.school,a.mascot)&&exactTeam(e.away,h.school,h.mascot)))||null;
 const known=h||a;if(!known)return null;
 const m=candidates.filter(e=>exactTeam(e.home,known.school,known.mascot)||exactTeam(e.away,known.school,known.mascot));
 return m.length===1?m[0]:null;
}
function ml(book){const m=(book||[]).find(x=>x.name==='ML');return m?.odds?.[0]||null}
function fair(home,away){home=Number(home);away=Number(away);if(!home||!away)return null;const h=1/home,a=1/away,t=h+a;return{home:h/t,away:a/t}}
function latestTime(book){const m=(book||[]).find(x=>x.name==='ML');return m?.updatedAt||null}

export async function GET(){
 if(!await isAdminAuthenticated())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
 if(!process.env.ODDS_API_KEY)return NextResponse.json({ok:false,error:'ODDS_API_KEY missing'},{status:500});
 if(!process.env.SUPABASE_SERVICE_ROLE_KEY)return NextResponse.json({ok:false,error:'SUPABASE_SERVICE_ROLE_KEY missing'},{status:500});
 const key=process.env.ODDS_API_KEY;
 try{
  const fantasyWeek=currentFantasyWeek(new Date());
  const {data:games,error:ge}=await supabase.from('games').select('cfbd_game_id,start_time,home_team_id,away_team_id,completed').gte('start_time',fantasyWeek.start).lt('start_time',fantasyWeek.end).eq('season_id',1).eq('completed',false).order('start_time');if(ge)throw ge;
  const ids=[...new Set((games||[]).flatMap(g=>[g.home_team_id,g.away_team_id]).filter(Boolean))];
  const {data:teams,error:te}=await supabase.from('team_directory').select('team_id,school,mascot,owner_id,owner_name,is_owned').eq('season_id',1).in('team_id',ids);if(te)throw te;
  const tm=new Map((teams||[]).map(t=>[t.team_id,t]));
  const relevant=(games||[]).filter(g=>tm.get(g.home_team_id)?.is_owned||tm.get(g.away_team_id)?.is_owned);

  const poolR=await fetch(`${BASE}/events?sport=american-football&league=usa-college&status=pending&limit=500&apiKey=${encodeURIComponent(key)}`,{cache:'no-store'});
  const poolBody=await poolR.json();if(!poolR.ok)throw new Error(`Event pool HTTP ${poolR.status}`);
  const pool=list(poolBody);let calls=1,rows=[],ownerTotals={};

  for(const g of relevant){
   const h=tm.get(g.home_team_id)||null,a=tm.get(g.away_team_id)||null,e=findEvent(pool,g,h,a);
   const sameOwner=h?.is_owned&&a?.is_owned&&h.owner_id===a.owner_id;
   let hp=.5,ap=.5,source='fallback_50_50',books=0,dk=null,fd=null,updated=null;

   if(sameOwner){
     source='same_owner_guaranteed';
   }else if(e){
     const or=await fetch(`${BASE}/odds?eventId=${e.id}&bookmakers=${encodeURIComponent('DraftKings,FanDuel')}&apiKey=${encodeURIComponent(key)}`,{cache:'no-store'});calls++;
     const ob=await or.json();
     if(or.ok){
       dk=ml(ob?.bookmakers?.DraftKings);fd=ml(ob?.bookmakers?.FanDuel);
       const probs=[fair(dk?.home,dk?.away),fair(fd?.home,fd?.away)].filter(Boolean);
       books=probs.length;
       if(probs.length){
         hp=probs.reduce((s,p)=>s+p.home,0)/probs.length;ap=1-hp;
         source=probs.length===2?'market_2_book':'market_1_book';
       }
       updated=[latestTime(ob?.bookmakers?.DraftKings),latestTime(ob?.bookmakers?.FanDuel)].filter(Boolean).sort().pop()||null;
     }
   }

   if(sameOwner){
     ownerTotals[h.owner_name]=(ownerTotals[h.owner_name]||0)+1;
   }else{
     if(h?.is_owned)ownerTotals[h.owner_name]=(ownerTotals[h.owner_name]||0)+hp;
     if(a?.is_owned)ownerTotals[a.owner_name]=(ownerTotals[a.owner_name]||0)+ap;
   }

   rows.push({
     season_id:1,cfbd_game_id:g.cfbd_game_id,odds_api_event_id:e?.id||null,home_team_id:g.home_team_id,away_team_id:g.away_team_id,
     home_win_probability:hp,away_win_probability:ap,projection_source:source,books_used:books,
     draftkings_home_decimal:dk?.home?Number(dk.home):null,draftkings_away_decimal:dk?.away?Number(dk.away):null,
     fanduel_home_decimal:fd?.home?Number(fd.home):null,fanduel_away_decimal:fd?.away?Number(fd.away):null,
     odds_updated_at:updated,fetched_at:new Date().toISOString(),
     details:{home:h?.school||null,away:a?.school||null,home_owner:h?.owner_name||null,away_owner:a?.owner_name||null}
   });
  }

  if(rows.length){
    const {error:ue}=await supabase.from('weekly_game_odds').upsert(rows,{onConflict:'season_id,cfbd_game_id'});if(ue)throw ue;
  }

  return NextResponse.json({ok:true,mode:'WEEKLY_ODDS_CACHE_REFRESH',externalRequestsUsed:calls,relevantGames:relevant.length,rowsSaved:rows.length,ownerProjectedWinPoints:ownerTotals,
    fallbackGames:rows.filter(x=>x.projection_source==='fallback_50_50').length,marketGames:rows.filter(x=>x.projection_source.startsWith('market_')).length,sameOwnerGames:rows.filter(x=>x.projection_source==='same_owner_guaranteed').length});
 }catch(e){return NextResponse.json({ok:false,error:e?.message||String(e)},{status:500})}
}