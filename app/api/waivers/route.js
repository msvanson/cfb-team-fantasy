import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {authenticatedProfileFromRequest} from '../../../lib/user-auth';
import {getOpenWaiverPeriod} from '../../../lib/waiver-periods';

const sb=()=>createClient(
 process.env.NEXT_PUBLIC_SUPABASE_URL,
 process.env.SUPABASE_SERVICE_ROLE_KEY,
 {auth:{persistSession:false}}
);

function eligibleDrops(roster,target){
 // A legal drop can be:
 // 1) a roster team from the conference being added, OR
 // 2) either team from the roster's currently doubled conference.
 // The latter works because dropping either doubled-conference team frees the Flex.
 const counts=new Map();

 for(const t of roster){
  counts.set(
   t.conference_code,
   (counts.get(t.conference_code)||0)+1
  );
 }

 const doubled=new Set(
  [...counts.entries()]
   .filter(([,n])=>n>1)
   .map(([c])=>c)
 );

 return roster.filter(
  t=>
   t.conference_code===target.conference_code||
   doubled.has(t.conference_code)
 );
}

export async function GET(req){
 const auth=await authenticatedProfileFromRequest(req);

 if(!auth.ok){
  return NextResponse.json(
   {ok:false,error:auth.error},
   {status:auth.status}
  );
 }

 const s=sb();
 const ownerId=auth.profile.owner_id;

 if(!ownerId){
  return NextResponse.json(
   {
    ok:false,
    error:'Account is not assigned to a roster'
   },
   {status:403}
  );
 }

 const [
  teamsResult,
  claimsResult,
  projectionsResult
 ]=await Promise.all([
  s.from('team_directory')
   .select('*')
   .eq('season_id',1),

  s.from('waiver_claims')
   .select('*')
   .eq('season_id',1)
   .eq('owner_id',ownerId)
   .eq('status','pending')
   .order('priority'),

  s.from('latest_team_projections')
   .select('team_id,projected_points')
   .eq('season_id',1)
 ]);

 if(
  teamsResult.error||
  claimsResult.error||
  projectionsResult.error
 ){
  return NextResponse.json(
   {
    ok:false,
    error:'Waiver data temporarily unavailable'
   },
   {status:500}
  );
 }

 const teams=teamsResult.data||[];
 const claims=claimsResult.data||[];
 const projections=projectionsResult.data||[];

 const projectionMap=new Map(
  projections.map(x=>[
   Number(x.team_id),
   Number(x.projected_points)
  ])
 );

 const roster=teams.filter(
  t=>t.owner_id===ownerId
 );

 const available=teams
  .filter(t=>!t.is_owned)
  .map(t=>({
   ...t,
   eligible:Number(t.wins||0)<=4,
   season_projected_points:
    projectionMap.has(Number(t.team_id))
     ?projectionMap.get(Number(t.team_id))
     :null,
   eligible_drops:
    Number(t.wins||0)<=4
     ?eligibleDrops(roster,t).map(x=>({
       team_id:x.team_id,
       school:x.school,
       conference_code:x.conference_code,
       roster_slot:x.roster_slot
      }))
     :[]
  }));

 return NextResponse.json({
  ok:true,
  profile:auth.profile,
  period:getOpenWaiverPeriod(),
  available,
  eligible_count:
   available.filter(t=>t.eligible).length,
  roster,
  claims
 });
}

export async function POST(req){
 const auth=await authenticatedProfileFromRequest(req);

 if(!auth.ok){
  return NextResponse.json(
   {ok:false,error:auth.error},
   {status:auth.status}
  );
 }

 const ownerId=auth.profile.owner_id;

 if(!ownerId){
  return NextResponse.json(
   {
    ok:false,
    error:'Account is not assigned to a roster'
   },
   {status:403}
  );
 }

 const body=await req.json();
 const s=sb();
 const wp=getOpenWaiverPeriod();

 if(wp.closed){
  return NextResponse.json(
   {ok:false,error:'Waivers are closed'},
   {status:400}
  );
 }

 const {
  data:teams,
  error:teamsError
 }=await s
  .from('team_directory')
  .select('*')
  .eq('season_id',1);

 if(teamsError){
  return NextResponse.json(
   {
    ok:false,
    error:'Waiver data temporarily unavailable'
   },
   {status:500}
  );
 }

 const target=(teams||[]).find(
  t=>Number(t.team_id)===Number(body.add_team_id)
 );

 const roster=(teams||[]).filter(
  t=>Number(t.owner_id)===Number(ownerId)
 );

 const drop=roster.find(
  t=>Number(t.team_id)===Number(body.drop_team_id)
 );

 if(!target||target.is_owned){
  return NextResponse.json(
   {
    ok:false,
    error:'That team is not available'
   },
   {status:400}
  );
 }

 if(Number(target.wins||0)>=5){
  return NextResponse.json(
   {
    ok:false,
    error:'Teams with 5 or more wins cannot be claimed'
   },
   {status:400}
  );
 }

 if(
  !drop||
  !eligibleDrops(roster,target).some(
   t=>t.team_id===drop.team_id
  )
 ){
  return NextResponse.json(
   {
    ok:false,
    error:'That drop would violate roster construction rules'
   },
   {status:400}
  );
 }

 const {
  data:max,
  error:priorityError
 }=await s
  .from('waiver_claims')
  .select('priority')
  .eq('season_id',1)
  .eq('owner_id',ownerId)
  .eq('waiver_period_key',wp.key)
  .eq('status','pending')
  .order('priority',{ascending:false})
  .limit(1);

 if(priorityError){
  return NextResponse.json(
   {
    ok:false,
    error:'Unable to submit waiver claim right now'
   },
   {status:500}
  );
 }

 const priority=(max?.[0]?.priority||0)+1;

 const {
  data,
  error
 }=await s
  .from('waiver_claims')
  .insert({
   season_id:1,
   owner_id:ownerId,
   add_team_id:target.team_id,
   drop_team_id:drop.team_id,
   priority,
   waiver_period_key:wp.key
  })
  .select()
  .single();

 if(error){
  return NextResponse.json(
   {
    ok:false,
    error:'Unable to submit waiver claim right now'
   },
   {status:400}
  );
 }

 return NextResponse.json({
  ok:true,
  claim:data
 });
}

