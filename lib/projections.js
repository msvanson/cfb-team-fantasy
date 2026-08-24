import {createClient} from '@supabase/supabase-js';
const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
const ODDS='https://api.sportsdata.io/v3/cfb/odds/json';
const SCORES='https://api.sportsdata.io/v3/cfb/scores/json';
const alias={"app state":"appalachian state","hawaii":"hawaii","san jose state":"san jose state","ul monroe":"ulm","louisiana monroe":"ulm","louisiana at monroe":"ulm","connecticut":"uconn","massachusetts":"umass","north carolina state":"nc state","florida international":"fiu","miami ohio":"miami (oh)","miami (ohio)":"miami (oh)","nc state":"nc state"};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim();
const median=a=>{const x=a.filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return null;const m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2};
const implied=a=>{a=Number(a);if(!Number.isFinite(a)||a===0)return null;return a<0?(-a)/((-a)+100):100/(a+100)};
async function getJson(url,key){const r=await fetch(url,{headers:{'Ocp-Apim-Subscription-Key':key},cache:'no-store'});if(!r.ok)throw new Error(`SportsDataIO ${r.status} for ${url.split('/').pop()}`);return r.json()}
function sportsbookName(o){return o?.SportsBook?.Name||o?.Sportsbook?.Name||o?.SportsbookName||''}
function bySportsbook(outcomes){const m=new Map();for(const o of outcomes||[]){if(o?.IsAvailable===false)continue;const k=String(o?.SportsBook?.SportsbookID||o?.Sportsbook?.SportsbookID||sportsbookName(o)||'book');if(!m.has(k))m.set(k,[]);m.get(k).push(o)}return [...m.values()]}
function normalizeSlots(map,slots){const vals=[...map.entries()].filter(([,v])=>Number.isFinite(v)&&v>=0);const total=vals.reduce((a,[,v])=>a+v,0);if(!total)return new Map();const scale=slots/total;return new Map(vals.map(([k,v])=>[k,Math.min(1,v*scale)]))}
function marketProbabilities(markets,slots){const samples=new Map();for(const m of markets||[]){const tied=Number(m?.TeamID)||null;for(const group of bySportsbook(m?.BettingOutcomes)){if(tied){const yes=group.find(o=>/^(yes|over)$/i.test(String(o?.BettingOutcomeType||'')));const no=group.find(o=>/^(no|under)$/i.test(String(o?.BettingOutcomeType||'')));let p=null;if(yes&&no){const py=implied(yes.PayoutAmerican),pn=implied(no.PayoutAmerican);if(py!=null&&pn!=null&&py+pn>0)p=py/(py+pn)}else{const o=yes||group[0];p=implied(o?.PayoutAmerican)}if(p!=null){if(!samples.has(tied))samples.set(tied,[]);samples.get(tied).push(p)}}else{const raw=[];for(const o of group){const id=Number(o?.TeamID);const p=implied(o?.PayoutAmerican);if(id&&p!=null)raw.push([id,p])}const sum=raw.reduce((a,[,p])=>a+p,0);if(sum>0)for(const [id,p] of raw){if(!samples.has(id))samples.set(id,[]);samples.get(id).push(Math.min(1,p*(slots/sum)))}}}}
 const avg=new Map([...samples].map(([id,arr])=>[id,arr.reduce((a,b)=>a+b,0)/arr.length]));return normalizeSlots(avg,slots)}
