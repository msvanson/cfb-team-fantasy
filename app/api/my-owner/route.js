import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

export const dynamic='force-dynamic';

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

export async function GET(req){
  const token=(req.headers.get('authorization')||'')
    .replace(/^Bearer\s+/,'');

  if(!token){
    return NextResponse.json(
      {owner_id:null},
      {status:401}
    );
  }

  const s=sb();

  const {
    data:{user},
    error:userError
  }=await s.auth.getUser(token);

  if(userError||!user){
    return NextResponse.json(
      {owner_id:null},
      {status:401}
    );
  }

  const {data,error}=await s
    .from('user_profiles')
    .select('owner_id')
    .eq('user_id',user.id)
    .maybeSingle();

  if(error){
    return NextResponse.json(
      {owner_id:null},
      {status:500}
    );
  }

  return NextResponse.json({
    owner_id:data?.owner_id||null
  });
}