export async function DELETE(req){
 const auth=await authenticatedProfileFromRequest(req);

 if(!auth.ok){
  return NextResponse.json(
   {ok:false,error:auth.error},
   {status:auth.status}
  );
 }

 const {id}=await req.json();
 const s=sb();
 const wp=getOpenWaiverPeriod();

 if(wp.closed){
  return NextResponse.json(
   {ok:false,error:'Waivers are closed'},
   {status:400}
  );
 }

 const {error}=await s
  .from('waiver_claims')
  .update({
   status:'cancelled',
   updated_at:new Date().toISOString()
  })
  .eq('id',id)
  .eq('owner_id',auth.profile.owner_id)
  .eq('waiver_period_key',wp.key)
  .eq('status','pending');

 return NextResponse.json(
  error
   ?{
     ok:false,
     error:'Unable to cancel waiver claim right now'
    }
   :{ok:true},
  {status:error?400:200}
 );
}

export async function PATCH(req){
 const auth=await authenticatedProfileFromRequest(req);

 if(!auth.ok){
  return NextResponse.json(
   {ok:false,error:auth.error},
   {status:auth.status}
  );
 }

 const ownerId=auth.profile.owner_id;

 if(!ownerId){
  return NextResponse.json(
   {
    ok:false,
    error:'Account is not assigned to a roster'
   },
   {status:403}
  );
 }

 const {id,direction}=await req.json();

 if(!['up','down'].includes(direction)){
  return NextResponse.json(
   {
    ok:false,
    error:'Invalid direction'
   },
   {status:400}
  );
 }

 const s=sb();
 const wp=getOpenWaiverPeriod();

 if(wp.closed){
  return NextResponse.json(
   {ok:false,error:'Waivers are closed'},
   {status:400}
  );
 }

 const {
  data:claims,
  error
 }=await s
  .from('waiver_claims')
  .select('id,priority')
  .eq('season_id',1)
  .eq('owner_id',ownerId)
  .eq('waiver_period_key',wp.key)
  .eq('status','pending')
  .order('priority');

 if(error){
  return NextResponse.json(
   {
    ok:false,
    error:'Unable to reorder waiver claims right now'
   },
   {status:400}
  );
 }

 const i=(claims||[]).findIndex(
  c=>Number(c.id)===Number(id)
 );

 const j=
  direction==='up'
   ?i-1
   :i+1;

 if(
  i<0||
  j<0||
  j>=claims.length
 ){
  return NextResponse.json({ok:true});
 }

 const a=claims[i];
 const b=claims[j];
 const temp=1000000+Number(a.id);

 let updateError=(
  await s
   .from('waiver_claims')
   .update({
    priority:temp,
    updated_at:new Date().toISOString()
   })
   .eq('id',a.id)
   .eq('owner_id',ownerId)
   .eq('status','pending')
 ).error;

 if(!updateError){
  updateError=(
   await s
    .from('waiver_claims')
    .update({
     priority:a.priority,
     updated_at:new Date().toISOString()
    })
    .eq('id',b.id)
    .eq('owner_id',ownerId)
    .eq('status','pending')
  ).error;
 }

 if(!updateError){
  updateError=(
   await s
    .from('waiver_claims')
    .update({
     priority:b.priority,
     updated_at:new Date().toISOString()
    })
    .eq('id',a.id)
    .eq('owner_id',ownerId)
    .eq('status','pending')
  ).error;
 }

 return NextResponse.json(
  updateError
   ?{
     ok:false,
     error:'Unable to reorder waiver claims right now'
    }
   :{ok:true},
  {status:updateError?400:200}
 );
}
