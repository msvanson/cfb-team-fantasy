import {NextResponse} from 'next/server';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';
const BASE='https://api.odds-api.io/v3', BOOKS='DraftKings,FanDuel';
async function api(path,key,auth=true){const sep=path.includes('?')?'&':'?';const u=auth?`${BASE}${path}${sep}apiKey=${encodeURIComponent(key)}`:`${BASE}${path}`;const r=await fetch(u,{headers:{accept:'application/json'},cache:'no-store'});const t=await r.text();let body;try{body=JSON.parse(t)}catch{body=t}return{ok:r.ok,status:r.status,body}}
const list=x=>Array.isArray(x)?x:Array.isArray(x?.data)?x.data:Array.isArray(x?.events)?x.events:Array.isArray(x?.items)?x.items:[];
const relSports=a=>a.filter(x=>/football|american/i.test(`${x?.name||''} ${x?.slug||''}`));
const relLeagues=a=>a.filter(x=>/ncaa|ncaaf|college|fbs/i.test(`${x?.name||''} ${x?.slug||''}`));
function chooseSport(a){return a.find(x=>x?.slug==='american-football')||a.find(x=>/american.*football/i.test(`${x?.name||''} ${x?.slug||''}`))||a.find(x=>/football/i.test(`${x?.name||''} ${x?.slug||''}`))}
function chooseLeague(a){return a.find(x=>x?.slug==='usa-ncaaf')||a.find(x=>/ncaaf/i.test(`${x?.name||''} ${x?.slug||''}`))||a.find(x=>/ncaa.*football|college.*football|fbs/i.test(`${x?.name||''} ${x?.slug||''}`))}
function mls(body){const books=body?.bookmakers||body?.data?.bookmakers||{},out=[];for(const [book,markets] of Object.entries(books||{}))for(const m of(Array.isArray(markets)?markets:[])){const n=String(m?.name||m?.key||m?.label||'');if(!/^(ml|moneyline|money line|match winner)$/i.test(n))continue;const o=Array.isArray(m?.odds)?m.odds[0]:m?.odds;out.push({bookmaker:book,market:n,home:o?.home??null,away:o?.away??null})}return out}
async function samples(events,key){const out=[];for(const e of events.slice(0,3)){const r=await api(`/odds?eventId=${encodeURIComponent(e.id)}&bookmakers=${encodeURIComponent(BOOKS)}`,key);out.push({id:e.id,away:e.away,home:e.home,date:e.date,status:e.status,ok:r.ok,http:r.status,moneylines:r.ok?mls(r.body):[]})}return out}
export async function GET(){
 if(!await isAdminAuthenticated())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
 const key=process.env.ODDS_API_KEY;if(!key)return NextResponse.json({ok:false,error:'ODDS_API_KEY missing'},{status:500});
 try{
  const sr=await api('/sports',key,false), sports=list(sr.body), football=relSports(sports), primary=chooseSport(football.length?football:sports);
  if(!sr.ok||!primary)return NextResponse.json({ok:false,stage:'sports',error:'Could not discover a football sport.',sports},{status:502});
  const attempts=[];let leagues=[];
  for(const sp of [primary,...football.filter(x=>x?.slug!==primary?.slug)].slice(0,5)){if(!sp?.slug)continue;const lr=await api(`/leagues?sport=${encodeURIComponent(sp.slug)}&all=true`,key);const ls=lr.ok?list(lr.body):[];attempts.push({sport:sp,status:lr.status,count:ls.length,relevant:relLeagues(ls)});leagues.push(...ls.map(l=>({...l,_sportSlug:sp.slug,_sportName:sp.name})))}
  let league=chooseLeague(leagues), search=[];
  if(!league){for(const q of ['NCAAF','NCAA football','college football']){const r=await api(`/events/search?query=${encodeURIComponent(q)}`,key);if(r.ok)search.push(...list(r.body))}const e=search.find(e=>/ncaa|ncaaf|college|fbs/i.test(`${e?.league?.name||''} ${e?.league?.slug||''}`));if(e?.league?.slug)league={...e.league,_sportSlug:e?.sport?.slug||primary.slug,_sportName:e?.sport?.name||primary.name,_fromSearch:true}}
  if(!league)return NextResponse.json({ok:false,stage:'league-discovery',error:'NCAAF still was not discoverable. This result now shows what your key actually sees.',sports:football,leagueAttempts:attempts,eventSearch:search.slice(0,20)},{status:502});
  const sport=league._sportSlug||primary.slug, slug=league.slug;
  const ur=await api(`/events?sport=${encodeURIComponent(sport)}&league=${encodeURIComponent(slug)}&status=pending&limit=50`,key), upcoming=ur.ok?list(ur.body):[];
  const lr=await api(`/events/live?sport=${encodeURIComponent(sport)}`,key), liveAll=lr.ok?list(lr.body):[], live=liveAll.filter(e=>String(e?.league?.slug||'')===String(slug));
  const [us,ls]=await Promise.all([samples(upcoming,key),samples(live,key)]);
  const pre=us.reduce((n,x)=>n+x.moneylines.length,0), liv=ls.reduce((n,x)=>n+x.moneylines.length,0);
  return NextResponse.json({ok:true,discovery:{footballSports:football,leagueAttempts:attempts,selectedSport:{name:league._sportName||primary.name,slug:sport},selectedLeague:{name:league.name,slug,fromSearch:!!league._fromSearch}},pregame:{eventCount:upcoming.length,moneylineEntries:pre,samples:us},live:{endpointOk:lr.ok,status:lr.status,eventCount:live.length,moneylineEntries:liv,samples:ls,conclusion:!lr.ok?'blocked':live.length===0?'no-live-ncaaf-games':liv>0?'live-moneylines-confirmed':'live-events-no-moneylines'}})
 }catch(e){return NextResponse.json({ok:false,stage:'exception',error:e?.message||String(e)},{status:500})}
}
