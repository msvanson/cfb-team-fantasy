import {NextResponse} from 'next/server';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';

const BASE='https://api.odds-api.io/v3';
const BOOKS='DraftKings,FanDuel';

async function api(path,key){
  const sep=path.includes('?')?'&':'?';
  const r=await fetch(`${BASE}${path}${sep}apiKey=${encodeURIComponent(key)}`,{headers:{accept:'application/json'},cache:'no-store'});
  const text=await r.text();
  let body; try{body=JSON.parse(text)}catch{body=text}
  return {ok:r.ok,status:r.status,body};
}
function arr(x){
  if(Array.isArray(x))return x;
  if(Array.isArray(x?.data))return x.data;
  if(Array.isArray(x?.events))return x.events;
  return [];
}
function marketSummary(body){
  const books=body?.bookmakers||body?.data?.bookmakers||{};
  const out=[];
  for(const [book,markets] of Object.entries(books||{})){
    for(const m of (Array.isArray(markets)?markets:[])){
      const name=m?.name||m?.key||m?.label||'';
      if(!/^(ml|moneyline|money line|match winner)$/i.test(String(name)))continue;
      const o=Array.isArray(m?.odds)?m.odds[0]:m?.odds;
      out.push({bookmaker:book,market:name,home:o?.home??null,away:o?.away??null,draw:o?.draw??null,updatedAt:m?.updatedAt??null});
    }
  }
  return out;
}
async function sampleOdds(events,key){
  const samples=[];
  for(const e of events.slice(0,3)){
    const r=await api(`/odds?eventId=${encodeURIComponent(e.id)}&bookmakers=${encodeURIComponent(BOOKS)}`,key);
    samples.push({
      eventId:e.id,home:e.home,away:e.away,status:e.status,date:e.date,
      requestStatus:r.status,ok:r.ok,
      moneylines:r.ok?marketSummary(r.body):[],
      error:r.ok?null:(typeof r.body==='string'?r.body:String(r.body?.message||r.body?.error||'Odds request failed'))
    });
  }
  return samples;
}
export async function GET(){
  if(!await isAdminAuthenticated())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
  const key=process.env.ODDS_API_KEY;
  if(!key)return NextResponse.json({ok:false,error:'ODDS_API_KEY is not visible to this deployment.'},{status:500});
  try{
    const leagues=await api('/leagues?sport=american-football',key);
    if(!leagues.ok)return NextResponse.json({ok:false,keyVisible:true,error:`Leagues request failed (${leagues.status})`},{status:502});
    const leagueList=arr(leagues.body);
    const ncaa=leagueList.find(l=>String(l?.slug||'').toLowerCase()==='usa-ncaaf')
      || leagueList.find(l=>/ncaa.*football|college football|ncaaf/i.test(String(l?.name||'')));
    if(!ncaa)return NextResponse.json({ok:false,keyVisible:true,error:'NCAAF league was not found in the account response.'},{status:502});
    const slug=ncaa.slug||'usa-ncaaf';
    const [pendingR,liveR]=await Promise.all([
      api(`/events?sport=american-football&league=${encodeURIComponent(slug)}&status=pending&limit=50`,key),
      api(`/events?sport=american-football&league=${encodeURIComponent(slug)}&status=live&limit=50`,key)
    ]);
    const pending=pendingR.ok?arr(pendingR.body):[];
    const live=liveR.ok?arr(liveR.body):[];
    const [pendingSamples,liveSamples]=await Promise.all([sampleOdds(pending,key),sampleOdds(live,key)]);
    const pendingMoneylines=pendingSamples.reduce((n,x)=>n+x.moneylines.length,0);
    const liveMoneylines=liveSamples.reduce((n,x)=>n+x.moneylines.length,0);
    return NextResponse.json({
      ok:true,keyVisible:true,league:{name:ncaa.name,slug},
      pending:{endpointOk:pendingR.ok,status:pendingR.status,eventCount:pending.length,sampled:pendingSamples.length,moneylineEntries:pendingMoneylines,samples:pendingSamples},
      live:{endpointOk:liveR.ok,status:liveR.status,eventCount:live.length,sampled:liveSamples.length,moneylineEntries:liveMoneylines,samples:liveSamples,
        conclusion:!liveR.ok?'blocked':live.length===0?'no-live-games-to-test':liveMoneylines>0?'live-moneylines-confirmed':'live-events-but-no-moneylines'},
      bookmakers:['DraftKings','FanDuel']
    });
  }catch(e){
    return NextResponse.json({ok:false,keyVisible:true,error:e?.message||String(e)},{status:500});
  }
}
