import {NextResponse} from 'next/server';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';

const BASE='https://api.sportsdata.io/v3/cfb/odds/json';

async function call(path,key){
  const r=await fetch(`${BASE}/${path}`,{
    headers:{'Ocp-Apim-Subscription-Key':key},
    cache:'no-store'
  });
  const t=await r.text();
  let b;
  try{b=JSON.parse(t)}catch{b=t}
  return {ok:r.ok,status:r.status,body:b};
}

function uniq(xs){return [...new Set(xs.filter(Boolean).map(x=>String(x)))];}

function deepShape(rows){
  const markets=rows.flatMap(e=>Array.isArray(e?.BettingMarkets)?e.BettingMarkets:[]);
  const outcomes=markets.flatMap(m=>Array.isArray(m?.BettingOutcomes)?m.BettingOutcomes:[]);
  const marketLabels=uniq(markets.flatMap(m=>[
    m?.Name,
    m?.BettingMarketType,
    m?.BettingBetType,
    m?.BettingPeriodType,
    m?.TeamKey,
    m?.PlayerName
  ])).slice(0,120);

  const marketTypes=uniq(markets.map(m=>m?.BettingMarketType)).slice(0,80);
  const betTypes=uniq(markets.map(m=>m?.BettingBetType)).slice(0,80);
  const outcomeFields=uniq(outcomes.flatMap(o=>Object.keys(o||{}))).sort();

  const outcomeLabels=uniq(outcomes.flatMap(o=>[
    o?.Name,
    o?.TeamKey,
    o?.TeamName,
    o?.Participant,
    o?.BettingOutcomeType,
    o?.BettingOutcomeTypeName
  ])).slice(0,120);

  const sportsbookFields=uniq(outcomes.flatMap(o=>[
    o?.Sportsbook?.Name,
    o?.SportsbookName,
    typeof o?.Sportsbook==='string'?o.Sportsbook:null
  ])).slice(0,40);

  const samples=markets.slice(0,12).map(m=>({
    marketName:m?.Name||null,
    marketType:m?.BettingMarketType||null,
    betType:m?.BettingBetType||null,
    teamKey:m?.TeamKey||null,
    outcomeCount:Array.isArray(m?.BettingOutcomes)?m.BettingOutcomes.length:0,
    marketFields:Object.keys(m||{}).sort(),
    firstOutcomeFields:Array.isArray(m?.BettingOutcomes)&&m.BettingOutcomes[0]?Object.keys(m.BettingOutcomes[0]).sort():[]
  }));

  const text=JSON.stringify(markets).toLowerCase();

  return {
    marketCount:markets.length,
    outcomeCount:outcomes.length,
    marketLabels,
    marketTypes,
    betTypes,
    outcomeFields,
    outcomeLabels,
    sportsbooks:sportsbookFields,
    samples,
    detected:{
      winTotals:/win total|regular season wins|season wins/.test(text),
      conferenceChampion:/conference.*champ/.test(text),
      makeConferenceChampionship:/make.*conference|conference.*appearance/.test(text),
      makeCfp:/make.*playoff|playoff.*appearance|college football playoff/.test(text),
      nationalChampion:/national.*champ|championship winner|cfp winner/.test(text)
    }
  };
}

export async function GET(){
  if(!await isAdminAuthenticated()){
    return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
  }

  const key=process.env.SPORTSDATAIO_API_KEY;
  if(!key){
    return NextResponse.json({ok:false,keyVisible:false,error:'SPORTSDATAIO_API_KEY is not visible to this deployment.'},{status:500});
  }

  const attempts=[];
  for(const path of ['BettingFuturesBySeason/2026','BettingFuturesBySeason/2026REG']){
    const r=await call(path,key);
    attempts.push({path,status:r.status,ok:r.ok});

    if(r.ok && Array.isArray(r.body)){
      const rows=r.body;
      return NextResponse.json({
        ok:true,
        keyVisible:true,
        endpoint:path,
        eventCount:rows.length,
        structure:deepShape(rows),
        attempts,
        note:'Trial values may be scrambled. This diagnostic shows field names and market labels, not raw prices.'
      });
    }
  }

  return NextResponse.json({ok:false,keyVisible:true,error:'No usable 2026 futures array returned.',attempts},{status:502});
}
