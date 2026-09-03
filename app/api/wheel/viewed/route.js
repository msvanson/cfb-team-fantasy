import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {authenticatedProfileFromRequest} from '../../../../lib/user-auth';

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

export async function POST(req){
  const auth=await authenticatedProfileFromRequest(req);

  if(!auth.ok){
    return NextResponse.json(
      {ok:false,error:auth.error},
      {status:auth.status}
    );
  }

  if(!auth.profile.owner_id&&auth.profile.role!=='commissioner'){
    return NextResponse.json(
      {ok:false,error:'Your account is not assigned to the league'},
      {status:403}
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

  const drawId=Number(body?.draw_id);

  if(!Number.isSafeInteger(drawId)||drawId<1){
    return NextResponse.json(
      {ok:false,error:'Invalid draw'},
      {status:400}
    );
  }

  const s=sb();

  const {data:draw,error:drawError}=await s
    .from('wheel_draws')
    .select('id')
    .eq('id',drawId)
    .eq('season_id',1)
    .maybeSingle();

  if(drawError||!draw){
    return NextResponse.json(
      {ok:false,error:'Draw not found'},
      {status:404}
    );
  }

  const {error}=await s
    .from('wheel_views')
    .upsert(
      {
        draw_id:drawId,
        user_id:auth.user.id,
        viewed_at:new Date().toISOString()
      },
      {
        onConflict:'draw_id,user_id',
        ignoreDuplicates:true
      }
    );

  if(error){
    return NextResponse.json(
      {ok:false,error:'Unable to save view status'},
      {status:500}
    );
  }

  return NextResponse.json({ok:true});
}
