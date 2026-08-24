import {NextResponse} from 'next/server';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';
import {createClient} from '@supabase/supabase-js';

const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
const URL='https://www.sportsbettingdime.com/college-football/futures/win-totals-best-odds/';
const alias={
 'appalachian state':'app state','miami fl':'miami','miami florida':'miami','miami oh':'miami (oh)',
 'southern miss':'southern mississippi','connecticut':'uconn','massachusetts':'umass',
 'louisiana monroe':'ulm','ul monroe':'ulm','florida international':'fiu','north carolina state':'nc state'
};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim();
const americanProb=a=>{a=Number(a);return a<0?(-a)/((-a)+100):100/(a+100)};
function adjusted(line,over,under){
 const po=americanProb(over),pu=americanProb(under),p=po/(po+pu);
 // Half-point markets: convert market lean into a modest +/-0.25 expected-win adjustment.
 return Math.max(0,Math.min(12,Number(line)+(p-.5)*.5));
}
function parse(html){
 const text=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&#8211;|&ndash;/g,'-').replace(/&#43;/g,'+').replace(/\s+/g,' ');
 const rows=[];
 const re=/([A-Za-z][A-Za-z .&'()-]{1,40})\s+(\d{1,2}(?:\.5)?)\s+([+-]\d{2,4})\s+([+-]\d{2,4})/g;
 let m;
 while((m=re.exec(text))){
  const team=m[1].trim().replace(/^.*?(?=[A-Z][a-z])/,'').trim();
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
  const byName=new Map(teams.map(t=>[norm(t.school),t]));
  const matched=[],unmatched=[];
  for(const x of parsed){
   let n=norm(x.team);n=alias[n]||n;
   let t=byName.get(n);
   if(!t){for(const [ln,lt] of byName){if(n.length>4&&(ln===n||ln.startsWith(n+' ')||n.startsWith(ln+' '))){t=lt;break}}}
   if(t&&!matched.some(y=>y.teamId===t.team_id))matched.push({...x,teamId:t.team_id,school:t.school});
   else if(!t)unmatched.push(x.team);
  }
  const matchedIds=new Set(matched.map(x=>x.teamId));
  const missing=teams.filter(t=>!matchedIds.has(t.team_id)).map(t=>t.school);
  return NextResponse.json({ok:true,source:URL,parsedRows:parsed.length,matchedTeams:matched.length,missingTeams:missing,unmatchedSourceNames:[...new Set(unmatched)].slice(0,40),safeToUse:matched.length>=130,samples:matched.slice(0,25)});
 }catch(e){return NextResponse.json({ok:false,error:e?.message||String(e)},{status:500})}
}
