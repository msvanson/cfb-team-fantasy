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

function safeShape(rows){
  const topKeys=uniq(rows.flatMap(x=>Object.keys(x||{}))).sort();
  const labels=uniq(rows.flatMap(x=>[
    x?.Name,
    x?.BettingEventType,
    x?.BettingMarketType,
    x?.MarketType,
    x?.BetType,
    x?.Category,
    x?.Description
  ])).slice(0,80);

  const sportsbooks=uniq(rows.flatMap(x=>[
    x?.Sportsbook?.Name,
    typeof x?.Sportsbook==='string'?x.Sportsbook:null,
    x?.SportsbookName
  ])).slice(0,30);

  const participants=uniq(rows.flatMap(x=>[
    x?.Participant,
    x?.Team,
    x?.TeamName,
    x?.Name
  ])).slice(0,40);

  const nestedKeys={};
  for(const row of rows.slice(0,20)){
    for(const [k,v] of Object.entries(row||{})){
      if(v && typeof v==='object' && !Array.isArray(v)){
        nestedKeys[k]=uniq([...(nestedKeys[k]||[]),...Object.keys(v)]).sort();
      }
      if(Array.isArray(v) && v.length && typeof v[0]==='object'){
        nestedKeys[k]=uniq([...(nestedKeys[k]||[]),...Object.keys(v[0]||{})]).sort();
      }
    }
  }

  const samples=rows.slice(0,6).map(x=>({
    label:x?.Name||x?.BettingEventType||x?.BettingMarketType||x?.Description||null,
    market:x?.BettingMarketType||x?.MarketType||x?.BetType||x?.Category||null,
    participant:x?.Participant||x?.TeamName||x?.Team||null,
    sportsbook:x?.Sportsbook?.Name||x?.SportsbookName||(typeof x?.Sportsbook==='string'?x.Sportsbook:null),
    fields:Object.keys(x||{}).sort()
  }));

  return {topKeys,labels,sportsbooks,participants,nestedKeys,samples};
}

export async function GET(){
  if(!await isAdminAuthenticated()){
    return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
  }

  const key=process.env.SPORTSDATAIO_API_KEY;
  if(!key){
    return NextResponse.json({
      ok:false,keyVisible:false,
      error:'SPORTSDATAIO_API_KEY is not visible to this deployment.'
    },{status:500});
  }

  const attempts=[];
  for(const path of ['BettingFuturesBySeason/2026','BettingFuturesBySeason/2026REG']){
    const r=await call(path,key);
    attempts.push({path,status:r.status,ok:r.ok});

    if(r.ok && Array.isArray(r.body)){
      const rows=r.body;
      const text=JSON.stringify(rows).toLowerCase();
      return NextResponse.json({
        ok:true,
        keyVisible:true,
        endpoint:path,
        rowCount:rows.length,
        markets:{
          winTotals:/win total|wins/.test(text),
          conferenceChampion:/conference.*champ/.test(text),
          makeConferenceChampionship:/make.*conference|conference.*appearance/.test(text),
          makeCfp:/make.*playoff|playoff.*appearance|college football playoff/.test(text),
          nationalChampion:/national.*champ|championship winner|cfp winner/.test(text)
        },
        structure:safeShape(rows),
        attempts,
        note:'Trial values may be scrambled. This view intentionally shows feed structure and labels, not raw odds.'
      });
    }
  }

  return NextResponse.json({
    ok:false,keyVisible:true,
    error:'No usable 2026 futures array returned.',
    attempts
  },{status:502});
}
