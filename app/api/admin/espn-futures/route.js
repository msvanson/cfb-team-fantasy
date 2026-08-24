import {NextResponse} from 'next/server';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';

const HEADERS={
  'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36',
  'Accept':'application/json, text/plain, */*',
  'Origin':'https://www.espn.com',
  'Referer':'https://www.espn.com/'
};
async function j(url){
  const r=await fetch(url,{headers:HEADERS,cache:'no-store'});
  if(!r.ok)throw new Error(`ESPN ${r.status}`);
  return r.json();
}
function idFromRef(ref,kind){
  const m=String(ref||'').match(new RegExp(`/${kind}/([^/?]+)`));
  return m?.[1]||null;
}
export async function GET(){
  if(!await isAdminAuthenticated())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
  try{
    const url='https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/2026/futures?limit=200&lang=en&region=us';
    const index=await j(url);
    const refs=(index.items||[]).map(x=>x?.$ref).filter(Boolean);
    const markets=[];
    for(const ref of refs.slice(0,200)){
      const m=await j(ref);
      const providers=[];
      const pItems=m?.providers?.items||m?.providers||[];
      for(const pr of pItems){
        const pobj=pr?.$ref?await j(pr.$ref):pr;
        const entries=pobj?.entries||pobj?.books||pobj?.items||[];
        const flat=[];
        for(const e of entries){
          const x=e?.$ref?await j(e.$ref):e;
          flat.push({
            teamId:idFromRef(x?.team?.$ref||x?.team?.ref||x?.teamRef,'teams'),
            athleteId:idFromRef(x?.athlete?.$ref||x?.athlete?.ref||x?.athleteRef,'athletes'),
            odds:x?.odds?.value??x?.odds??x?.value??null,
            label:x?.displayName??x?.name??x?.label??null
          });
        }
        providers.push({
          name:pobj?.provider?.name||pobj?.name||pobj?.providerName||null,
          entryCount:flat.length,
          samples:flat.slice(0,8)
        });
      }
      markets.push({
        id:m?.id||idFromRef(ref,'futures'),
        name:m?.name||null,
        type:m?.type||m?.marketType||null,
        display:m?.displayName||m?.shortName||m?.name||null,
        providerCount:providers.length,
        providers:providers.slice(0,5)
      });
    }
    const labels=markets.map(x=>x.display||x.name).filter(Boolean);
    const key=labels.filter(x=>/champ|conference|playoff|total wins|win total|wins/i.test(x));
    return NextResponse.json({ok:true,season:2026,marketCount:markets.length,marketLabels:labels,targetLikeMarkets:key,markets});
  }catch(e){
    return NextResponse.json({ok:false,error:e?.message||String(e)},{status:500});
  }
}
