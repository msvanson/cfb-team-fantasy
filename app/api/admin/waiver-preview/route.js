import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';

const sb=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

function legalDrops(roster,target){
 const counts=new Map();
 for(const t of roster)counts.set(t.conference_code,(counts.get(t.conference_code)||0)+1);
 const doubled=new Set([...counts].filter(([,n])=>n>1).map(([c])=>c));
 return roster.filter(t=>t.conference_code===target.conference_code||doubled.has(t.conference_code));
}
function period(){
 const weeks=[['W1','2026-09-07T23:59:00-04:00'],['W2','2026-09-13T23:59:00-04:00'],['W3','2026-09-20T23:59:00-04:00'],['W4','2026-09-27T23:59:00-04:00'],['W5','2026-10-04T23:59:00-04:00'],['W6','2026-10-11T23:59:00-04:00'],['W7','2026-10-18T23:59:00-04:00'],['W8','2026-10-25T23:59:00-04:00'],['W9','2026-11-01T23:59:00-05:00'],['W10','2026-11-08T23:59:00-05:00'],['W11','2026-11-15T23:59:00-05:00'],['W12','2026-11-22T23:59:00-05:00'],['W13','2026-11-29T23:59:00-05:00']];
 return weeks.find(x=>new Date(x[1]).getTime()>Date.now())?.[0]||'CLOSED';
}
export async function GET(){
 if(!await isAdminAuthenticated())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
 const s=sb(),key=period();if(key==='CLOSED')return NextResponse.json({ok:true,period:key,steps:[],message:'Waivers are closed.'});
 const [{data:claims,error:ce},{data:teams,error:te},{data:owners,error:oe},{data:standings,error:se}]=await Promise.all([
  s.from('waiver_claims').select('*').eq('season_id',1).eq('waiver_period_key',key).eq('status','pending').order('priority'),
  s.from('team_directory').select('*').eq('season_id',1),
  s.from('owners').select('id,name,draft_slot').eq('season_id',1),
  s.from('owner_standings_with_movement').select('*').eq('season_id',1)
 ]);
 if(ce||te||oe||se)return NextResponse.json({ok:false,error:(ce||te||oe||se).message},{status:500});
 const teamMap=new Map((teams||[]).map(t=>[Number(t.team_id),t]));
 const ownerMap=new Map((owners||[]).map(o=>[Number(o.id),o]));
 // Waiver priority is the exact reverse of the official current standings.
 // We reproduce the league's official season standings rules here, then reverse the result:
 // fantasy points DESC -> season point differential DESC -> higher draft order (lower draft_slot) DESC.
 // This frozen reversed order is used for every round of the waiver run.
 const officialStandings=[...(standings||[])].sort((a,b)=>
   Number(b.fantasy_points||0)-Number(a.fantasy_points||0)
   || Number(b.point_differential||0)-Number(a.point_differential||0)
   || Number(a.draft_slot||999)-Number(b.draft_slot||999)
 );
 const order=[...officialStandings].reverse();
 const orderIndex=new Map(order.map((o,i)=>[Number(o.owner_id),i+1]));
 const rosters=new Map();
 for(const o of owners||[])rosters.set(Number(o.id),(teams||[]).filter(t=>Number(t.owner_id)===Number(o.id)).map(t=>({...t})));
 const queues=new Map();
 for(const o of order)queues.set(Number(o.owner_id),(claims||[]).filter(c=>Number(c.owner_id)===Number(o.owner_id)).sort((a,b)=>a.priority-b.priority).map(c=>({...c})));
 const claimed=new Set(),steps=[];let round=1,progress=true;
 while(progress){
  progress=false;
  for(const o of order){
   const oid=Number(o.owner_id),q=queues.get(oid)||[];
   while(q.length){
    const c=q.shift(),addId=Number(c.add_team_id),dropId=Number(c.drop_team_id),target=teamMap.get(addId),drop=teamMap.get(dropId);
    if(claimed.has(addId)){steps.push({round,waiver_order:orderIndex.get(oid),owner:o.owner_name,claim_priority:c.priority,status:'lost_to_priority',add:target?.school||`Team ${addId}`,drop:drop?.school||`Team ${dropId}`,reason:'Target already won by a higher-priority claim'});continue}
    const roster=rosters.get(oid)||[],currentDrop=roster.find(t=>Number(t.team_id)===dropId);
    if(!target||target.is_owned){steps.push({round,waiver_order:orderIndex.get(oid),owner:o.owner_name,claim_priority:c.priority,status:'invalid',add:target?.school||`Team ${addId}`,drop:drop?.school||`Team ${dropId}`,reason:'Target is no longer available'});continue}
    if(Number(target.wins||0)>=5){steps.push({round,waiver_order:orderIndex.get(oid),owner:o.owner_name,claim_priority:c.priority,status:'invalid',add:target.school,drop:drop?.school||`Team ${dropId}`,reason:'Target has 5 or more wins'});continue}
    if(!currentDrop||!legalDrops(roster,target).some(t=>Number(t.team_id)===dropId)){steps.push({round,waiver_order:orderIndex.get(oid),owner:o.owner_name,claim_priority:c.priority,status:'invalid',add:target.school,drop:drop?.school||`Team ${dropId}`,reason:'Add/drop is no longer roster-legal'});continue}
    // This owner gets one success this round; mutate only our in-memory roster.
    claimed.add(addId);progress=true;
    const idx=roster.findIndex(t=>Number(t.team_id)===dropId);
    roster[idx]={...target,owner_id:oid,owner_name:o.owner_name,roster_slot:currentDrop.roster_slot,is_owned:true};
    steps.push({round,waiver_order:orderIndex.get(oid),owner:o.owner_name,claim_priority:c.priority,status:'would_succeed',add:target.school,drop:currentDrop.school,competing_owners:(claims||[]).filter(x=>Number(x.add_team_id)===addId&&Number(x.owner_id)!==oid).map(x=>ownerMap.get(Number(x.owner_id))?.name).filter(Boolean)});
    break;
   }
  }
  round++;
  if(round>100)break;
 }
 return NextResponse.json({ok:true,dry_run:true,period:key,waiver_order:order.map((o,i)=>({order:i+1,owner_id:o.owner_id,owner:o.owner_name,points:o.fantasy_points,point_differential:o.point_differential,draft_slot:o.draft_slot})),steps,summary:{successful:steps.filter(x=>x.status==='would_succeed').length,lost:steps.filter(x=>x.status==='lost_to_priority').length,invalid:steps.filter(x=>x.status==='invalid').length}});
}
