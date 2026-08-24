import {NextResponse} from 'next/server';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';
import {createClient} from '@supabase/supabase-js';

const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
const URL='https://www.sportsbettingdime.com/college-football/futures/win-totals-best-odds/';
const alias={
 'appalachian state':'app state','app state':'appalachian state',
 'miami fl':'miami','miami florida':'miami','miami oh':'miami (oh)','miami ohio':'miami (oh)',
 'southern miss':'southern mississippi','southern mississippi':'southern miss',
 'connecticut':'uconn','uconn':'connecticut','massachusetts':'umass','umass':'massachusetts',
 'louisiana monroe':'ulm','ul monroe':'ulm','florida international':'fiu',
 'north carolina state':'nc state','nc state':'north carolina state',
 'texas aandm':'texas a m','texas am':'texas a m','air force academy':'air force',
 'north dakota st':'north dakota state','ndsu':'north dakota state','state':'nc state','conn':'uconn','mass':'umass'
};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim();
const americanProb=a=>{a=Number(a);return a<0?(-a)/((-a)+100):100/(a+100)};
function adjusted(line,over,under){
 const po=americanProb(over),pu=americanProb(under),p=po/(po+pu);
 // Half-point markets: convert market lean into a modest +/-0.25 expected-win adjustment.
 return Math.max(0,Math.min(12,Number(line)+(p-.5)*.5));
}
function clean(v){
 return String(v||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')
  .replace(/&#8211;|&ndash;/g,'-').replace(/&#43;/g,'+').replace(/&#39;|&apos;/g,"'")
  .replace(/\s+/g,' ').trim();
}
function parse(html){
 const rows=[];
 const trRe=/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
 let tr;
 while((tr=trRe.exec(html))){
   const cells=[];
   const tdRe=/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
   let td;
   while((td=tdRe.exec(tr[1])))cells.push(clean(td[1]));
   if(cells.length<4)continue;
   const joined=cells.join(' | ');
   if(/win total/i.test(joined)&&/over/i.test(joined)&&/under/i.test(joined))continue;
   let team=cells[0], line=null, over=null, under=null;
   for(let i=1;i<cells.length;i++){
     const c=cells[i];
     if(line===null&&/^\d{1,2}(?:\.5)?$/.test(c))line=Number(c);
     else if(line!==null&&over===null&&/^[+-]\d{2,4}$/.test(c))over=Number(c);
     else if(line!==null&&over!==null&&under===null&&/^[+-]\d{2,4}$/.test(c)){under=Number(c);break}
   }
   if(team&&line!==null&&over!==null&&under!==null&&line>=0&&line<=12)
     rows.push({team,line,over,under,adjustedWins:adjusted(line,over,under)});
 }
 if(rows.length>=100)return rows;

 const text=clean(html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' '));
 const re=/([A-Za-z][A-Za-z .&'()-]{1,40}?)\s+(\d{1,2}(?:\.5)?)\s+([+-]\d{2,4})\s+([+-]\d{2,4})/g;
 let m;
 while((m=re.exec(text))){
   const team=m[1].trim().replace(/^(?:Win Total Over Odds Under Odds)\s*/i,'').trim();
   const line=Number(m[2]),over=Number(m[3]),under=Number(m[4]);
   if(line>=0&&line<=12)rows.push({team,line,over,under,adjustedWins:adjusted(line,over,under)});
 }
 return rows;
}
export async function GET(){
 if(!await isAdminAuthenticated())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
 try{
  const r=await fetch(URL,{headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html'},cache:'no-store'});
  if(!r.ok)throw new Error(`Win totals source returned ${r.status}`);
  const html=await r.text(),parsed=parse(html);
  const {data:teams,error}=await supabase.from('team_directory').select('team_id,school').eq('season_id',1);
  if(error)throw error;
  const namesForTeam=t=>{
    const base=norm(t.school), out=new Set([base]);
    if(alias[base])out.add(alias[base]);
    for(const [a,b] of Object.entries(alias))if(b===base)out.add(a);
    return [...out];
  };
  const teamNames=teams.map(t=>({t,names:namesForTeam(t)}));
  const matched=[],unmatched=[];
  for(const x of parsed){
   const raw=norm(x.team);
   const candidates=new Set([raw,alias[raw]].filter(Boolean));
   let t=null;
   for(const row of teamNames){
     if(row.names.some(n=>candidates.has(n))){t=row.t;break}
   }
   if(!t){
     for(const row of teamNames){
       if(row.names.some(n=>raw.length>4&&(n.startsWith(raw+' ')||raw.startsWith(n+' ')))){t=row.t;break}
     }
   }
   if(t&&!matched.some(y=>y.teamId===t.team_id))matched.push({...x,teamId:t.team_id,school:t.school});
   else if(!t)unmatched.push(x.team);
  }
  const matchedIds=new Set(matched.map(x=>x.teamId));
  const missing=teams.filter(t=>!matchedIds.has(t.team_id)).map(t=>t.school);
  return NextResponse.json({ok:true,source:URL,parsedRows:parsed.length,matchedTeams:matched.length,missingTeams:missing,unmatchedSourceNames:[...new Set(unmatched)].slice(0,40),safeToUse:matched.length>=130,samples:matched.slice(0,25)});
 }catch(e){return NextResponse.json({ok:false,error:e?.message||String(e)},{status:500})}
}