function winTotals(markets){const out=new Map();for(const m of markets||[]){const id=Number(m?.TeamID);if(!id)continue;const lines=[];for(const o of m?.BettingOutcomes||[]){const part=String(o?.Participant||'').replace(',','.');const mm=part.match(/(?:over|under)\s*(\d+(?:\.\d+)?)/i);if(mm)lines.push(Number(mm[1]))}const v=median(lines);if(v!=null)out.set(id,v)}return out}
const confs=[['ACC','ACC Winner','To Reach ACC Final'],['AAC','American Conference Winner','To Reach The American Conference Final'],['B12','Big 12 Winner','To Reach Big 12 Conference Final'],['B10','Big 10 Winner','To Reach Big 10 Conference Final'],['CUSA','C-USA Winner','To Reach C-USA Final'],['MAC','MAC Winner','To Reach MAC Conference Final'],['MW','MWC Winner','To Reach Mountain West Conference Final'],['SEC','SEC Winner','To Reach SEC Conference Final'],['SBC','Sun Belt Winner',null],['PAC12','PAC-12 Winner','To Reach Pac-12 Conference Final']];
export async function runProjectionImport(){const key=process.env.SPORTSDATAIO_API_KEY;if(!key)throw new Error('SPORTSDATAIO_API_KEY is missing');const admin=process.env.CFB_ADMIN_SECRET;if(!admin)throw new Error('CFB_ADMIN_SECRET is missing');const [events,sdTeams,{data:league,error:le},{data:memberships,error:me}]=await Promise.all([
  getJson(`${ODDS}/BettingFuturesBySeason/2026`,key),
  getJson(`${SCORES}/Teams`,key),
  supabase.from('team_directory').select('*').eq('season_id',1),
  supabase.from('team_memberships').select('team_id,official_conference').eq('season_id',1)
]);
if(le)throw le;
if(me)throw me;
const officialConferenceByTeam=new Map((memberships||[]).map(x=>[x.team_id,x.official_conference]));
 const markets=(events||[]).flatMap(e=>e?.BettingMarkets||[]);const quality=markets.some(m=>(m.BettingOutcomes||[]).some(o=>/scrambled/i.test(sportsbookName(o))))?'trial_scrambled':'production';
 const leagueByNorm=new Map(league.map(t=>[norm(t.school),t]));
 const candidateByInternal=new Map();
 const unmapped=[];
 for(const st of sdTeams||[]){
   if(st?.Active===false) continue;
   let raw=norm(st?.School);
   let n=alias[raw]||raw;
   let t=leagueByNorm.get(n);
   let score=0;
   if(t){
     score = raw===norm(t.school) ? 3 : 2;
   }else{
     for(const [ln,lt] of leagueByNorm){
       if(n.length>4&&(ln===n||ln.startsWith(n+' ')||n.startsWith(ln+' '))){
         t=lt;
         score=1;
         break;
       }
     }
   }
   if(!t){
     unmapped.push(st?.School);
     continue;
   }
   const current=candidateByInternal.get(t.team_id);
   const candidate={sportsDataTeamId:Number(st.TeamID),team:t,score};
   if(!current || candidate.score>current.score){
     candidateByInternal.set(t.team_id,candidate);
   }
 }
 const sdToInternal=new Map(
   [...candidateByInternal.values()].map(x=>[x.sportsDataTeamId,x.team])
 );
 const grouped=type=>markets.filter(m=>String(m?.BettingBetType||'')===type);const wins=winTotals(grouped('Total Wins'));
 const make=marketProbabilities(grouped('To Make the Playoffs'),12),qf=marketProbabilities(grouped('To Make the College Football Playoff Quarterfinals'),8),sf=marketProbabilities(grouped('To Make the College Football Playoff Semifinals'),4),ncg=marketProbabilities(grouped('To Make the National Championship Game'),2),champ=marketProbabilities(grouped('National Championship Winner'),1);
 const confPoints=new Map();
 for(const [code,winnerType,reachType] of confs){
   const rawWin=marketProbabilities(grouped(winnerType),1);
   const rawReach=reachType?marketProbabilities(grouped(reachType),2):new Map();

   const members=[...sdToInternal].filter(([,t])=>
     t.conference_code===code &&
     String(officialConferenceByTeam.get(t.team_id)||'').toLowerCase()!=='independent'
   );

   // Renormalize only across teams actually eligible for this conference title.
   const winRawTotal=members.reduce((sum,[sdid])=>sum+(rawWin.get(sdid)||0),0);
   const reachRawTotal=members.reduce((sum,[sdid])=>sum+(rawReach.get(sdid)||0),0);

   const winLocal=new Map(
     members.map(([sdid])=>[
       sdid,
       winRawTotal>0 ? (rawWin.get(sdid)||0)/winRawTotal : 0
     ])
   );

   const useReach=Boolean(reachType)&&reachRawTotal>0;
   const reachLocal=new Map(
     members.map(([sdid])=>[
       sdid,
       useReach ? 2*(rawReach.get(sdid)||0)/reachRawTotal : 0
     ])
   );

   for(const [sdid] of members){
     const wp=winLocal.get(sdid)||0;
     const rp=reachLocal.get(sdid)||0;
     confPoints.set(sdid,useReach ? (rp+4*wp) : (6*wp));
   }
 }
 const weights=new Map();let weightTotal=0;for(const sdid of sdToInternal.keys()){const w=(qf.get(sdid)||0)+(sf.get(sdid)||0)+(ncg.get(sdid)||0)+(champ.get(sdid)||0);weights.set(sdid,w);weightTotal+=w}
 const payload=[];let totalCount=0,winCount=0;for(const [sdid,t] of sdToInternal){totalCount++;const pw=wins.get(sdid);if(pw!=null)winCount++;const projectedWins=pw??Number(t.wins||0);const pMake=make.get(sdid)||0;let bowl=projectedWins>=6?1:projectedWins>=5?.5:projectedWins>=4?.1:0;bowl*=Math.max(0,1-pMake);const cp=confPoints.get(sdid)||0;const app=2*pMake;const cfpWins=weightTotal>0?11*(weights.get(sdid)||0)/weightTotal:0;const ncgPts=ncg.get(sdid)||0;const champPts=champ.get(sdid)||0;let projected=projectedWins+bowl+cp+app+cfpWins+ncgPts+champPts;projected=Math.max(projected,Number(t.fantasy_points||0));payload.push({teamId:t.team_id,projectedWins,bowlPoints:bowl,conferencePoints:cp,cfpAppearancePoints:app,cfpWinPoints:cfpWins,ncgAppearancePoints:ncgPts,nationalTitlePoints:champPts,projectedPoints:projected,components:{sportsDataTeamId:sdid,officialConference:officialConferenceByTeam.get(t.team_id)||null,makeCfp:pMake,qf:qf.get(sdid)||0,sf:sf.get(sdid)||0,makeNcg:ncg.get(sdid)||0,champion:champ.get(sdid)||0,currentFantasy:Number(t.fantasy_points||0)}})}
 const dedupedPayload=[...new Map(payload.map(x=>[x.teamId,x])).values()];
 const publishable=quality==='production'&&dedupedPayload.length>=130&&winCount>=120;
 const {data:runId,error}=await supabase.rpc('admin_store_projection_run',{
   p_secret:admin,
   p_quality:quality,
   p_publishable:publishable,
   p_model_version:'v1',
   p_notes:`mapped=${dedupedPayload.length}; winTotals=${winCount}; unmapped=${unmapped.slice(0,20).join(', ')}`,
   p_payload:dedupedPayload
 });
 if(error)throw error;
 return {ok:true,runId,quality,publishable,mappedTeams:dedupedPayload.length,winTotalTeams:winCount,unmapped:unmapped.slice(0,30),teamCount:dedupedPayload.length}}
