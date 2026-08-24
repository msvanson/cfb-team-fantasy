import {createClient} from '@supabase/supabase-js';

const supabase=createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  {auth:{persistSession:false}}
);

const ESPN='https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/2026/futures?limit=200&lang=en&region=us';
const SBD='https://www.sportsbettingdime.com/college-football/futures/win-totals-best-odds/';
const H={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36','Accept':'application/json, text/plain, */*','Origin':'https://www.espn.com','Referer':'https://www.espn.com/'};
const confMarket={
 ACC:'Atlantic Coast Conference Champion',AAC:'American Athletic Conference Champion',
 B12:'Big 12 Conference Champion',B10:'Big Ten Conference Champion',
 CUSA:'Conference USA Conference Champion',MAC:'Mid-American Conference Champion',
 MW:'Mountain West Conference Champion',SEC:'Southeastern Conference Champion',
 SBC:'NCAA(F) - Sun Belt Conference'
};
const alias={
 'app state':'appalachian state','appalachian state':'app state','miami ohio':'miami (oh)','miami oh':'miami (oh)',
 'southern miss':'southern mississippi','connecticut':'uconn','massachusetts':'umass',
 'louisiana monroe':'ulm','ul monroe':'ulm','florida international':'fiu','north carolina state':'nc state','hawai i rainbow warriors':'hawaii','hawai i':'hawaii'
};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim();
const prob=a=>{a=Number(String(a).replace('+',''));return a<0?(-a)/((-a)+100):100/(a+100)};
const adjusted=(line,o,u)=>{const po=prob(o),pu=prob(u),p=po/(po+pu);return Math.max(0,Math.min(12,Number(line)+(p-.5)*.5))};
async function json(url){const r=await fetch(url,{headers:H,cache:'no-store'});if(!r.ok)throw new Error(`ESPN ${r.status}`);return r.json()}
function clean(v){return String(v||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#8211;|&ndash;/g,'-').replace(/&#43;/g,'+').replace(/\s+/g,' ').trim()}
function parseWinTotals(html){
 const rows=[];const trRe=/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;let tr;
 while((tr=trRe.exec(html))){const c=[];const td=/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;let x;while((x=td.exec(tr[1])))c.push(clean(x[1]));
  if(c.length<4||(/win total/i.test(c.join(' '))&&/over/i.test(c.join(' '))))continue;
  let team=c[0],line=null,o=null,u=null;
  for(let i=1;i<c.length;i++){if(line===null&&/^\d{1,2}(?:\.5)?$/.test(c[i]))line=Number(c[i]);else if(line!==null&&o===null&&/^[+-]\d{2,4}$/.test(c[i]))o=Number(c[i]);else if(o!==null&&u===null&&/^[+-]\d{2,4}$/.test(c[i])){u=Number(c[i]);break}}
  if(team&&line!==null&&o!==null&&u!==null)rows.push({team,line,over:o,under:u,wins:adjusted(line,o,u)});
 }
 return rows;
}
function normalizeMap(raw,target){
 const entries=[...raw.entries()].filter(([id])=>target.has(String(id)));const total=entries.reduce((s,[,p])=>s+p,0);
 return new Map(entries.map(([id,p])=>[String(id),total?p/total:0]));
}
function marketMap(markets,label){
 const m=markets.find(x=>(x.displayName||x.name)===label);const out=new Map();
 for(const f of (m?.futures||[])){for(const b of (f?.books||[])){const id=String(b?.team?.$ref||'').match(/\/teams\/([^/?]+)/)?.[1];if(id&&b.odds?.value!=null)out.set(id,prob(b.odds.value));else if(id&&b.odds!=null)out.set(id,prob(b.odds))}
 }
 return out;
}
export async function refreshSeasonProjections(){
 const [{data:teams,error:te},{data:members,error:me}]=await Promise.all([
  supabase.from('team_directory').select('*').eq('season_id',1),
  supabase.from('team_memberships').select('team_id,official_conference').eq('season_id',1)
 ]);
 if(te)throw te;if(me)throw me;
 const official=new Map((members||[]).map(x=>[x.team_id,x.official_conference]));
 const er=await fetch(ESPN,{headers:H,cache:'no-store'});if(!er.ok)throw new Error(`ESPN ${er.status}`);const idx=await er.json();
 const markets=[];for(const it of (idx.items||[])){markets.push(await json(it.$ref))}
 const sr=await fetch(SBD,{headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html'},cache:'no-store'});if(!sr.ok)throw new Error(`Win totals source ${sr.status}`);
 const winRows=parseWinTotals(await sr.text());

 // Build the ESPN FBS universe directly from the National Championship market.
 // That market contains exactly the 138 FBS teams we care about and avoids ESPN's broader team directory.
 const titleMarket=markets.find(m=>(m.displayName||m.name)==='National Championship Winner');
 const titleBooks=(titleMarket?.futures||[]).flatMap(f=>f?.books||[]);
 const titleIds=[...new Set(titleBooks.map(b=>String(b?.team?.$ref||'').match(/\/teams\/([^/?]+)/)?.[1]).filter(Boolean))];
 if(titleIds.length!==138)throw new Error(`ESPN title-market universe unexpected: ${titleIds.length}/138`);

 const espn=[];
 for(const id of titleIds){
   const t=await json(`https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/2026/teams/${id}?lang=en&region=us`);
   espn.push({id:String(t.id),name:t.displayName||t.shortDisplayName||t.name||''});
 }

 const byLeague=new Map(teams.map(t=>[norm(t.school),t]));
 function matchLeague(name){
   let n=norm(name);

   // Miami must be disambiguated before generic matching because the league
   // contains both Miami (FL) and Miami (OH).
   if(n==='miami hurricanes'){
     return teams.find(t=>norm(t.school)==='miami fl')||null;
   }
   if(n==='miami redhawks'||n==='miami ohio'){
     return teams.find(t=>norm(t.school)==='miami oh')||null;
   }

   const opts=[n,alias[n]].filter(Boolean);
   for(const q of opts){if(byLeague.has(q))return byLeague.get(q)}
   // Remove common ESPN mascot suffixes by progressively trimming words.
   const parts=n.split(' ');
   for(let cut=parts.length-1;cut>=1;cut--){
     const q=parts.slice(0,cut).join(' ');
     const a=alias[q]||q;
     if(byLeague.has(a))return byLeague.get(a);
   }
   for(const [ln,t] of byLeague){
     if(n.length>4&&(ln.startsWith(n+' ')||n.startsWith(ln+' ')))return t;
   }
   return null;
 }

 const espnToLeague=new Map();
 const usedLeagueTeamIds=new Set();
 const espnUnmapped=[];
 for(const e of espn){
   const t=matchLeague(e.name);
   if(t&&!usedLeagueTeamIds.has(t.team_id)){
     espnToLeague.set(e.id,t);
     usedLeagueTeamIds.add(t.team_id);
   }else if(!t){
     espnUnmapped.push(e.name);
   }else{
     espnUnmapped.push(`${e.name} (duplicate mapping to ${t.school})`);
   }
 }

 const winByTeam=new Map();
 for(const w of winRows){
   const t=matchLeague(w.team);
   if(t)winByTeam.set(t.team_id,w);
 }

 // NDSU is the one FBS team currently absent from the public win-total board.
 // Use the Vercel NDSU_WIN_TOTAL baseline (currently 9) until the source lists it.
 const ndsu=teams.find(t=>norm(t.school)==='north dakota state');
 if(ndsu&&!winByTeam.has(ndsu.team_id)){
   const manual=Number(process.env.NDSU_WIN_TOTAL);
   if(!Number.isFinite(manual)){
     throw new Error('North Dakota State is missing from the public win-total board and NDSU_WIN_TOTAL is not configured.');
   }
   winByTeam.set(ndsu.team_id,{
     team:ndsu.school,
     line:manual,
     over:-110,
     under:-110,
     wins:manual,
     source:'manual_ndsu'
   });
 }

 if(espnToLeague.size!==138){
   throw new Error(`ESPN title-market mapping incomplete: ${espnToLeague.size}/138; unmatched: ${espnUnmapped.join(', ')}`);
 }
 const champRaw=marketMap(markets,'National Championship Winner');
 const sfRaw=marketMap(markets,'NCAA(F) - Playoff - To reach the Semifinals');
 const ncgRaw=marketMap(markets,'NCAA(F) - Playoff - To reach the Championship Game');
 const fbsIds=new Set([...espnToLeague.keys()]);
 const champ=normalizeMap(champRaw,fbsIds), sf=normalizeMap(sfRaw,fbsIds), ncg=normalizeMap(ncgRaw,fbsIds);

 const confPoints=new Map();
 for(const [code,label] of Object.entries(confMarket)){
   const eligible=new Set([...espnToLeague].filter(([,t])=>t.conference_code===code&&String(official.get(t.team_id)||'').toLowerCase()!=='independent').map(([id])=>id));
   const cm=normalizeMap(marketMap(markets,label),eligible);
   for(const [id,p] of cm)confPoints.set(id,6*p);
 }
 // Pac-12 market is absent from ESPN: use national-title relative odds among real Pac-12 teams as a transparent fallback.
 const pacIds=new Set([...espnToLeague].filter(([,t])=>t.conference_code==='PAC12'&&String(official.get(t.team_id)||'').toLowerCase()!=='independent').map(([id])=>id));
 const pac=normalizeMap(champRaw,pacIds);for(const [id,p] of pac)confPoints.set(id,6*p);

 // CFP pool: ESPN directly gives semifinal (4 teams) and title-game (2 teams).
 // 24 appearance points are approximated from normalized semifinal odds, while 11 game-win points use semifinal/title/champion progression.
 const sf12=new Map([...sf.entries()].map(([id,p])=>[id,p*3])); // 4 -> 12 expected entrants
 const payload=[];
 for(const [eid,t] of espnToLeague){
   const w=winByTeam.get(t.team_id);if(!w)continue;
   const baseWins=w.wins;
   const bowl=baseWins>6?1:baseWins>=5?.5:baseWins>=4?.1:0;
   const conf=confPoints.get(eid)||0;
   const make=(sf12.get(eid)||0);
   const cfpAppear=2*make;
   const sfp=sf.get(eid)||0,ncp=ncg.get(eid)||0,chp=champ.get(eid)||0;
   const cfpWins=7*sfp+3*ncp+1*chp; // totals 11 after normalization
   const ncgPts=2*ncp,titlePts=chp;
   const projected=Math.max(Number(t.fantasy_points||0),baseWins+bowl+conf+cfpAppear+cfpWins+ncgPts+titlePts);
   payload.push({team_id:t.team_id,projected_points:projected,win_total:baseWins,conference_points:conf,cfp_appearance_points:cfpAppear,cfp_win_points:cfpWins,ncg_appearance_points:ncgPts,national_title_points:titlePts,components:{source:'espn_sbd_real',winLine:w.line,over:w.over,under:w.under,espnTeamId:eid,currentFantasy:Number(t.fantasy_points||0),officialConference:official.get(t.team_id)||null}});
 }
 if(payload.length!==138)throw new Error(`Projection payload incomplete: ${payload.length}/138`);
 const {data:run,error:re}=await supabase.from('projection_runs').insert({
   season_id:1,
   source:'espn_sbd_real',
   data_quality:'real',
   publishable:true,
   model_version:'v2',
   team_count:138,
   notes:'ESPN DraftKings futures + SportsBettingDime win totals; NDSU manual fallback when public total unavailable'
 }).select('id').single();
 if(re)throw re;

 const rows=payload.map(x=>({
   run_id:run.id,
   season_id:1,
   team_id:x.team_id,
   projected_wins:x.win_total,
   bowl_points:(x.components?.winLine>6?1:x.components?.winLine>=5?.5:x.components?.winLine>=4?.1:0),
   conference_points:x.conference_points,
   cfp_appearance_points:x.cfp_appearance_points,
   cfp_win_points:x.cfp_win_points,
   ncg_appearance_points:x.ncg_appearance_points,
   national_title_points:x.national_title_points,
   projected_points:x.projected_points,
   components:x.components
 }));
 const {error:ie}=await supabase.from('team_projection_snapshots').insert(rows);if(ie)throw ie;
 return {mode:'LIVE',source:'espn_sbd_real',mapped:138,winTotals:138,runId:run.id,unmapped:[]};
}


// Backward-compatible export used by the existing admin and cron routes.
export async function runProjectionImport(){
  return refreshSeasonProjections();
}
