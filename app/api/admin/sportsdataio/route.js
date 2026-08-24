import {NextResponse} from 'next/server';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';

const BASE='https://api.sportsdata.io/v3/cfb/odds/json';
async function call(path,key){
  const r=await fetch(`${BASE}/${path}`,{headers:{'Ocp-Apim-Subscription-Key':key},cache:'no-store'});
  const t=await r.text(); let b; try{b=JSON.parse(t)}catch{b=t}
  return {ok:r.ok,status:r.status,body:b};
}
function inspect(rows){
  const markets=rows.flatMap(e=>Array.isArray(e?.BettingMarkets)?e.BettingMarkets:[]);
  const target=/total wins|to make the playoffs|to reach .*final|national championship winner|to make the national championship game|quarterfinals|semifinals/i;
  const relevant=markets.filter(m=>target.test(String(m?.BettingBetType||m?.Name||'')));
  const outcomes=relevant.flatMap(m=>Array.isArray(m?.BettingOutcomes)?m.BettingOutcomes:[]);
  const consensus=relevant.flatMap(m=>Array.isArray(m?.ConsensusOutcomes)?m.ConsensusOutcomes:[]);
  const safe=o=>({outcomeType:o?.BettingOutcomeType??null,participant:o?.Participant??null,value:o?.Value??null,payoutAmerican:o?.PayoutAmerican??null,payoutDecimal:o?.PayoutDecimal??null,sportsBook:o?.SportsBook??null,teamID:o?.TeamID??null,globalTeamID:o?.GlobalTeamID??null,isAvailable:o?.IsAvailable??null});
  return {
    relevantMarketCount:relevant.length,
    relevantBetTypes:[...new Set(relevant.map(m=>m?.BettingBetType).filter(Boolean))],
    bettingOutcomeFields:[...new Set(outcomes.flatMap(o=>Object.keys(o||{})))].sort(),
    consensusOutcomeFields:[...new Set(consensus.flatMap(o=>Object.keys(o||{})))].sort(),
    samples:relevant.slice(0,30).map(m=>({betType:m?.BettingBetType||null,name:m?.Name||null,teamKey:m?.TeamKey||null,teamID:m?.TeamID||null,bettingOutcomeCount:(m?.BettingOutcomes||[]).length,consensusOutcomeCount:(m?.ConsensusOutcomes||[]).length,consensusOutcomes:(m?.ConsensusOutcomes||[]).slice(0,4).map(safe),bettingOutcomes:(m?.BettingOutcomes||[]).slice(0,4).map(safe)}))
  };
}
export async function GET(){
  if(!await isAdminAuthenticated())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
  const key=process.env.SPORTSDATAIO_API_KEY;
  if(!key)return NextResponse.json({ok:false,keyVisible:false,error:'SPORTSDATAIO_API_KEY is not visible to this deployment.'},{status:500});
  const attempts=[];
  for(const path of ['BettingFuturesBySeason/2026','BettingFuturesBySeason/2026REG']){
    const r=await call(path,key); attempts.push({path,status:r.status,ok:r.ok});
    if(r.ok&&Array.isArray(r.body))return NextResponse.json({ok:true,keyVisible:true,endpoint:path,structure:inspect(r.body),attempts,note:'Targeted projection-market inspection only.'});
  }
  return NextResponse.json({ok:false,keyVisible:true,error:'No usable 2026 futures array returned.',attempts},{status:502});
}
