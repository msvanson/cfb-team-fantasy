import {NextResponse} from 'next/server';
export const revalidate=604800;

function norm(s=''){return String(s).toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim()}
export async function GET(){
  try{
    const r=await fetch('https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=1000',{next:{revalidate:604800}});
    if(!r.ok)throw new Error(`ESPN teams HTTP ${r.status}`);
    const j=await r.json();
    const teams=j?.sports?.[0]?.leagues?.[0]?.teams||[];
    const logos={};
    for(const row of teams){
      const t=row?.team||row;
      const logo=t?.logos?.[0]?.href||t?.logo;
      if(!logo)continue;
      for(const name of [t.location,t.displayName,t.shortDisplayName,t.name,t.abbreviation]){
        if(name)logos[norm(name)]=logo;
      }
    }
    return NextResponse.json({ok:true,count:Object.keys(logos).length,logos},{headers:{'Cache-Control':'public, s-maxage=604800, stale-while-revalidate=86400'}});
  }catch(e){
    return NextResponse.json({ok:false,error:e?.message||String(e),logos:{}},{status:200});
  }
}
