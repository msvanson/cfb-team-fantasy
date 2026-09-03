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

  if(
    !Number.isSafeInteger(id)||
    !['approve','reject'].includes(action)
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
      rejected_at:null
    }
    :{
      status:'rejected',
      rejected_at:new Date().toISOString(),
      approved_at:null
    };

  const {data,error}=await sb()
    .from('wheel_entries')
    .update(patch)
    .eq('id',id)
    .eq('season_id',1)
    .eq('status','pending')
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
      {ok:false,error:'That item is no longer pending'},
      {status:409}
    );
  }

  return NextResponse.json({
    ok:true,
    entry:data
  });
}
