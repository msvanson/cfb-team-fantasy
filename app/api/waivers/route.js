import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {authenticatedProfileFromRequest} from '../../../lib/user-auth';
const sb=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

function eligibleDrops(roster,target){
 // A legal drop can be:
 // 1) a roster team from the conference being added, OR
 // 2) either team from the roster's currently doubled conference.
 // The latter works because dropping either doubled-conference team frees the Flex.
 const counts=new Map();
 for(const t of roster)counts.set(t.conference_code,(counts.get(t.conference_code)||0)+1);
 const doubled=new Set([...counts.entries()].filter(([,n])=>n>1).map(([c])=>c));
 return roster.filter(t=>t.conference_code===target.conference_code||doubled.has(t.conference_code));
}
function period(){
 const now=new Date(), year=now.getUTCFullYear();
 // Phase 1 uses the known 2026 custom fantasy periods. Waiver runs occur only after a custom week ends.
 const weeks=[['W1','2026-09-07T23:59:00-04:00'],['W2','2026-09-13T23:59:00-04:00'],['W3','2026-09-20T23:59:00-04:00'],['W4','2026-09-27T23:59:00-04:00'],['W5','2026-10-04T23:59:00-04:00'],['W6','2026-10-11T23:59:00-04:00'],['W7','2026-10-18T23:59:00-04:00'],['W8','2026-10-25T23:59:00-04:00'],['W9','2026-11-01T23:59:00-05:00'],['W10','2026-11-08T23:59:00-05:00'],['W11','2026-11-15T23:59:00-05:00'],['W12','2026-11-22T23:59:00-05:00'],['W13','2026-11-29T23:59:00-05:00']];
 const n=Date.now();const next=weeks.find(x=>new Date(x[1]).getTime()>n);
 return next?{key:next[0],deadline:next[1],closed:false}:{key:'CLOSED',deadline:null,closed:true};
}
export async function GET(req){
 const auth=await authenticatedProfileFromRequest(req);if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
 const s=sb(),ownerId=auth.profile.owner_id;if(!ownerId)return NextResponse.json({ok:false,error:'Account is not assigned to a roster'},{status:403});
 const [teamsResult, claimsResult, projectionsResult] = await Promise.all([
   s.from('team_directory').select('*').eq('season_id',1),
   s.from('waiver_claims').select('*').eq('season_id',1).eq('owner_id',ownerId).eq('status','pending').order('priority'),
   s.from('latest_team_projections').select('team_id,projected_points').eq('season_id',1)
 ]);
 if (teamsResult.error || claimsResult.error || projectionsResult.error) {
  return NextResponse.json(
    { ok: false, error: 'Waiver data temporarily unavailable' },
    { status: 500 }
  );
}

const teams = teamsResult.data || [];
const claims = claimsResult.data || [];
const projections = projectionsResult.data || [];
 const projectionMap=new Map((projections||[]).map(x=>[Number(x.team_id),Number(x.projected_points)]));
 const roster=(teams||[]).filter(t=>t.owner_id===ownerId);
 const available=(teams||[]).filter(t=>!t.is_owned).map(t=>({...t,eligible:Number(t.wins||0)<=4,season_projected_points:projectionMap.has(Number(t.team_id))?projectionMap.get(Number(t.team_id)):null,eligible_drops:Number(t.wins||0)<=4?eligibleDrops(roster,t).map(x=>({team_id:x.team_id,school:x.school,conference_code:x.conference_code,roster_slot:x.roster_slot})):[]}));
 return NextResponse.json({ok:true,profile:auth.profile,period:period(),available,eligible_count:available.filter(t=>t.eligible).length,roster,claims:claims||[]});
}
export async function POST(req){
 const auth=await authenticatedProfileFromRequest(req);if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
 const ownerId=auth.profile.owner_id;if(!ownerId)return NextResponse.json({ok:false,error:'Account is not assigned to a roster'},{status:403});
 const body=await req.json(),s=sb(),wp=period();if(wp.closed)return NextResponse.json({ok:false,error:'Waivers are closed'},{status:400});
 const {data:teams}=await s.from('team_directory').select('*').eq('season_id',1);
 const target=(teams||[]).find(t=>Number(t.team_id)===Number(body.add_team_id));
 const roster=(teams||[]).filter(t=>Number(t.owner_id)===Number(ownerId));
 const drop=roster.find(t=>Number(t.team_id)===Number(body.drop_team_id));
 if(!target||target.is_owned)return NextResponse.json({ok:false,error:'That team is not available'},{status:400});
 if(Number(target.wins||0)>=5)return NextResponse.json({ok:false,error:'Teams with 5 or more wins cannot be claimed'},{status:400});
 if(!drop||!eligibleDrops(roster,target).some(t=>t.team_id===drop.team_id))return NextResponse.json({ok:false,error:'That drop would violate roster construction rules'},{status:400});
 const {data:max}=await s.from('waiver_claims').select('priority').eq('season_id',1).eq('owner_id',ownerId).eq('waiver_period_key',wp.key).eq('status','pending').order('priority',{ascending:false}).limit(1);
 const priority=(max?.[0]?.priority||0)+1;
 const {data,error}=await s.from('waiver_claims').insert({season_id:1,owner_id:ownerId,add_team_id:target.team_id,drop_team_id:drop.team_id,priority,waiver_period_key:wp.key}).select().single();
 if(error)return NextResponse.json({ok:false,error:error.message},{status:400});
 return NextResponse.json({ok:true,claim:data});
}
export async function DELETE(req){
 const auth=await authenticatedProfileFromRequest(req);if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
 const {id}=await req.json(),s=sb();
 const {error}=await s.from('waiver_claims').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',id).eq('owner_id',auth.profile.owner_id).eq('status','pending');
 return NextResponse.json(error?{ok:false,error:error.message}:{ok:true},{status:error?400:200});
}

export async function PATCH(req){
 const auth=await authenticatedProfileFromRequest(req);if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
 const ownerId=auth.profile.owner_id;if(!ownerId)return NextResponse.json({ok:false,error:'Account is not assigned to a roster'},{status:403});
 const {id,direction}=await req.json();if(!['up','down'].includes(direction))return NextResponse.json({ok:false,error:'Invalid direction'},{status:400});
 const s=sb(),wp=period();const {data:claims,error}=await s.from('waiver_claims').select('id,priority').eq('season_id',1).eq('owner_id',ownerId).eq('waiver_period_key',wp.key).eq('status','pending').order('priority');
 if(error)return NextResponse.json({ok:false,error:error.message},{status:400});
 const i=(claims||[]).findIndex(c=>Number(c.id)===Number(id)),j=direction==='up'?i-1:i+1;if(i<0||j<0||j>=claims.length)return NextResponse.json({ok:true});
 const a=claims[i],b=claims[j],temp=1000000+Number(a.id);
 let e=(await s.from('waiver_claims').update({priority:temp,updated_at:new Date().toISOString()}).eq('id',a.id).eq('owner_id',ownerId).eq('status','pending')).error;
 if(!e)e=(await s.from('waiver_claims').update({priority:a.priority,updated_at:new Date().toISOString()}).eq('id',b.id).eq('owner_id',ownerId).eq('status','pending')).error;
 if(!e)e=(await s.from('waiver_claims').update({priority:b.priority,updated_at:new Date().toISOString()}).eq('id',a.id).eq('owner_id',ownerId).eq('status','pending')).error;
 return NextResponse.json(e?{ok:false,error:e.message}:{ok:true},{status:e?400:200});
}
