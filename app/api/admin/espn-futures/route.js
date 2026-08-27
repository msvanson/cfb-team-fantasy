import {NextResponse} from 'next/server';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';

const H={'User-Agent':'Mozilla/5.0','Accept':'application/json','Origin':'https://www.espn.com','Referer':'https://www.espn.com/'};
async function j(url){const r=await fetch(url,{headers:H,cache:'no-store'});if(!r.ok)throw new Error(`ESPN ${r.status}: ${url}`);return r.json()}
function refId(ref,kind){const m=String(ref||'').match(new RegExp(`/${kind}/([^/?]+)`));return m?.[1]||null}
function safeBook(b){
 const tr=b?.team?.$ref||b?.team?.ref||null, ar=b?.athlete?.$ref||b?.athlete?.ref||null;
 return {teamId:refId(tr,'teams'),athleteId:refId(ar,'athletes'),odds:b?.odds?.value??b?.odds??b?.value??null,teamRef:tr,athleteRef:ar,label:b?.displayName??b?.name??null};
}
export async function GET(){
 if(!await isAdminAuthenticated())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
 try{
  const base='https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/2026/futures';
  const idx=await j(`${base}?limit=200&lang=en&region=us`);
  const markets=[];
  for(const item of (idx.items||[]).slice(0,200)){
   const ref=item?.$ref||`${base}/${item?.id}`;
   const m=await j(ref);
   // ESPN futures are market -> futures[] -> provider + books[] (not market.providers).
   const futures=Array.isArray(m?.futures)?m.futures:[];
   const providers=futures.map(f=>({
     id:f?.provider?.id??null,
     name:f?.provider?.name??null,
     active:f?.provider?.active??null,
     bookCount:Array.isArray(f?.books)?f.books.length:0,
     books:(f?.books||[]).slice(0,12).map(safeBook)
   }));
   markets.push({
     id:m?.id||item?.id||refId(ref,'futures'),
     name:m?.name||null,
     type:m?.type||null,
     display:m?.displayName||m?.shortName||m?.name||null,
     futuresCount:futures.length,
     providerCount:providers.length,
     totalBooks:providers.reduce((n,p)=>n+p.bookCount,0),
     providers:providers.slice(0,8),
     topLevelFields:Object.keys(m||{}).sort()
   });
  }
  const labels=markets.map(x=>x.display||x.name).filter(Boolean);
  const targets=markets.filter(x=>/champ|conference|playoff|total wins|win total|wins/i.test(String(x.display||x.name||'')));
  return NextResponse.json({
    ok:true,season:2026,marketCount:markets.length,
    marketsWithBooks:markets.filter(x=>x.totalBooks>0).length,
    totalBookEntries:markets.reduce((n,x)=>n+x.totalBooks,0),
    targetLikeMarkets:targets.map(x=>`${x.display||x.name} (${x.totalBooks} entries)`),
    marketLabels:labels,
    markets
  });
 } catch {
  return NextResponse.json(
    {
      ok: false,
      error: 'ESPN futures data temporarily unavailable'
    },
    { status: 500 }
  );
}
}
