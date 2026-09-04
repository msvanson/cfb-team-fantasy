import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';

const sb=()=>createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth:{
      persistSession:false,
      autoRefreshToken:false,
      detectSessionInUrl:false
    }
  }
);

export async function GET(){
  if(!await isAdminAuthenticated()){
    return NextResponse.json(
      {ok:false,error:'Unauthorized'},
      {status:401}
    );
  }

  const {data,error}=await sb()
    .from('wheel_entries')
    .select(
      'id,item_text,status,created_at,approved_at,user_profiles!wheel_entries_submitted_by_fkey(username),owners(name)'
    )
    .eq('season_id',1)
    .in('status',['pending','approved'])
    .order('created_at',{ascending:true});

  if(error){
    return NextResponse.json(
      {ok:false,error:'Unable to load wheel approvals'},
      {status:500}
    );
  }

  return NextResponse.json({
    ok:true,
    entries:data||[]
  });
}

export async function POST(req){
  if(!await isAdminAuthenticated()){
    return NextResponse.json(
      {ok:false,error:'Unauthorized'},
      {status:401}
    );
  }

  let body;

  try{
    body=await req.json();
  }catch{
    return NextResponse.json(
      {ok:false,error:'Invalid request'},
      {status:400}
    );
  }

  const id=Number(body?.id);
  const action=body?.action;

  if(action==='force_spin'){
    const {data,error}=await sb().rpc(
      'force_wheel_spin',
      {p_season_id:1}
    );

    if(error){
      return NextResponse.json(
        {ok:false,error:'Unable to force the wheel spin'},
        {status:500}
      );
    }

    if(!data?.drawn){
      return NextResponse.json(
        {
          ok:false,
          error:data?.reason==='no_approved_entries'
            ?'There are no approved items on the wheel'
            :'The wheel could not be spun'
        },
        {status:409}
      );
    }

    return NextResponse.json({
      ok:true,
      draw:data
    });
  }

  if(
    !Number.isSafeInteger(id)||
    !['approve','reject','remove'].includes(action)
  ){
    return NextResponse.json(
      {ok:false,error:'Invalid review action'},
      {status:400}
    );
  }

  const patch=action==='approve'
    ?{
      status:'approved',
      approved_at:new Date().toISOString(),
      rejected_at:null,
      removed_at:null
    }
    :action==='reject'
      ?{
        status:'rejected',
        rejected_at:new Date().toISOString(),
        approved_at:null,
        removed_at:null
      }
      :{
        status:'removed',
        removed_at:new Date().toISOString()
      };

  const expectedStatus=
    action==='remove'
      ?'approved'
      :'pending';

  const {data,error}=await sb()
    .from('wheel_entries')
    .update(patch)
    .eq('id',id)
    .eq('season_id',1)
    .eq('status',expectedStatus)
    .select('id,status')
    .maybeSingle();

  if(error){
    return NextResponse.json(
      {ok:false,error:'Unable to review that item'},
      {status:500}
    );
  }

  if(!data){
    return NextResponse.json(
      {
        ok:false,
        error:action==='remove'
          ?'That item is no longer on the wheel'
          :'That item is no longer pending'
      },
      {status:409}
    );
  }

  return NextResponse.json({
    ok:true,
    entry:data
  });
}
