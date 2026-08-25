import {NextResponse} from 'next/server';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';

const BASE='https://api.odds-api.io/v3';
async function get(path,key,needsKey=true){
  const sep=path.includes('?')?'&':'?';
  const url=needsKey?`${BASE}${path}${sep}apiKey=${encodeURIComponent(key)}`:`${BASE}${path}`;
  const r=await fetch(url,{headers:{accept:'application/json'},cache:'no-store'});
  const text=await r.text();
  let body; try{body=JSON.parse(text)}catch{body=text}
  return {ok:r.ok,status:r.status,body};
}
const arr=x=>Array.isArray(x)?x:Array.isArray(x?.data)?x.data:Array.isArray(x?.events)?x.events:Array.isArray(x?.items)?x.items:[];
const compactEvent=e=>e?({id:e.id,home:e.home,away:e.away,date:e.date,status:e.status,league:e.league,sport:e.sport,bookmakerCount:e.bookmakerCount,scores:e.scores}):null;
const sanitizeOdds=o=>{
  if(!o||typeof o!=='object')return o;
  // API responses contain no API key, but cap size so Admin stays readable.
  return JSON.parse(JSON.stringify(o).slice(0,12000));
};
export async function GET(){
  if(!await isAdminAuthenticated()) return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
  const key=process.env.ODDS_API_KEY;
  if(!key) return NextResponse.json({ok:false,error:'ODDS_API_KEY missing'},{status:500});
  try{
    const sportsR=await get('/sports',key,false);
    const sports=arr(sportsR.body);
    const football=sports.filter(x=>/football|american/i.test(`${x?.name||''} ${x?.slug||''}`));
    const sport=football.find(x=>x.slug==='american-football')||football[0];
    if(!sport) return NextResponse.json({ok:false,stage:'sports',sportsRaw:sportsR.body});

    const leaguesR=await get(`/leagues?sport=${encodeURIComponent(sport.slug)}&all=true`,key);
    const leagues=arr(leaguesR.body);
    let league=leagues.find(x=>x.slug==='usa-ncaaf')||leagues.find(x=>/ncaaf|ncaa.*football|college.*football|fbs/i.test(`${x?.name||''} ${x?.slug||''}`));

    let searchRaw=[];
    if(!league){
      for(const q of ['NCAAF','NCAA football','college football']){
        const r=await get(`/events/search?query=${encodeURIComponent(q)}`,key);
        searchRaw.push({query:q,status:r.status,body:r.body});
        const e=arr(r.body).find(x=>/ncaa|ncaaf|college|fbs/i.test(`${x?.league?.name||''} ${x?.league?.slug||''}`));
        if(e?.league?.slug){league=e.league;break}
      }
    }
    if(!league) return NextResponse.json({ok:false,stage:'league',sport,leaguesRaw:leaguesR.body,searchRaw});

    // Intentionally run several event queries so we can see whether a filter is the issue.
    const q1=await get(`/events?sport=${encodeURIComponent(sport.slug)}&league=${encodeURIComponent(league.slug)}&status=pending&limit=50`,key);
    const q2=await get(`/events?sport=${encodeURIComponent(sport.slug)}&league=${encodeURIComponent(league.slug)}&limit=50`,key);
    const q3=await get(`/events?sport=${encodeURIComponent(sport.slug)}&status=pending&limit=200`,key);

    const pendingLeague=arr(q1.body);
    const anyLeague=arr(q2.body);
    const pendingSport=arr(q3.body);
    const ncaaFromSport=pendingSport.filter(e=>String(e?.league?.slug||'')===String(league.slug)||/ncaaf|ncaa.*football|college.*football|fbs/i.test(`${e?.league?.name||''} ${e?.league?.slug||''}`));

    const chosen=pendingLeague[0]||anyLeague[0]||ncaaFromSport[0]||null;
    let chosenOdds=null;
    if(chosen?.id){
      const or=await get(`/odds?eventId=${encodeURIComponent(chosen.id)}&bookmakers=${encodeURIComponent('DraftKings,FanDuel')}`,key);
      chosenOdds={httpStatus:or.status,ok:or.ok,event:compactEvent(chosen),raw:sanitizeOdds(or.body)};
    }

    const liveR=await get(`/events/live?sport=${encodeURIComponent(sport.slug)}`,key);
    const liveAll=arr(liveR.body);
    const liveNcaa=liveAll.filter(e=>String(e?.league?.slug||'')===String(league.slug)||/ncaaf|ncaa.*football|college.*football|fbs/i.test(`${e?.league?.name||''} ${e?.league?.slug||''}`));
    let liveOdds=null;
    if(liveNcaa[0]?.id){
      const lor=await get(`/odds?eventId=${encodeURIComponent(liveNcaa[0].id)}&bookmakers=${encodeURIComponent('DraftKings,FanDuel')}`,key);
      liveOdds={httpStatus:lor.status,ok:lor.ok,event:compactEvent(liveNcaa[0]),raw:sanitizeOdds(lor.body)};
    }

    return NextResponse.json({
      ok:true,
      selected:{sport,league},
      pregame:{
        pendingLeagueQuery:{httpStatus:q1.status,count:pendingLeague.length,raw:sanitizeOdds(q1.body)},
        noStatusLeagueQuery:{httpStatus:q2.status,count:anyLeague.length,raw:sanitizeOdds(q2.body)},
        pendingWholeSportQuery:{httpStatus:q3.status,count:pendingSport.length,ncaafMatches:ncaaFromSport.length,rawSample:pendingSport.slice(0,10).map(compactEvent)},
        selectedEventOdds:chosenOdds
      },
      live:{
        explanation:'Only games actually in progress should appear here.',
        httpStatus:liveR.status,
        allLiveCount:liveAll.length,
        ncaafLiveCount:liveNcaa.length,
        rawNcaafEvents:liveNcaa.slice(0,10).map(compactEvent),
        selectedLiveOdds:liveOdds
      }
    });
  }catch(e){
    return NextResponse.json({ok:false,stage:'exception',error:e?.message||String(e)},{status:500});
  }
}
